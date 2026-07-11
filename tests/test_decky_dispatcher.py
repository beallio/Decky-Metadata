from __future__ import annotations

import os
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).parents[1]


def invoke(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run([str(ROOT / "scripts/decky"), *args], cwd=ROOT, text=True, capture_output=True, env={**os.environ, "DECKY_TMP_ROOT": "/tmp/Decky-Metadata/test-dispatcher"})


def test_help_pins_public_commands():
    result = invoke("help")
    assert result.returncode == 0
    for command in ("doctor", "verify-change", "capture", "package-push", "status", "steamui"):
        assert command in result.stdout


def test_invalid_command_is_usage_error():
    assert invoke("nope").returncode == 2


def test_launch_consent_requires_device():
    result = invoke("verify-change", "dev", "--allow-launch")
    assert result.returncode == 2
    assert "requires --device" in result.stderr


def test_doctor_json_stdout_is_machine_readable():
    result = invoke("doctor", "--json")
    assert result.returncode == 0
    assert json.loads(result.stdout)["schema_version"] == 1


def test_merge_base_errors_are_reported_without_device_actions():
    result = invoke("verify-change", "definitely-not-a-ref", "--explain")
    assert result.returncode == 1
    assert "cannot resolve merge base" in result.stderr


def test_unknown_frontend_changes_choose_broad_device_classification():
    body = (ROOT / "scripts/decky").read_text()
    assert 'src/*)' in body
    assert 'class=device; add_checks quick-links re-render' in body


def _fake_change_repo(tmp_path: Path, changed_paths: list[str]) -> tuple[dict[str, str], Path]:
    fake_root = tmp_path / "repo"
    fake_bin = tmp_path / "bin"
    log = tmp_path / "actions.log"
    (fake_root / "scripts/orchestration").mkdir(parents=True)
    (fake_root / "scripts/deck/verify").mkdir(parents=True)
    fake_bin.mkdir()
    git = fake_bin / "git"
    git.write_text(
        "#!/usr/bin/env bash\n"
        "case \"$*\" in\n"
        f"  *--show-toplevel*) echo '{fake_root}' ;;\n"
        "  *merge-base*) echo deadbeef ;;\n"
        "  *diff*--name-only*) printf '%s\\n' \"${CHANGED_PATHS}\" ;;\n"
        "  *) exit 1 ;;\n"
        "esac\n"
    )
    git.chmod(0o755)
    for relative, label in (
        ("scripts/orchestration/run-quality-gates", "quality"),
        ("scripts/deck/deploy.sh", "deploy"),
        ("scripts/deck/verify/run_all.sh", "run-all $*"),
        ("scripts/deck/capture.sh", "capture"),
    ):
        path = fake_root / relative
        path.write_text(f'#!/usr/bin/env bash\necho "{label}" >>"$ACTION_LOG"\n')
        path.chmod(0o755)
    return {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "CHANGED_PATHS": "\n".join(changed_paths),
        "ACTION_LOG": str(log),
        "DECKY_TMP_ROOT": str(tmp_path / "state"),
    }, log


def test_verify_change_unions_multi_path_requirements_deterministically(tmp_path):
    env, _ = _fake_change_repo(tmp_path, ["src/launchFlow.ts", "src/routerView.tsx"])
    result = subprocess.run(
        [str(ROOT / "scripts/decky"), "verify-change", "dev", "--explain"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        env=env,
    )
    assert result.returncode == 0, result.stderr
    assert "CHECKS quality-gates quick-links re-render launch" in result.stdout
    assert result.stdout.rstrip().endswith("REQUIRED scripts/decky verify-change dev --device")


def test_required_launch_remains_deferred_without_launch_consent(tmp_path):
    env, log = _fake_change_repo(tmp_path, ["src/launchFlow.ts"])
    result = subprocess.run(
        [str(ROOT / "scripts/decky"), "verify-change", "dev", "--device"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        env=env,
    )
    assert result.returncode == 0, result.stderr
    assert "STATUS DEFERRED" in result.stdout and "STATUS PASS" not in result.stdout
    assert log.read_text().splitlines() == ["quality", "deploy", "run-all --no-launch"]


def test_launch_consent_requires_an_explicit_approved_appid(tmp_path):
    env, log = _fake_change_repo(tmp_path, ["src/launchFlow.ts"])
    result = subprocess.run(
        [str(ROOT / "scripts/decky"), "verify-change", "dev", "--device", "--allow-launch"],
        cwd=ROOT,
        text=True,
        capture_output=True,
        env={key: value for key, value in env.items() if key != "MATCHED_APPID"},
    )
    assert result.returncode == 2
    assert "requires an explicit MATCHED_APPID" in result.stderr
    assert log.read_text().splitlines() == ["quality"]
