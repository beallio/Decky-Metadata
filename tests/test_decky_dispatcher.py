from __future__ import annotations

import os
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
