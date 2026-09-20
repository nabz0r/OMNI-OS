#!/usr/bin/env python3
"""Explicitly privileged macOS boringtun supervisor. Never invoked by run.sh.

The HMAC control channel authorizes admissions, not application data. WireGuard
encrypts IP packets and provider TLS is independently established by the gateway.
"""
import argparse
import base64
import fcntl
import hashlib
import hmac
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import subprocess
import tempfile
import time


def canonical(value):
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()


def persist(path, value):
    value = {key: item for key, item in value.items() if not key.startswith("_")}
    temporary = path.with_suffix(".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "wb") as output:
        output.write(canonical(value))
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def command(*args, check=True):
    return subprocess.run(args, check=check, capture_output=True, text=True)


def control(config, action, epoch, public_key=None):
    # Domain and field order match crates/omni-vpn/src/knock.rs.
    timestamp = int(time.time())
    request = dict(version=1, client_id=config["client_id"], issued_at=timestamp,
                   nonce=base64.b64encode(secrets.token_bytes(16)).decode(),
                   action=action, epoch=epoch, public_key=public_key)
    secret = base64.b64decode(config["knock_secret"], validate=True)
    signature = hmac.new(secret, b"OMNI-KNOCK-v1\0" + canonical(request), hashlib.sha256).digest()
    envelope = dict(request=request, mac=base64.b64encode(signature).decode())
    host, port = config["knock_endpoint"].rsplit(":", 1)
    ipaddress.IPv4Address(host)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.settimeout(3)
        sock.connect((host, int(port)))
        sock.send(canonical(envelope))
        response = json.loads(sock.recv(2048))
    ack = response["ack"]
    expected = hmac.new(secret, b"OMNI-KNOCK-ACK-v1\0" + canonical(ack), hashlib.sha256).digest()
    if not hmac.compare_digest(expected, base64.b64decode(response["mac"], validate=True)):
        raise RuntimeError("invalid acknowledgement MAC")
    for field in ("client_id", "nonce", "epoch", "public_key"):
        if ack[field] != request[field]:
            raise RuntimeError("acknowledgement does not match request")
    now = int(time.time())
    if abs(ack["accepted_at"] - now) > 30 or not now < ack["expires_at"] <= ack["accepted_at"] + 120:
        raise RuntimeError("expired acknowledgement")
    return ack


class Tunnel:
    def __init__(self, config, private_key, epoch):
        self.directory = tempfile.TemporaryDirectory(prefix="omni-utun-")
        self.process = None
        self.name = None
        name_file = Path(self.directory.name) / "interface"
        key_file = Path(self.directory.name) / "private.key"
        key_file.write_text(private_key + "\n")
        key_file.chmod(0o600)
        environment = dict(os.environ, WG_TUN_NAME_FILE=str(name_file))
        # This explicitly privileged supervisor also controls wg/utun. BoringTun's
        # default drop path fails under sudo when USER resolves to root.
        self.process = subprocess.Popen(["boringtun-cli", "-f", "--disable-drop-privileges", "utun"], env=environment,
                                        stdout=subprocess.DEVNULL, stderr=None)
        try:
            for _ in range(100):
                if name_file.exists() and name_file.read_text().strip():
                    break
                if self.process.poll() is not None:
                    raise RuntimeError("boringtun exited while creating utun")
                time.sleep(0.05)
            self.name = name_file.read_text().strip()
            if not re.fullmatch(r"utun[0-9]+", self.name):
                raise RuntimeError("invalid interface returned by boringtun")
            self.address = config["addresses"][epoch % 2]
            command("wg", "set", self.name, "private-key", str(key_file), "peer",
                    config["server_public_key"], "endpoint", config["endpoint"],
                    "allowed-ips", config["server_tunnel_ip"] + "/32", "persistent-keepalive", "0")
            command("ifconfig", self.name, "inet", self.address, self.address,
                    "netmask", "255.255.255.255", "mtu", "1280", "up")
        except BaseException:
            self.close()
            raise

    def route(self, config):
        destination = config["server_tunnel_ip"]
        operation = "change" if config.get("_owns_route", False) else "add"
        command("route", "-n", operation, "-host", destination, "-interface", self.name)
        config["_owns_route"] = True

    def handshake(self, config):
        for _ in range(8):
            command("ping", "-S", self.address, "-c", "1", "-W", "1000", config["server_tunnel_ip"], check=False)
            result = command("wg", "show", self.name, "latest-handshakes")
            for line in result.stdout.splitlines():
                public, timestamp = line.split()
                if public == config["server_public_key"] and int(timestamp) > 0:
                    return
            time.sleep(0.25)
        raise RuntimeError("new WireGuard identity did not complete a handshake")

    def close(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        self.directory.cleanup()


def rotate(config, config_path, old):
    if "pending" not in config:
        private = command("wg", "genkey").stdout.strip()
        public = subprocess.run(["wg", "pubkey"], input=private + "\n", text=True,
                                check=True, capture_output=True).stdout.strip()
        config["pending"] = dict(private_key=private, public_key=public, epoch=config["epoch"] + 1)
        persist(config_path, config)
    pending = config["pending"]
    try:
        control(config, "prepare_rotation", pending["epoch"], pending["public_key"])
    except (TimeoutError, socket.timeout):
        # A crash may have occurred after the server committed but before local persistence.
        control(config, "commit_rotation", pending["epoch"], pending["public_key"])
    new = Tunnel(config, pending["private_key"], pending["epoch"])
    try:
        new.route(config)
        new.handshake(config)
        control(config, "commit_rotation", pending["epoch"], pending["public_key"])
        config.update(pending)
        del config["pending"]
        config["next_rotation_at"] = int(time.time()) + config.get("rotation_seconds", 1800)
        persist(config_path, config)
        print(json.dumps({"state": "connected", "epoch": config["epoch"], "rotation": "acknowledged"}), flush=True)
        return new
    except BaseException:
        if old:
            old.route(config)
        new.close()
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()
    if os.uname().sysname != "Darwin" or os.geteuid() != 0:
        parser.error("macOS utun mode requires explicit sudo; no native extension is claimed")
    for executable in ("boringtun-cli", "wg", "ifconfig", "route", "ping"):
        if not shutil.which(executable):
            parser.error(f"install required executable: {executable}")
    config_path = args.config.resolve()
    if config_path.stat().st_mode & 0o077:
        parser.error("client configuration must have permissions 0600")
    config = json.loads(config_path.read_text())
    config.pop("_owns_route", None)
    config.setdefault("epoch", 0)
    config.setdefault("next_rotation_at", int(time.time()) + config.get("rotation_seconds", 1800))
    if not 60 <= config.get("rotation_seconds", 1800) <= 86400:
        parser.error("production rotation interval must be 60..86400 seconds (default 1800)")
    for field in ("private_key", "public_key", "server_public_key", "knock_secret"):
        if len(base64.b64decode(config[field], validate=True)) != 32:
            parser.error(f"invalid {field}")
    ipaddress.IPv4Address(config["server_tunnel_ip"])
    for address in config["addresses"]:
        if not ipaddress.IPv4Address(address).is_private:
            parser.error("tunnel addresses must be private IPv4")
    if len(config["addresses"]) != 2 or config["addresses"][0] == config["addresses"][1]:
        parser.error("two different rotation addresses are required")
    # A system-wide lock prevents two supervisors from competing for the private route.
    lock = open("/var/run/omni-utun.lock", "w")
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    current = None
    previous = []
    try:
        if "pending" in config:
            current = rotate(config, config_path, None)
        else:
            control(config, "open", config["epoch"])
            current = Tunnel(config, config["private_key"], config["epoch"])
            current.route(config)
            current.handshake(config)
        print(json.dumps({"state": "connected", "interface": current.name, "socks_url": config["socks_url"],
                          "rotation_seconds": config.get("rotation_seconds", 1800)}), flush=True)
        renew = time.monotonic() + 60
        while True:
            for entry in previous[:]:
                tunnel, expires = entry
                if time.monotonic() >= expires:
                    tunnel.close()
                    previous.remove(entry)
            if current.process.poll() is not None:
                raise RuntimeError("WireGuard process exited")
            if time.monotonic() >= renew:
                control(config, "open", config["epoch"])
                renew = time.monotonic() + 60
            if int(time.time()) >= config["next_rotation_at"]:
                old = current
                current = rotate(config, config_path, old)
                previous.append((old, time.monotonic() + 30))
                renew = time.monotonic() + 60
            time.sleep(1)
    finally:
        if config.get("_owns_route", False):
            command("route", "-n", "delete", "-host", config["server_tunnel_ip"], check=False)
        if current:
            current.close()
        for tunnel, _ in previous:
            tunnel.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
