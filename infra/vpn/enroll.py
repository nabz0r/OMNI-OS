#!/usr/bin/env python3
"""Create private enrollment files only; never configure the host network."""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import subprocess


def write_private(path, content):
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as output:
        output.write(content)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", required=True, help="Public IPv4 address actually assigned to the deployed server")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--clients", type=int, default=6)
    parser.add_argument("--binary", type=Path, default=Path(__file__).resolve().parents[2] / "target/release/omni-vpn")
    args = parser.parse_args()
    address = ipaddress.IPv4Address(args.endpoint)
    if not 1 <= args.clients <= 32:
        parser.error("clients must be 1..32")
    if not args.binary.is_file():
        parser.error("build the key generator first: cargo build -p omni-vpn --release")
    args.output.mkdir(parents=True, exist_ok=False, mode=0o700)
    (args.output / "clients").mkdir(mode=0o700)
    binary = str(args.binary.resolve())
    def keys():
        return json.loads(subprocess.check_output([binary, "keygen"], text=True))
    server = keys()
    write_private(args.output / "server.key", server["private_key"] + "\n")
    enrollments = []
    for index in range(args.clients):
        key = keys()
        identity = f"client-{index + 1:02}"
        addresses = [f"10.77.{index + 1}.2", f"10.77.{index + 1}.3"]
        enrollments.append(dict(id=identity, knock_secret=key["knock_secret"], public_key=key["public_key"],
                                addresses=[item + "/32" for item in addresses]))
        config = dict(client_id=identity, private_key=key["private_key"], public_key=key["public_key"],
                      knock_secret=key["knock_secret"], server_public_key=server["public_key"], epoch=0,
                      addresses=addresses, server_tunnel_ip="10.77.0.1", endpoint=f"{address}:51820",
                      knock_endpoint=f"{address}:51821", socks_url="socks5h://10.77.0.1:1080",
                      rotation_seconds=1800, overlap_seconds=30)
        write_private(args.output / "clients" / (identity + ".json"), json.dumps(config, indent=2) + "\n")
    write_private(args.output / "enrollments.json", json.dumps(dict(clients=enrollments), indent=2) + "\n")
    # Static provisioning is only generated after the operator supplied the real endpoint.
    print(json.dumps(dict(created=str(args.output.resolve()), clients=args.clients, server_public_key=server["public_key"],
                          endpoint=f"{address}:51820", connected=False)))


if __name__ == "__main__":
    main()
