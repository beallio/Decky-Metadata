import hashlib
import json
import os
import stat
import struct
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).parents[1]
PACKAGE_FIXTURES = ROOT / "tests/fixtures/agent_workflow/package"


def _native_elf(
    machine: int = 62,
    *,
    elf_type: int = 3,
    entrypoint: int = 0x400000,
    needed: bool = False,
    interpreter: bool = False,
) -> bytes:
    has_program_header = needed or interpreter
    header = bytearray(64 + (56 if has_program_header else 0) + (88 if needed else 0))
    header[:7] = b"\x7fELF\x02\x01\x01"
    struct.pack_into("<HHI", header, 16, elf_type, machine, 1)
    struct.pack_into("<Q", header, 24, entrypoint)
    struct.pack_into("<Q", header, 32, 64)
    struct.pack_into("<HHH", header, 52, 64, 56, int(has_program_header))
    if interpreter:
        struct.pack_into("<I", header, 64, 3)
    elif needed:
        struct.pack_into("<IIQQQQQQ", header, 64, 2, 0, 120, 0, 0, 32, 32, 8)
        struct.pack_into("<q", header, 120, 1)
    return bytes(header)

def _add_file(archive: zipfile.ZipFile, name: str, data: bytes, mode: int = 0o644) -> None:
    info = zipfile.ZipInfo(name)
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | mode) << 16
    archive.writestr(info, data)


def _environment(
    tmp_path: Path,
    *,
    archive_version: str = "0.1.0+abc123",
    native_mode: int = 0o755,
    backend_path: str = "bin/backend",
    native_elf: bytes | None = None,
) -> tuple[dict[str, str], str, str, str]:
    package_root = tmp_path / "package-root"
    package_root.mkdir(parents=True, exist_ok=True)
    archive = package_root / "Decky-Metadata.zip"
    bundle = b"deterministic bundle\n"
    backend = _native_elf() if native_elf is None else native_elf
    with zipfile.ZipFile(archive, "w") as output:
        for name in ("package.json", "plugin.json"):
            manifest = json.loads((PACKAGE_FIXTURES / name).read_text())
            manifest["version"] = archive_version
            if name == "plugin.json":
                manifest["backend"] = backend_path
            _add_file(output, f"Decky-Metadata/{name}", json.dumps(manifest).encode())
        _add_file(output, "Decky-Metadata/dist/index.js", bundle)
        _add_file(output, "Decky-Metadata/main.py", b"# SPDX-License-Identifier: 0BSD\n")
        _add_file(output, "Decky-Metadata/bin/backend", backend, native_mode)
    archive_digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    bundle_digest = hashlib.sha256(bundle).hexdigest()
    backend_digest = hashlib.sha256(backend).hexdigest()
    with zipfile.ZipFile(archive) as packaged:
        shim_digest, manifest_digest, package_digest = (
            hashlib.sha256(packaged.read(f"Decky-Metadata/{name}")).hexdigest()
            for name in ("main.py", "plugin.json", "package.json")
        )

    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    _executable(
        fake_bin / "git",
        f"""#!/usr/bin/env bash
case "$*" in
  *--show-toplevel*) printf '%s\\n' '{ROOT}' ;;
  *--short*) echo abc123 ;;
  *HEAD*) echo abc1230000000000000000000000000000000000 ;;
  *) exit 1 ;;
esac
""",
    )
    _executable(
        fake_bin / "ssh",
        """#!/usr/bin/env bash
[[ "${SSH_OFFLINE:-0}" == 1 ]] && exit 1
case "$*" in
  *sha256sum*) echo "${REMOTE_SHA}" ;;
  *plugin.json*) echo "${INSTALLED_VERSION} ${INSTALLED_BUNDLE_SHA} ${INSTALLED_NATIVE_SHA} ${INSTALLED_SHIM_SHA} ${INSTALLED_MANIFEST_SHA} ${INSTALLED_PACKAGE_SHA} ${INSTALLED_NATIVE_MODE}" ;;
esac
""",
    )
    _executable(fake_bin / "scp", "#!/usr/bin/env bash\n[[ -z \"${SCP_LOG:-}\" ]] || echo copy >>\"$SCP_LOG\"\nexit \"${SCP_STATUS:-0}\"\n")
    _executable(
        fake_bin / "npm",
        """#!/usr/bin/env bash
echo "fake build chatter"
if [[ "${REBUILD_ARCHIVE_CURRENT:-0}" == 1 ]]; then
  python3 - "$DECKY_TEST_PACKAGE_ZIP" <<'PY'
import json
import os
import sys
import zipfile

archive = sys.argv[1]
replacement = f"{archive}.new"
with zipfile.ZipFile(archive) as source, zipfile.ZipFile(replacement, "w") as output:
    for info in source.infolist():
        content = source.read(info.filename)
        if info.filename in (
            "Decky-Metadata/package.json",
            "Decky-Metadata/plugin.json",
        ):
            manifest = json.loads(content)
            manifest["version"] = "0.1.0+abc123"
            content = json.dumps(manifest).encode()
        output.writestr(info, content)
os.replace(replacement, archive)
PY
fi
if [[ -n "${LOCK_LOG:-}" ]]; then
  echo "start $$" >>"$LOCK_LOG"
  sleep 0.2
  echo "end $$" >>"$LOCK_LOG"
fi
exit 0
""",
    )
    env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "TMPDIR": str(tmp_path),
        "DECKY_TEST_PACKAGE_ZIP": str(archive),
        "DECKY_TMP_ROOT": str(package_root),
        "REMOTE_SHA": archive_digest,
        "INSTALLED_VERSION": archive_version,
        "INSTALLED_BUNDLE_SHA": bundle_digest,
        "INSTALLED_NATIVE_SHA": backend_digest,
        "INSTALLED_SHIM_SHA": shim_digest,
        "INSTALLED_MANIFEST_SHA": manifest_digest,
        "INSTALLED_PACKAGE_SHA": package_digest,
        "INSTALLED_NATIVE_MODE": "755",
    }
    return env, archive_digest, bundle_digest, backend_digest


def _executable(path: Path, body: str) -> None:
    path.write_text(body)
    path.chmod(0o755)


def _invoke(env: dict[str, str], *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(ROOT / "scripts/deck/package_push.sh"), *args],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
    )


def test_invalid_option_is_usage_error():
    result = subprocess.run(
        [str(ROOT / "scripts/deck/package_push.sh"), "--unsafe"],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    assert result.returncode == 2


def test_hook_authority_cannot_be_inferred():
    result = subprocess.run(
        [str(ROOT / "scripts/deck/package_push.sh"), "--hook"],
        cwd=ROOT,
        text=True,
        capture_output=True,
    )
    assert result.returncode == 2


def test_native_path_elf_and_mode_are_required(tmp_path: Path) -> None:
    cases = (
        ("wrong-path", 0o755, "bin/not-backend", _native_elf()),
        ("wrong-mode", 0o644, "bin/backend", _native_elf()),
        ("wrong-elf", 0o755, "bin/backend", _native_elf(machine=183)),
        ("interpreter", 0o755, "bin/backend", _native_elf(interpreter=True)),
        ("dynamic-dependency", 0o755, "bin/backend", _native_elf(needed=True)),
        ("no-entrypoint", 0o755, "bin/backend", _native_elf(entrypoint=0)),
    )
    for name, mode, backend_path, backend in cases:
        env, _, _, _ = _environment(
            tmp_path / name,
            native_mode=mode,
            backend_path=backend_path,
            native_elf=backend,
        )
        result = _invoke(env, "--json")
        assert result.returncode == 1
        assert json.loads(result.stdout)["LOCAL_VALIDATION"] == "FAIL"


def test_test_archive_override_quotes_paths_with_spaces(tmp_path: Path) -> None:
    env, _, _, _ = _environment(tmp_path)
    archive = Path(env["DECKY_TEST_PACKAGE_ZIP"])
    spaced_root = tmp_path / "private root with spaces"
    spaced_root.mkdir()
    spaced_archive = spaced_root / "test archive with spaces.zip"
    archive.rename(spaced_archive)

    result = _invoke(
        {
            **env,
            "DECKY_TMP_ROOT": str(spaced_root),
            "DECKY_TEST_PACKAGE_ZIP": str(spaced_archive),
        },
        "--json",
    )

    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["LOCAL_VALIDATION"] == "PASS"


def test_test_archive_override_rejects_paths_outside_configured_root(tmp_path: Path) -> None:
    env, _, _, _ = _environment(tmp_path)
    outside = tmp_path / "outside.zip"
    outside.write_bytes(b"not an archive")
    rejected = _invoke(
        {**env, "DECKY_TEST_PACKAGE_ZIP": str(outside)},
        "--json",
    )
    assert rejected.returncode == 2

    escape = tmp_path / "package-root" / "escape"
    escape.symlink_to(tmp_path, target_is_directory=True)
    symlinked = _invoke(
        {**env, "DECKY_TEST_PACKAGE_ZIP": str(escape / outside.name)},
        "--json",
    )
    assert symlinked.returncode == 2


def test_push_verifies_archive_remote_copy_and_installed_native_bundle(tmp_path: Path):
    env, _, _, _ = _environment(tmp_path)
    result = _invoke(env, "--push", "--json")
    assert result.returncode == 0, result.stderr
    stages = json.loads(result.stdout)
    assert stages == {
        "DELIVERY": "PASS",
        "INSTALLED_STATE": "CURRENT",
        "LOCAL_VALIDATION": "PASS",
        "PACKAGE_CREATED": "SKIP",
        "error": "",
    }


def test_remote_checksum_and_installed_binary_mismatches_are_distinct(tmp_path: Path):
    env, _, _, _ = _environment(tmp_path)
    bad_remote = _invoke({**env, "REMOTE_SHA": "bad"}, "--push", "--json")
    assert bad_remote.returncode == 1
    assert json.loads(bad_remote.stdout)["DELIVERY"] == "VERIFY_FAILED"

    for mismatch in (
        {"INSTALLED_NATIVE_SHA": "bad"},
        {"INSTALLED_SHIM_SHA": "bad"},
        {"INSTALLED_MANIFEST_SHA": "bad"},
        {"INSTALLED_PACKAGE_SHA": "bad"},
        {"INSTALLED_NATIVE_MODE": "644"},
        {"INSTALLED_NATIVE_MODE": "invalid"},
    ):
        stale_install = _invoke({**env, **mismatch}, "--push", "--json")
        assert stale_install.returncode == 0
        assert json.loads(stale_install.stdout)["INSTALLED_STATE"] == "REINSTALL_REQUIRED"


def test_stale_archive_and_offline_delivery_semantics(tmp_path: Path):
    stale_env, _, _, _ = _environment(tmp_path / "stale", archive_version="0.1.0+old")
    stale = _invoke(stale_env, "--json")
    assert stale.returncode == 1
    assert json.loads(stale.stdout)["LOCAL_VALIDATION"] == "FAIL"

    env, _, _, _ = _environment(tmp_path / "offline")
    explicit = _invoke({**env, "SSH_OFFLINE": "1"}, "--push", "--json")
    assert explicit.returncode == 1
    assert json.loads(explicit.stdout)["DELIVERY"] == "OFFLINE"

    hook = _invoke(
        {**env, "SSH_OFFLINE": "1", "DECKY_HOOK_AUTHORIZED": "1"},
        "--hook",
        "--json",
    )
    assert hook.returncode == 0
    assert json.loads(hook.stdout)["DELIVERY"] == "DELIVERY_PENDING"


def test_concurrent_hook_builds_are_serialized_by_the_package_lock(tmp_path: Path):
    env, _, _, _ = _environment(tmp_path)
    lock_log = tmp_path / "lock.log"
    concurrent_env = {
        **env,
        "SSH_OFFLINE": "1",
        "DECKY_HOOK_AUTHORIZED": "1",
        "LOCK_LOG": str(lock_log),
    }
    commands = [str(ROOT / "scripts/deck/package_push.sh"), "--hook", "--json"]
    first = subprocess.Popen(
        commands,
        cwd=ROOT,
        env=concurrent_env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    second = subprocess.Popen(
        commands,
        cwd=ROOT,
        env=concurrent_env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert first.wait() == 0 and second.wait() == 0
    lines = lock_log.read_text().splitlines()
    assert [line.split()[0] for line in lines] == ["start", "end", "start", "end"]
    assert lines[0].split()[1] == lines[1].split()[1]
    assert lines[2].split()[1] == lines[3].split()[1]


def test_sequential_delivery_revalidates_and_skips_duplicate_copy_unless_forced(tmp_path: Path):
    env, _, _, _ = _environment(tmp_path)
    scp_log = tmp_path / "scp.log"
    env = {**env, "SCP_LOG": str(scp_log)}

    first = _invoke(env, "--push", "--json")
    second = _invoke(env, "--push", "--json")
    forced = _invoke(env, "--push", "--force", "--json")

    assert first.returncode == second.returncode == forced.returncode == 0
    assert json.loads(first.stdout)["DELIVERY"] == "PASS"
    assert json.loads(second.stdout)["DELIVERY"] == "ALREADY_CURRENT"
    assert json.loads(forced.stdout)["DELIVERY"] == "PASS"
    assert scp_log.read_text().splitlines() == ["copy", "copy"]


def test_json_build_routes_progress_away_from_stdout(tmp_path: Path):
    env, _, _, _ = _environment(tmp_path)
    result = _invoke(env, "--build", "--json")
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["PACKAGE_CREATED"] == "PASS"
    assert "fake build chatter" not in result.stdout
    assert "fake build chatter" in result.stderr


def test_successful_rebuild_clears_superseded_stale_archive_error(tmp_path: Path):
    json_env, _, _, _ = _environment(tmp_path / "json", archive_version="0.1.0+old")
    json_result = _invoke(
        {**json_env, "REBUILD_ARCHIVE_CURRENT": "1"},
        "--build",
        "--json",
    )

    assert json_result.returncode == 0, json_result.stderr
    assert json.loads(json_result.stdout) == {
        "DELIVERY": "NOT_REQUESTED",
        "INSTALLED_STATE": "UNKNOWN",
        "LOCAL_VALIDATION": "PASS",
        "PACKAGE_CREATED": "PASS",
        "error": "",
    }

    human_env, _, _, _ = _environment(tmp_path / "human", archive_version="0.1.0+old")
    human_result = _invoke(
        {**human_env, "REBUILD_ARCHIVE_CURRENT": "1"},
        "--build",
    )

    assert human_result.returncode == 0, human_result.stderr
    assert "LOCAL_VALIDATION PASS" in human_result.stdout
    assert "PACKAGE_CREATED PASS" in human_result.stdout
    assert "archive is stale" not in human_result.stderr
