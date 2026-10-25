from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
import tomllib


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "set_release_version.py"


def _write_json(path: Path, data: dict[str, object]) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def _write_rust_metadata(root: Path) -> None:
    native = root / "backend-rust"
    native.mkdir()
    (native / "Cargo.toml").write_text(
        '[package]\nname = "decky-metadata-backend"\nversion = "0.1.0"\n\n[dependencies]\nother = "0.1.0"\n',
        encoding="utf-8",
    )
    (native / "Cargo.lock").write_text(
        'version = 4\n\n[[package]]\nname = "decky-metadata-backend"\nversion = "0.1.0"\n\n[[package]]\nname = "other"\nversion = "0.1.0"\n',
        encoding="utf-8",
    )


def test_set_release_version_updates_plugin_and_package_json(tmp_path: Path) -> None:
    plugin_path = tmp_path / "plugin.json"
    package_path = tmp_path / "package.json"
    _write_json(plugin_path, {"name": "Decky Metadata", "version": "0.1.0", "flags": []})
    _write_json(package_path, {"name": "decky-metadata", "version": "0.1.0", "scripts": {}})
    _write_rust_metadata(tmp_path)

    result = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), "0.1.1", "--project-root", str(tmp_path)],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert json.loads(plugin_path.read_text(encoding="utf-8")) == {
        "name": "Decky Metadata",
        "version": "0.1.1",
        "flags": [],
    }
    assert json.loads(package_path.read_text(encoding="utf-8")) == {
        "name": "decky-metadata",
        "version": "0.1.1",
        "scripts": {},
    }
    assert plugin_path.read_text(encoding="utf-8").endswith("\n")
    assert package_path.read_text(encoding="utf-8").endswith("\n")
    native = tmp_path / "backend-rust"
    manifest = tomllib.loads((native / "Cargo.toml").read_text(encoding="utf-8"))
    lock = tomllib.loads((native / "Cargo.lock").read_text(encoding="utf-8"))
    assert manifest["package"]["version"] == "0.1.1"
    assert manifest["dependencies"]["other"] == "0.1.0"
    assert {entry["name"]: entry["version"] for entry in lock["package"]} == {
        "decky-metadata-backend": "0.1.1",
        "other": "0.1.0",
    }


def test_set_release_version_rejects_invalid_version_without_changes(tmp_path: Path) -> None:
    plugin_path = tmp_path / "plugin.json"
    package_path = tmp_path / "package.json"
    original_plugin = '{\n  "version": "0.1.0"\n}\n'
    original_package = '{\n  "version": "0.1.0"\n}\n'
    plugin_path.write_text(original_plugin, encoding="utf-8")
    package_path.write_text(original_package, encoding="utf-8")

    result = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), "0.1.1-beta", "--project-root", str(tmp_path)],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0
    assert "stable semantic version" in result.stderr
    assert plugin_path.read_text(encoding="utf-8") == original_plugin
    assert package_path.read_text(encoding="utf-8") == original_package


def test_missing_native_lock_does_not_change_other_release_metadata(tmp_path: Path) -> None:
    _write_json(tmp_path / "plugin.json", {"version": "0.1.0"})
    _write_json(tmp_path / "package.json", {"version": "0.1.0"})
    _write_rust_metadata(tmp_path)
    (tmp_path / "backend-rust/Cargo.lock").unlink()
    files = [tmp_path / "plugin.json", tmp_path / "package.json", tmp_path / "backend-rust/Cargo.toml"]
    before = [path.read_bytes() for path in files]
    result = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), "0.1.1", "--project-root", str(tmp_path)],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode != 0
    assert [path.read_bytes() for path in files] == before
