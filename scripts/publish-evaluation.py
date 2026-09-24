#!/usr/bin/env python3
"""Publish pre-tested evaluation packages from a temporary release input branch.

No signing key, vault or provider credential belongs in release-input. The input
archive contains only the named public assets. It is reconstructed and checked
before a draft is created. The release becomes visible only after upload checks.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def digest(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def main():
    source = Path(sys.argv[1])
    manifest = json.loads((source / "manifest.json").read_text())
    tag = manifest["tag"]
    assert re.fullmatch(r"v\d+\.\d+\.\d+", tag), "Invalid version tag"
    version = tag[1:]
    revision = manifest["source_revision"]
    assert re.fullmatch(r"[a-f0-9]{40}", revision)
    assert run("git", "rev-parse", f"{tag}^{{}}") == revision, "Tag/source mismatch"
    names = {
        f"OMNI-{version}-macOS-arm64.dmg",
        f"OMNI-{version}-macOS-arm64.app.zip",
        f"OMNI-{version}-android.apk",
        f"OMNI-{version}-mvp.zip",
        "SHA256SUMS",
        "INSTALL.md",
    }
    entries = manifest["assets"]
    assert len(entries) == len(names) and {x["name"] for x in entries} == names
    with tempfile.TemporaryDirectory(prefix="omni-publish-") as directory:
        staging = Path(directory)
        archive = staging / "input.tar.gz"
        parts = sorted(source.glob("payload.part*"))
        assert parts and len(parts) <= 32
        assert sum(p.stat().st_size for p in parts) <= 1024**3
        with archive.open("wb") as output:
            for part in parts:
                with part.open("rb") as handle:
                    shutil.copyfileobj(handle, output)
        assert digest(archive) == manifest["archive_sha256"], "Input archive mismatch"
        assets = staging / "assets"
        assets.mkdir()
        with tarfile.open(archive, "r:gz") as package:
            members = package.getmembers()
            assert len(members) == len(names) and {m.name for m in members} == names
            assert all(m.isfile() and m.size <= 512 * 1024**2 for m in members)
            for member in members:
                with package.extractfile(member) as handle, (assets / member.name).open("wb") as output:
                    shutil.copyfileobj(handle, output)
        for entry in entries:
            path = assets / entry["name"]
            assert path.stat().st_size == entry["bytes"]
            assert digest(path) == entry["sha256"], f"Hash mismatch: {path.name}"
        with zipfile.ZipFile(assets / f"OMNI-{version}-mvp.zip") as bundle:
            prefix = f"OMNI-{version}-mvp/"
            record = json.loads(bundle.read(prefix + "delivery.json"))
            assert record["version"] == version
            for platform in ("macos", "android"):
                assert record["platforms"][platform]["source_revision"] == revision
            for platform in ("macos", "android"):
                build = json.loads(bundle.read(prefix + f"Evidence/{platform}-build.json"))
                assert build["status"] == "built" and build["source_dirty"] is False
                assert build["source_revision"] == revision and build["version"] == version
                if platform == "macos":
                    assert build["smoke"]["status"] == "passed"
            acceptance = json.loads(bundle.read(prefix + "Evidence/android-native-acceptance.json"))
            assert acceptance["status"] == "passed" and len(acceptance["assertions"]) >= 28
            assert all(v is True for v in acceptance["assertions"].values())
            upgrade = json.loads(bundle.read(prefix + "Evidence/android-upgrade.json"))
            assert upgrade["status"] == "passed" and all(v is True for v in upgrade["assertions"].values())
            apk_hash = digest(assets / f"OMNI-{version}-android.apk")
            assert acceptance["apk_sha256"] == upgrade["to_apk_sha256"] == apk_hash
            keystore = json.loads(bundle.read(prefix + "Evidence/android-keystore-tests.json"))
            assert keystore["status"] == "passed" and keystore["tests"] == 5
            for entry in record["packages"]:
                name = Path(entry["file"]).name
                assert digest(assets / name) == entry["sha256"]
                assert hashlib.sha256(bundle.read(prefix + entry["file"])).hexdigest() == entry["sha256"]
        if "--verify-only" in sys.argv:
            print(f"Verified {len(entries)} release assets for {tag} at {revision}.")
            return
        assert os.environ.get("GITHUB_ACTIONS") == "true", "Publication runs in GitHub Actions"
        subprocess.run([
            "gh", "release", "create", tag, "--verify-tag", "--draft", "--prerelease",
            "--title", manifest["title"], "--notes-file", str(source / "release-notes.md"),
            *[str(assets / name) for name in sorted(names)],
        ], check=True)
        release = json.loads(run("gh", "api", f"repos/{os.environ['GH_REPO']}/releases/tags/{tag}"))
        assert release["draft"] and release["prerelease"] and release["tag_name"] == tag
        uploaded = {item["name"]: item for item in release["assets"]}
        assert set(uploaded) == names
        for entry in entries:
            item = uploaded[entry["name"]]
            assert item["state"] == "uploaded" and item["size"] == entry["bytes"]
            assert item["digest"] == "sha256:" + entry["sha256"]
        subprocess.run(["gh", "release", "edit", tag, "--draft=false"], check=True)
        print(f"Published {tag}: {len(entries)} uploaded asset hashes verified.")


if __name__ == "__main__":
    main()
