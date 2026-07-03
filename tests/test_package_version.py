from __future__ import annotations

import json
import shutil
import subprocess
import zipfile
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
PLUGIN_FOLDER_NAME = "Decky Metadata"


def _require_tool(name: str) -> None:
    if shutil.which(name) is None:
        pytest.skip(f"{name} is required for package version coverage")


def _git_short_hash() -> str:
    _require_tool("git")
    result = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def _read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _read_zipped_json(zip_path: Path, archive_name: str) -> dict[str, object]:
    with zipfile.ZipFile(zip_path) as archive:
        with archive.open(f"{PLUGIN_FOLDER_NAME}/{archive_name}") as handle:
            return json.loads(handle.read().decode("utf-8"))


class _PreserveFile:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._content = path.read_bytes() if path.exists() else None

    def restore(self) -> None:
        if self._content is None:
            self.path.unlink(missing_ok=True)
        else:
            self.path.write_bytes(self._content)


def _run_packager(*args: str) -> subprocess.CompletedProcess[str]:
    _require_tool("node")
    return subprocess.run(
        ["node", "scripts/package.mjs", *args],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )


def test_dev_package_injects_short_hash_version_and_preserves_sources() -> None:
    package_path = REPO_ROOT / "package.json"
    plugin_path = REPO_ROOT / "plugin.json"
    original_package = package_path.read_text(encoding="utf-8")
    original_plugin = plugin_path.read_text(encoding="utf-8")
    base_version = str(_read_json(package_path)["version"])
    expected_version = f"{base_version}+{_git_short_hash()}"
    zip_path = REPO_ROOT / f"Decky-Metadata_{expected_version}_Installer.zip"
    preserved_zip = _PreserveFile(zip_path)

    try:
        result = _run_packager()

        assert expected_version in result.stdout
        assert zip_path.exists()
        assert _read_zipped_json(zip_path, "plugin.json")["version"] == expected_version
        assert _read_zipped_json(zip_path, "package.json")["version"] == expected_version
        assert package_path.read_text(encoding="utf-8") == original_package
        assert plugin_path.read_text(encoding="utf-8") == original_plugin
    finally:
        preserved_zip.restore()


@pytest.mark.parametrize("flag", ["--release", "--no-hash"])
def test_release_package_uses_base_version_and_preserves_sources(flag: str) -> None:
    package_path = REPO_ROOT / "package.json"
    plugin_path = REPO_ROOT / "plugin.json"
    original_package = package_path.read_text(encoding="utf-8")
    original_plugin = plugin_path.read_text(encoding="utf-8")
    base_version = str(_read_json(package_path)["version"])
    zip_path = REPO_ROOT / f"Decky-Metadata_{base_version}_Installer.zip"
    preserved_zip = _PreserveFile(zip_path)

    try:
        result = _run_packager(flag)

        assert base_version in result.stdout
        assert "+" not in zip_path.name
        assert zip_path.exists()
        assert _read_zipped_json(zip_path, "plugin.json")["version"] == base_version
        assert _read_zipped_json(zip_path, "package.json")["version"] == base_version
        assert package_path.read_text(encoding="utf-8") == original_package
        assert plugin_path.read_text(encoding="utf-8") == original_plugin
    finally:
        preserved_zip.restore()
