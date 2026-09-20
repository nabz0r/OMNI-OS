#!/usr/bin/env python3
"""Non-privileged enrollment and cross-language protocol tests. No network changes."""
import base64
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("omni_client", HERE / "client.py")
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)


class ConfigurationTests(unittest.TestCase):
    def test_control_protocol_matches_rust_golden_vector(self):
        request = dict(version=1, client_id="client-01", issued_at=10000,
                       nonce="AAECAwQFBgcICQoLDA0ODw==", action="prepare_rotation", epoch=1,
                       public_key="AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=")
        mac = hmac.new(bytes(range(32)), b"OMNI-KNOCK-v1\0" + client.canonical(request), hashlib.sha256).digest()
        self.assertEqual(base64.b64encode(mac).decode(), "I54ExA+CJAgRIDaRWfXxdX2aUNgQQhBPw30nZcGISh8=")

    def test_persistence_filters_runtime_state_and_keeps_secrets_private(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "client.json"
            client.persist(path, dict(epoch=1, private_key="public-test-data", _owns_route=True))
            self.assertEqual(json.loads(path.read_text()), dict(epoch=1, private_key="public-test-data"))
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_enrollment_generates_independent_peers_and_refuses_overwrite(self):
        binary = Path(os.environ.get("OMNI_VPN_BINARY", HERE.parents[1] / "target/debug/omni-vpn"))
        self.assertTrue(binary.is_file(), f"Build omni-vpn first or set OMNI_VPN_BINARY: {binary}")
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "private-enrollment"
            args = ["python3", str(HERE / "enroll.py"), "--endpoint", "127.0.0.1", "--output",
                    str(destination), "--clients", "6", "--binary", str(binary)]
            completed = subprocess.run(args, check=True, capture_output=True, text=True)
            self.assertFalse(json.loads(completed.stdout)["connected"])
            clients = [json.loads(path.read_text()) for path in sorted((destination / "clients").glob("*.json"))]
            self.assertEqual(len(clients), 6)
            for key in ("private_key", "public_key", "knock_secret"):
                self.assertEqual(len({value[key] for value in clients}), 6)
                self.assertTrue(all(len(base64.b64decode(value[key], validate=True)) == 32 for value in clients))
            self.assertEqual(len({value["server_public_key"] for value in clients}), 1)
            self.assertEqual(len({address for value in clients for address in value["addresses"]}), 12)
            self.assertTrue(all(value["rotation_seconds"] == 1800 for value in clients))
            self.assertEqual(destination.stat().st_mode & 0o777, 0o700)
            for path in destination.rglob("*"):
                self.assertEqual(path.stat().st_mode & 0o777, 0o700 if path.is_dir() else 0o600)
            self.assertNotEqual(subprocess.run(args, capture_output=True).returncode, 0)


if __name__ == "__main__":
    unittest.main()
