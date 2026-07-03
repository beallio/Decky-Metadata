from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

from scripts import version_guard


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "version_guard.py"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("0.1.0", (0, 1, 0)),
        ("v10.20.30", (10, 20, 30)),
    ],
)
def test_parse_semver_accepts_stable_versions(text: str, expected: tuple[int, int, int]) -> None:
    assert version_guard.parse_semver(text) == expected


@pytest.mark.parametrize("text", ["", "1", "1.2", "1.2.3.4", "1.2.3-beta", "release-1.2.3"])
def test_parse_semver_rejects_non_stable_versions(text: str) -> None:
    with pytest.raises(ValueError):
        version_guard.parse_semver(text)


def test_next_patch_version_increments_patch_only() -> None:
    assert version_guard.next_patch_version("1.2.3") == "1.2.4"


def test_highest_stable_version_ignores_non_stable_tags() -> None:
    assert version_guard.highest_stable_version(["v0.1.0", "dev", "0.2.0", "v0.1.9"]) == (
        0,
        2,
        0,
    )


def test_highest_stable_version_returns_none_without_stable_tags() -> None:
    assert version_guard.highest_stable_version(["dev", "release-candidate"]) is None


@pytest.mark.parametrize(
    ("base", "tags", "expected"),
    [
        ("0.1.0", [], True),
        ("0.1.1", ["v0.1.0"], True),
        ("0.1.0", ["v0.1.0"], False),
        ("0.0.9", ["v0.1.0"], False),
    ],
)
def test_is_base_ahead_of_stable(base: str, tags: list[str], expected: bool) -> None:
    assert version_guard.is_base_ahead_of_stable(base, tags) is expected


@pytest.mark.parametrize(
    ("version", "tags", "expected"),
    [
        ("0.1.0", [], False),
        ("0.1.0", ["v0.1.0"], False),
        ("0.0.9", ["v0.1.0"], True),
        ("0.1.1", ["v0.1.0"], False),
    ],
)
def test_is_version_behind_stable(version: str, tags: list[str], expected: bool) -> None:
    assert version_guard.is_version_behind_stable(version, tags) is expected


def test_check_drift_passes_when_git_is_unavailable() -> None:
    env = os.environ.copy()
    env["PATH"] = ""

    result = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), "check-drift", "0.1.0"],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
