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
    assert 'class=device; checks=(quick-links re-render)' in body
