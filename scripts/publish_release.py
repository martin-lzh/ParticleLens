"""Publish the current stable version using packages from the successful CI run."""

import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def release_assets(root, version):
    names = [
        f"ParticleLens-Windows-Setup-v{version}.exe",
        f"ParticleLens-Windows-OneFile-v{version}.exe",
        f"ParticleLens-Windows-v{version}.zip",
    ]
    directory = root / "release"
    checksums = {}
    for line in (directory / "SHA256SUMS.txt").read_text().splitlines():
        digest, name = line.split(maxsplit=1)
        if name in checksums:
            raise ValueError(f"Duplicate checksum: {name}")
        checksums[name] = digest.lower()
    if set(checksums) != set(names):
        raise ValueError("Checksums must cover exactly the three versioned Windows packages")
    for name in names:
        path = directory / name
        if not path.is_file() or not path.stat().st_size:
            raise ValueError(f"Missing or empty package: {name}")
        with path.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        if digest != checksums[name]:
            raise ValueError(f"Checksum mismatch: {name}")
    return [str(directory / name) for name in [*names, "SHA256SUMS.txt"]]


def publish(root):
    if (
        os.environ.get("GITHUB_EVENT_NAME") != "push"
        or os.environ.get("GITHUB_REF") != "refs/heads/main"
    ):
        raise ValueError("Releases require a main branch push")
    sha = os.environ["GITHUB_SHA"]
    if run("git", "rev-parse", "HEAD") != sha:
        raise ValueError("Checkout does not match the tested commit")
    version = json.loads((root / "package.json").read_text())["version"]
    if not re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", version):
        raise ValueError("Expected a stable major.minor.patch version")
    tag = f"v{version}"
    pages = json.loads(run("gh", "api", "--paginate", "--slurp", "repos/{owner}/{repo}/releases"))
    existing = next((item for page in pages for item in page if item["tag_name"] == tag), None)
    if existing and not existing["draft"]:
        print(f"{tag} is already published; leaving it unchanged.")
        return
    tags = run("git", "tag", "--list", tag).splitlines()
    if tags:
        if run("git", "rev-list", "-n", "1", tag) != sha:
            raise ValueError(f"{tag} already points to a different commit")
    elif existing and existing["target_commitish"] != sha:
        raise ValueError("Existing draft targets a different commit")
    assets = release_assets(root, version)
    changelog = (root / "CHANGELOG.md").read_text(encoding="utf-8")
    section = re.search(
        rf"^## \[{re.escape(version)}\][^\n]*\n(.*?)(?=^## |\Z)",
        changelog,
        re.MULTILINE | re.DOTALL,
    )
    if not section or not section[1].strip():
        raise ValueError(f"Missing changelog notes for {version}")
    with tempfile.TemporaryDirectory() as temporary:
        notes = Path(temporary) / "notes.md"
        notes.write_text(section[1].strip() + "\n", encoding="utf-8")
        if not existing:
            run(
                "gh",
                "release",
                "create",
                tag,
                "--draft",
                "--target",
                sha,
                "--title",
                f"ParticleLens {version}",
                "--notes-file",
                str(notes),
            )
        run("gh", "release", "upload", tag, *assets, "--clobber")
        run("gh", "release", "edit", tag, "--draft=false", "--notes-file", str(notes))
    print(f"Published {tag} from {sha} with verified Windows packages.")


if __name__ == "__main__":
    publish(Path(__file__).resolve().parents[1])
