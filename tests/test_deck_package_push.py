import hashlib
import json
import os
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).parents[1]
PACKAGE_FIXTURES = ROOT / "tests/fixtures/agent_workflow/package"


def _executable(path: Path, body: str) -> None:
    path.write_text(body)
    path.chmod(0o755)


def _environment(tmp_path: Path, *, archive_version: str = "0.1.0+abc123") -> tuple[dict[str, str], str, str]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    archive = tmp_path / "Decky-Metadata.zip"
    bundle = b"deterministic bundle\n"
    with zipfile.ZipFile(archive, "w") as output:
        for name in ("package.json", "plugin.json"):
            manifest = json.loads((PACKAGE_FIXTURES / name).read_text())
            manifest["version"] = archive_version
            output.writestr(f"Decky-Metadata/{name}", json.dumps(manifest))
        output.writestr("Decky-Metadata/dist/index.js", bundle)
    archive_digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    bundle_digest = hashlib.sha256(bundle).hexdigest()

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
  *plugin.json*) echo "${INSTALLED_VERSION} ${INSTALLED_BUNDLE_SHA}" ;;
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
        "DECKY_TEST_PACKAGE_ZIP": str(archive),
        "DECKY_TMP_ROOT": str(tmp_path / "state"),
        "REMOTE_SHA": archive_digest,
        "INSTALLED_VERSION": archive_version,
        "INSTALLED_BUNDLE_SHA": bundle_digest,
    }
    return env, archive_digest, bundle_digest


def _invoke(env: dict[str, str], *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(ROOT / "scripts/deck/package_push.sh"), *args],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
    )


def test_invalid_option_is_usage_error():
    result = subprocess.run([str(ROOT / "scripts/deck/package_push.sh"), "--unsafe"], cwd=ROOT, text=True, capture_output=True)
    assert result.returncode == 2


def test_stage_names_are_stable():
    body = (ROOT / "scripts/deck/package_push.sh").read_text()
    for stage in ("LOCAL_VALIDATION", "PACKAGE_CREATED", "DELIVERY", "INSTALLED_STATE"):
        assert stage in body
    assert "flock -x" in body and "--hook" in body


def test_hook_authority_cannot_be_inferred():
    result = subprocess.run([str(ROOT / "scripts/deck/package_push.sh"), "--hook"], cwd=ROOT, text=True, capture_output=True)
    assert result.returncode == 2


def test_push_verifies_archive_remote_copy_and_installed_bundle(tmp_path):
    env, _, _ = _environment(tmp_path)
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


def test_remote_checksum_and_installed_bundle_mismatches_are_distinct(tmp_path):
    env, _, _ = _environment(tmp_path)
    bad_remote = _invoke({**env, "REMOTE_SHA": "bad"}, "--push", "--json")
    assert bad_remote.returncode == 1
    assert json.loads(bad_remote.stdout)["DELIVERY"] == "VERIFY_FAILED"

    stale_install = _invoke({**env, "INSTALLED_BUNDLE_SHA": "bad"}, "--push", "--json")
    assert stale_install.returncode == 0
    assert json.loads(stale_install.stdout)["INSTALLED_STATE"] == "REINSTALL_REQUIRED"


def test_stale_archive_and_offline_delivery_semantics(tmp_path):
    stale_env, _, _ = _environment(tmp_path / "stale", archive_version="0.1.0+old")
    stale = _invoke(stale_env, "--json")
    assert stale.returncode == 1
    assert json.loads(stale.stdout)["LOCAL_VALIDATION"] == "FAIL"

    env, _, _ = _environment(tmp_path / "offline")
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


def test_concurrent_hook_builds_are_serialized_by_the_package_lock(tmp_path):
    env, _, _ = _environment(tmp_path)
    lock_log = tmp_path / "lock.log"
    concurrent_env = {
        **env,
        "SSH_OFFLINE": "1",
        "DECKY_HOOK_AUTHORIZED": "1",
        "LOCK_LOG": str(lock_log),
    }
    commands = [str(ROOT / "scripts/deck/package_push.sh"), "--hook", "--json"]
    first = subprocess.Popen(commands, cwd=ROOT, env=concurrent_env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    second = subprocess.Popen(commands, cwd=ROOT, env=concurrent_env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert first.wait() == 0 and second.wait() == 0
    lines = lock_log.read_text().splitlines()
    assert [line.split()[0] for line in lines] == ["start", "end", "start", "end"]
    assert lines[0].split()[1] == lines[1].split()[1]
    assert lines[2].split()[1] == lines[3].split()[1]


def test_sequential_delivery_revalidates_and_skips_duplicate_copy_unless_forced(tmp_path):
    env, _, _ = _environment(tmp_path)
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


def test_json_build_routes_progress_away_from_stdout(tmp_path):
    env, _, _ = _environment(tmp_path)
    result = _invoke(env, "--build", "--json")
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["PACKAGE_CREATED"] == "PASS"
    assert "fake build chatter" not in result.stdout
    assert "fake build chatter" in result.stderr


def test_successful_rebuild_clears_superseded_stale_archive_error(tmp_path):
    json_env, _, _ = _environment(tmp_path / "json", archive_version="0.1.0+old")
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

    human_env, _, _ = _environment(tmp_path / "human", archive_version="0.1.0+old")
    human_result = _invoke(
        {**human_env, "REBUILD_ARCHIVE_CURRENT": "1"},
        "--build",
    )

    assert human_result.returncode == 0, human_result.stderr
    assert "LOCAL_VALIDATION PASS" in human_result.stdout
    assert "PACKAGE_CREATED PASS" in human_result.stdout
    assert "archive is stale" not in human_result.stderr
