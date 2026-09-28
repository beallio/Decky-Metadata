from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

from scripts import check_ign_trailers as monitor


GOOD_MP4 = b"\x00\x00\x00\x18ftypisom\x00\x00\x00\x00isom"


def trailer(name: str, *urls: str) -> dict:
    return {
        "name": name,
        "candidates": [
            {"format": "mp4", "url": url, "height": 720 + index * 360}
            for index, url in enumerate(urls)
        ],
    }


def test_both_known_games_must_resolve_to_verified_trailers(monkeypatch) -> None:
    monkeypatch.setattr(
        monitor.ign,
        "find_trailer",
        lambda name, _game_url, _graphql, _fetch_html: (
            trailer("Deadpool Official Trailer", "https://assets14.ign.com/deadpool.mp4")
            if name == "Deadpool" else None
        ),
    )

    with pytest.raises(monitor.ProbeFailure, match="Bloodborne"):
        monitor.check_sources(lambda *_args: {}, lambda *_args, **_kwargs: "", lambda _url: None)


def test_one_failed_quality_does_not_alert_when_another_mp4_works(monkeypatch) -> None:
    def select(name, _game_url, _graphql, _fetch_html):
        if name == "Deadpool":
            return trailer(
                "Deadpool Official Trailer",
                "https://assets14.ign.com/broken.mp4",
                "https://assets14.ign.com/working.mp4",
            )
        return trailer("Bloodborne Story Trailer", "https://assets14.ign.com/bloodborne.mp4")

    monkeypatch.setattr(monitor.ign, "find_trailer", select)
    checked: list[str] = []

    def inspect(url: str) -> None:
        checked.append(url)
        if url.endswith("broken.mp4"):
            raise OSError("HTTP 404")

    monitor.check_sources(lambda *_args: {}, lambda *_args, **_kwargs: "", inspect)
    assert checked == [
        "https://assets14.ign.com/broken.mp4",
        "https://assets14.ign.com/working.mp4",
        "https://assets14.ign.com/bloodborne.mp4",
    ]


def test_all_unavailable_mp4_qualities_fail(monkeypatch) -> None:
    monkeypatch.setattr(
        monitor.ign,
        "find_trailer",
        lambda *_args: trailer("Deadpool Official Trailer", "https://assets14.ign.com/deadpool.mp4"),
    )

    def unavailable(_url: str) -> None:
        raise OSError("HTTP 403")

    with pytest.raises(monitor.ProbeFailure, match="Deadpool.*MP4"):
        monitor.check_sources(lambda *_args: {}, lambda *_args, **_kwargs: "", unavailable)


class MediaResponse:
    def __init__(self, content_type: str, body: bytes):
        self.status = 206
        self.headers = {"Content-Type": content_type}
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, size: int = -1) -> bytes:
        assert 0 < size <= 32
        return self.body[:size]


def test_mp4_probe_rejects_html_error_and_accepts_media_header() -> None:
    url = "https://assets14.ign.com/deadpool.mp4"
    with pytest.raises(monitor.ProbeFailure, match="MP4"):
        monitor.probe_mp4(url, open_url=lambda *_args, **_kwargs: MediaResponse("text/html", b"blocked"))
    monitor.probe_mp4(url, open_url=lambda *_args, **_kwargs: MediaResponse("video/mp4", GOOD_MP4))


def test_issue_reporter_creates_only_one_open_issue(tmp_path: Path) -> None:
    reporter = Path(__file__).resolve().parents[1] / "scripts/report_ign_trailer_failure.sh"
    gh = tmp_path / "gh"
    gh.write_text(
        "#!/usr/bin/env bash\n"
        "if [[ \"$1 $2\" == 'issue list' ]]; then\n"
        "  [[ \"${FAIL_LOOKUP:-}\" == 1 ]] && exit 9\n"
        "  [[ \"${EXISTING_ISSUE:-}\" == 1 ]] && printf '42\\n'\n"
        "  exit 0\n"
        "elif [[ \"$1 $2\" == 'issue create' ]]; then\n"
        "  printf 'created\\n' >> \"$ISSUE_RECORD\"\n"
        "else exit 2; fi\n",
        encoding="utf-8",
    )
    gh.chmod(0o755)
    record = tmp_path / "issues.txt"
    env = {**os.environ, "PATH": f"{tmp_path}:{os.environ['PATH']}", "RUNNER_TEMP": str(tmp_path),
           "GITHUB_SERVER_URL": "https://github.com", "GITHUB_REPOSITORY": "beallio/Decky-Metadata",
           "GITHUB_RUN_ID": "1234", "ISSUE_RECORD": str(record)}
    subprocess.run(["bash", str(reporter)], env=env, check=True, capture_output=True, text=True)
    assert record.read_text(encoding="utf-8") == "created\n"
    body = (tmp_path / "ign-trailer-health-failure.md").read_text(encoding="utf-8")
    assert "https://github.com/beallio/Decky-Metadata/actions/runs/1234" in body

    env["EXISTING_ISSUE"] = "1"
    subprocess.run(["bash", str(reporter)], env=env, check=True, capture_output=True, text=True)
    assert record.read_text(encoding="utf-8") == "created\n"

    env["EXISTING_ISSUE"] = "0"
    env["FAIL_LOOKUP"] = "1"
    failed = subprocess.run(["bash", str(reporter)], env=env, capture_output=True, text=True)
    assert failed.returncode != 0
    assert record.read_text(encoding="utf-8") == "created\n"
