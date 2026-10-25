from __future__ import annotations

import hashlib
import json
import stat
import struct
import subprocess
import zipfile
from pathlib import Path

import pytest

import scripts.decky_doctor as doctor
from scripts.decky_doctor import aggregate, archive_metadata, check, hook_body_supported


def _elf64(
    machine: int = 62,
    *,
    elf_type: int = 3,
    entrypoint: int = 0x400000,
    dynamic_needed: bool = False,
    interpreter: bool = False,
) -> bytes:
    has_program_header = dynamic_needed or interpreter
    header = bytearray(64 + (56 if has_program_header else 0) + (88 if dynamic_needed else 0))
    header[:7] = b"\x7fELF\x02\x01\x01"
    struct.pack_into("<HHI", header, 16, elf_type, machine, 1)
    struct.pack_into("<Q", header, 24, entrypoint)
    struct.pack_into("<Q", header, 32, 64)
    struct.pack_into("<HHH", header, 52, 64, 56, int(has_program_header))
    if interpreter:
        struct.pack_into("<I", header, 64, 3)
    elif dynamic_needed:
        struct.pack_into("<IIQQQQQQ", header, 64, 2, 0, 120, 0, 0, 32, 32, 8)
        struct.pack_into("<q", header, 120, 1)
    return bytes(header)


def _write_archive(
    path: Path, *, backend: str = "bin/backend", mode: int = 0o755, native: bytes | None = None
) -> None:
    plugin = {"version": "0.5.5+abc123", "backend": backend}
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("Decky-Metadata/plugin.json", json.dumps(plugin))
        archive.writestr("Decky-Metadata/dist/index.js", b"frontend")
        info = zipfile.ZipInfo("Decky-Metadata/bin/backend")
        info.create_system = 3
        info.external_attr = (stat.S_IFREG | mode) << 16
        archive.writestr(info, _elf64() if native is None else native)


def test_archive_metadata_reports_verified_native_payload(tmp_path: Path) -> None:
    archive = tmp_path / "Decky-Metadata.zip"
    _write_archive(archive)

    metadata = archive_metadata(archive)

    native = metadata["native_backend"]
    assert metadata["version"] == "0.5.5+abc123"
    assert metadata["bundle_sha256"] == hashlib.sha256(b"frontend").hexdigest()
    assert native["path"] == "bin/backend"
    assert native["mode"] == "100755"
    assert native["sha256"] == hashlib.sha256(_elf64()).hexdigest()
    assert native["valid"] is True


@pytest.mark.parametrize(
    ("backend", "mode", "native"),
    [
        ("../backend", 0o755, _elf64()),
        ("bin/backend", 0o644, _elf64()),
        ("bin/backend", 0o755, _elf64(machine=183)),
        ("bin/backend", 0o755, _elf64(entrypoint=0)),
        ("bin/backend", 0o755, _elf64(interpreter=True)),
        ("bin/backend", 0o755, _elf64(dynamic_needed=True)),
    ],
)
def test_archive_metadata_rejects_invalid_native_payload(
    tmp_path: Path, backend: str, mode: int, native: bytes
) -> None:
    archive = tmp_path / "Decky-Metadata.zip"
    _write_archive(archive, backend=backend, mode=mode, native=native)

    metadata = archive_metadata(archive)

    assert metadata["native_backend"]["valid"] is False
    assert metadata["native_backend"]["error"]


def test_aggregation_precedence():
    assert aggregate([check("a", "PASS", "ok")]) == "PASS"
    assert aggregate([check("a", "PASS", "ok"), check("b", "WARN", "warn")]) == "WARN"
    assert aggregate([check("b", "WARN", "warn"), check("c", "FAIL", "bad")]) == "FAIL"


def test_check_shape_is_stable():
    assert check("id", "PASS", "summary", value=1) == {"id": "id", "status": "PASS", "summary": "summary", "details": {"value": 1}}


def test_hook_body_requires_an_exact_supported_delegate():
    canonical = '#!/usr/bin/env bash\nexec "$(git rev-parse --show-toplevel)/scripts/post_commit.sh" "$@"\n'
    assert hook_body_supported("post-commit", "scripts/post_commit.sh", canonical)
    assert not hook_body_supported("post-commit", "scripts/post_commit.sh", canonical.replace("exec ", "echo inserted\nexec "))

def test_local_doctor_accepts_native_runtime_without_python_backend(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "plugin"
    (root / "backend-rust").mkdir(parents=True)
    (root / "scripts").mkdir()
    (root / ".git" / "hooks").mkdir(parents=True)
    (root / "plugin.json").write_text(
        json.dumps({"version": "0.5.5", "backend": "bin/backend"}), encoding="utf-8"
    )
    (root / "package.json").write_text(json.dumps({"version": "0.5.5"}), encoding="utf-8")
    (root / "package-lock.json").write_text("{}", encoding="utf-8")
    (root / "rust-toolchain.toml").write_text("channel = '1.99.0'\n", encoding="utf-8")
    (root / "backend-rust" / "Cargo.toml").write_text("[package]\n", encoding="utf-8")
    (root / "backend-rust" / "Cargo.lock").write_text("version = 4\n", encoding="utf-8")
    (root / "main.py").write_text("# SPDX-License-Identifier: 0BSD\n", encoding="utf-8")
    (root / "run.sh").write_text(
        "TMPDIR CARGO_HOME CARGO_TARGET_DIR PYTHONPYCACHEPREFIX\n", encoding="utf-8"
    )
    for name, delegate in {
        "pre-commit": "scripts/check_tdd.sh",
        "post-commit": "scripts/post_commit.sh",
        "post-merge": "scripts/post_commit.sh",
    }.items():
        hook = root / ".git" / "hooks" / name
        hook.write_text(
            f'#!/usr/bin/env bash\nexec "$(git rev-parse --show-toplevel)/{delegate}" "$@"\n',
            encoding="utf-8",
        )
        hook.chmod(0o755)
    for relative in (
        "scripts/deck/cdp.py",
        "scripts/deck/tunnel.sh",
        "scripts/deck/deploy.sh",
        "scripts/orchestration-hooks/quality-gates",
        "scripts/orchestration-hooks/finalize-release",
    ):
        tool = root / relative
        tool.parent.mkdir(parents=True, exist_ok=True)
        tool.write_text("#!/usr/bin/env bash\n", encoding="utf-8")
        tool.chmod(0o755)

    def git_result(*args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
        stdout = {
            ("git", "branch", "--show-current"): "main\n",
            ("git", "status", "--porcelain", "--untracked-files=all"): "",
            ("git", "rev-parse", "--git-dir"): ".git\n",
            ("git", "rev-parse", "--short", "HEAD"): "abc123\n",
        }.get(args, "")
        return subprocess.CompletedProcess(args, 0, stdout, "")

    monkeypatch.setattr(doctor, "run", git_result)

    native_runtime = next(
        item for item in doctor.local_checks(root) if item["id"] == "native-runtime"
    )

    assert native_runtime["status"] == "PASS"
    assert not (root / "backend").exists()
