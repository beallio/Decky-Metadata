from __future__ import annotations

import json
import sys

import pytest

from scripts import check_ign_trailers as monitor


def _install_diagnostics(tmp_path, monkeypatch, stdout, returncode=0):
    target = tmp_path / "target"
    binary = target / "debug" / "backend-diagnostics"
    binary.parent.mkdir(parents=True, exist_ok=True)
    binary.write_text(
        f"#!{sys.executable}\nimport sys\nsys.stdout.write({json.dumps(stdout)})\nsys.exit({returncode})\n",
        encoding="utf-8",
    )
    binary.chmod(0o755)
    monkeypatch.setenv("CARGO_TARGET_DIR", str(target))


def test_monitor_preserves_human_success_output_and_exit_status(tmp_path, monkeypatch, capsys):
    checked = ["Deadpool: Deadpool Official Trailer (720p MP4)",
               "Bloodborne: Bloodborne Story Trailer (1080p MP4)"]
    _install_diagnostics(tmp_path, monkeypatch, json.dumps({"checked": checked, "error": None}))

    assert monitor.main() == 0
    assert capsys.readouterr().out == "".join(f"OK: {item}\n" for item in checked)


def test_monitor_preserves_native_failure_as_human_failure(tmp_path, monkeypatch, capsys):
    message = "Bloodborne: no accessible IGN MP4 (2 qualities; last error: HTTP error)"
    _install_diagnostics(
        tmp_path, monkeypatch,
        json.dumps({"checked": ["Deadpool: Deadpool Official Trailer (720p MP4)"],
                    "error": {"type": "ContractError", "message": message}}),
        returncode=1,
    )

    assert monitor.main() == 1
    assert capsys.readouterr().err == f"IGN trailer capability check failed: {message}\n"


@pytest.mark.parametrize(("stdout", "returncode"), [
    ("not JSON", 0),
    (json.dumps({"checked": [], "error": None}), 0),
    (json.dumps({"checked": [], "error": None}), 2),
    (json.dumps({"checked": ["", ""], "error": None}), 0),
    (json.dumps({"checked": ["Bloodborne: trailer", "Deadpool: trailer"], "error": None}), 0),
    (json.dumps({"checked": ["Deadpool: trailer", "Bloodborne: trailer"]}), 0),
])
def test_monitor_does_not_turn_malformed_or_failed_process_output_into_success(
    tmp_path, monkeypatch, capsys, stdout, returncode
):
    _install_diagnostics(tmp_path, monkeypatch, stdout, returncode)

    assert monitor.main() == 1
    assert "failed:" in capsys.readouterr().err


def test_monitor_reports_missing_native_binary(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("CARGO_TARGET_DIR", str(tmp_path / "empty-target"))

    assert monitor.main() == 1
    assert "build it explicitly first" in capsys.readouterr().err
