from __future__ import annotations

import json
import os
import shutil
import struct
import subprocess
import zipfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
PLUGIN_FOLDER_NAME = "Decky-Metadata"
BINARY_NAME = "decky-metadata-backend"
TARGET_TRIPLE = "x86_64-unknown-linux-musl"

FAKE_CARGO = f'''#!/usr/bin/env python3
import json
import os
import pathlib
import sys
args = sys.argv[1:]
try:
    target = args[args.index("--target") + 1]
    binary = args[args.index("--bin") + 1]
except (ValueError, IndexError):
    raise SystemExit(31)
if ("--locked" not in args or "--release" not in args or target != "{TARGET_TRIPLE}"
        or binary != "{BINARY_NAME}" or "--message-format=json-render-diagnostics" not in args):
    raise SystemExit(31)
artifact = pathlib.Path(os.environ["CARGO_TARGET_DIR"]) / target / "release" / binary
artifact.parent.mkdir(parents=True, exist_ok=True)
artifact.write_bytes(bytes.fromhex(os.environ["FAKE_ELF_HEX"]))
artifact.chmod(0o755)
print(json.dumps({{
    "reason": "compiler-artifact",
    "target": {{"kind": ["bin"], "crate_types": ["bin"], "name": "{BINARY_NAME}"}},
    "profile": {{"test": False}},
    "filenames": [str(artifact)],
    "executable": str(artifact),
}}))
print(json.dumps({{"reason": "build-finished", "success": True}}))
'''


def _valid_elf() -> bytes:
    header = bytearray(64)
    header[:7] = b"\x7fELF\x02\x01\x01"
    struct.pack_into("<HHI", header, 16, 2, 62, 1)
    struct.pack_into("<Q", header, 24, 0x400000)
    struct.pack_into("<Q", header, 32, 64)
    struct.pack_into("<HHH", header, 52, 64, 56, 0)
    return bytes(header)


def _fixture(tmp_path: Path) -> tuple[Path, dict[str, str]]:
    repo = tmp_path / "repo"
    scripts = repo / "scripts"
    dist = repo / "dist"
    cache = tmp_path / "cache"
    fake_bin = tmp_path / "bin"
    scripts.mkdir(parents=True)
    dist.mkdir()
    cache.mkdir()
    fake_bin.mkdir()
    (repo / "backend-rust").mkdir()
    (repo / "backend-rust" / "Cargo.toml").write_text("[package]\n", encoding="utf-8")

    for name in ("package.mjs", "build_backend.mjs"):
        shutil.copy2(REPO_ROOT / "scripts" / name, scripts / name)
    for name in ("main.py", "package.json", "plugin.json", "LICENSE"):
        shutil.copy2(REPO_ROOT / name, repo / name)
    for name in ("NOTICE",):
        source = REPO_ROOT / name
        if source.is_file():
            shutil.copy2(source, repo / name)
    shutil.copy2(REPO_ROOT / "dist" / "index.js", dist / "index.js")
    source_map = REPO_ROOT / "dist" / "index.js.map"
    if source_map.is_file():
        shutil.copy2(source_map, dist / source_map.name)

    cargo = fake_bin / "cargo"
    cargo.write_text(FAKE_CARGO, encoding="utf-8")
    cargo.chmod(0o755)
    git = fake_bin / "git"
    git.write_text(
        '#!/usr/bin/env bash\n[[ "$*" == "rev-parse --short HEAD" ]] && echo abc123\n',
        encoding="utf-8",
    )
    git.chmod(0o755)
    env = {
        **os.environ,
        "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}",
        "TMPDIR": str(cache),
        "CARGO_HOME": str(cache / "cargo-home"),
        "CARGO_TARGET_DIR": str(cache / "cargo-target"),
        "FAKE_ELF_HEX": _valid_elf().hex(),
    }
    return repo, env


def _read_zipped_json(zip_path: Path, archive_name: str) -> dict[str, object]:
    with zipfile.ZipFile(zip_path) as archive:
        return json.loads(archive.read(f"{PLUGIN_FOLDER_NAME}/{archive_name}"))


def _run_packager(repo: Path, env: dict[str, str], *args: str) -> subprocess.CompletedProcess[str]:
    if shutil.which("node") is None:
        pytest.skip("node is required for package version coverage")
    return subprocess.run(
        ["node", "scripts/package.mjs", *args],
        cwd=repo,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )


def test_dev_package_injects_short_hash_and_preserves_sources(tmp_path: Path) -> None:
    repo, env = _fixture(tmp_path)
    package_path = repo / "package.json"
    plugin_path = repo / "plugin.json"
    original_package = package_path.read_bytes()
    original_plugin = plugin_path.read_bytes()
    base_version = str(json.loads(original_package)["version"])
    zip_path = repo / "Decky-Metadata.zip"

    result = _run_packager(repo, env)

    assert result.returncode == 0, result.stderr or result.stdout
    expected_version = f"{base_version}+abc123"
    assert expected_version in result.stdout
    assert _read_zipped_json(zip_path, "plugin.json")["version"] == expected_version
    assert _read_zipped_json(zip_path, "package.json")["version"] == expected_version
    assert package_path.read_bytes() == original_package
    assert plugin_path.read_bytes() == original_plugin


@pytest.mark.parametrize("flag", ["--release", "--no-hash"])
def test_release_package_uses_base_version_and_preserves_sources(
    tmp_path: Path, flag: str
) -> None:
    repo, env = _fixture(tmp_path)
    package_path = repo / "package.json"
    plugin_path = repo / "plugin.json"
    original_package = package_path.read_bytes()
    original_plugin = plugin_path.read_bytes()
    base_version = str(json.loads(original_package)["version"])
    zip_path = repo / "Decky-Metadata.zip"

    result = _run_packager(repo, env, flag)

    assert result.returncode == 0, result.stderr or result.stdout
    assert base_version in result.stdout
    assert "+" not in _read_zipped_json(zip_path, "plugin.json")["version"]
    assert _read_zipped_json(zip_path, "plugin.json")["version"] == base_version
    assert _read_zipped_json(zip_path, "package.json")["version"] == base_version
    assert package_path.read_bytes() == original_package
    assert plugin_path.read_bytes() == original_plugin
