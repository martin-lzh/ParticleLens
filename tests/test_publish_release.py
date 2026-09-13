import hashlib
import json
import subprocess
from unittest.mock import Mock

import pytest

from scripts import publish_release


@pytest.fixture
def release(tmp_path, monkeypatch):
    monkeypatch.setenv("GITHUB_EVENT_NAME", "push")
    monkeypatch.setenv("GITHUB_REF", "refs/heads/main")
    monkeypatch.setenv("GITHUB_SHA", "tested-sha")
    (tmp_path / "package.json").write_text('{"version": "0.3.1"}')
    (tmp_path / "CHANGELOG.md").write_text(
        "## [0.3.1] - 2026-09-13\n\nSecurity fixes.\n\n## [0.3.0]\nOld notes.\n"
    )
    directory = tmp_path / "release"
    directory.mkdir()
    names = [
        "ParticleLens-Windows-Setup-v0.3.1.exe",
        "ParticleLens-Windows-OneFile-v0.3.1.exe",
        "ParticleLens-Windows-v0.3.1.zip",
    ]
    for name in names:
        (directory / name).write_bytes(b"tested package")
    digest = hashlib.sha256(b"tested package").hexdigest().upper()
    (directory / "SHA256SUMS.txt").write_text("\n".join(f"{digest}  {name}" for name in names))
    command = Mock(side_effect=["tested-sha", "[[]]", "", "", "", ""])
    monkeypatch.setattr(publish_release, "run", command)
    return tmp_path, command


def test_publish_after_asset_verification(release):
    root, command = release
    publish_release.publish(root)
    calls = [call.args for call in command.call_args_list]
    assert calls[3][:5] == ("gh", "release", "create", "v0.3.1", "--draft")
    assert calls[3][5:7] == ("--target", "tested-sha")
    assert calls[4][:4] == ("gh", "release", "upload", "v0.3.1")
    assert len(calls[4][4:-1]) == 4
    assert calls[5][:5] == ("gh", "release", "edit", "v0.3.1", "--draft=false")


def test_published_version_is_unchanged(release):
    root, command = release
    command.side_effect = ["tested-sha", '[[{"tag_name":"v0.3.1","draft":false}]]']
    publish_release.publish(root)
    assert command.call_count == 2


def test_resume_draft(release):
    root, command = release
    command.side_effect = [
        "tested-sha",
        json.dumps(
            [
                [
                    {
                        "tag_name": "v0.3.1",
                        "draft": True,
                        "target_commitish": "tested-sha",
                    }
                ]
            ]
        ),
        "",
        "",
        "",
    ]
    publish_release.publish(root)
    assert command.call_args_list[3].args[:3] == ("gh", "release", "upload")
    assert command.call_count == 5


@pytest.mark.parametrize(
    "ref,event", [("refs/heads/development", "push"), ("refs/heads/main", "pull_request")]
)
def test_reject_untrusted_trigger(release, monkeypatch, ref, event):
    root, command = release
    monkeypatch.setenv("GITHUB_REF", ref)
    monkeypatch.setenv("GITHUB_EVENT_NAME", event)
    with pytest.raises(ValueError, match="main branch push"):
        publish_release.publish(root)
    command.assert_not_called()


def test_reject_modified_asset(release):
    root, command = release
    (root / "release/ParticleLens-Windows-v0.3.1.zip").write_bytes(b"corrupted")
    with pytest.raises(ValueError, match="Checksum mismatch"):
        publish_release.publish(root)
    assert command.call_count == 3


def test_reject_tag_at_another_commit(release):
    root, command = release
    command.side_effect = ["tested-sha", "[[]]", "v0.3.1", "other-sha"]
    with pytest.raises(ValueError, match="different commit"):
        publish_release.publish(root)
    assert command.call_count == 4


def test_failed_upload_does_not_publish(release):
    root, command = release
    command.side_effect = [
        "tested-sha",
        "[[]]",
        "",
        "",
        subprocess.CalledProcessError(1, "gh release upload"),
    ]
    with pytest.raises(subprocess.CalledProcessError):
        publish_release.publish(root)
    assert command.call_count == 5


def test_api_failure_does_not_create_release(release):
    root, command = release
    command.side_effect = ["tested-sha", subprocess.CalledProcessError(1, "gh api")]
    with pytest.raises(subprocess.CalledProcessError):
        publish_release.publish(root)
    assert command.call_count == 2
