import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).parents[1]
CHECKER = ROOT / "scripts/deck/verify/check_launch.py"
TARGET_APPID = 12345
TARGET_GAMEID = str((TARGET_APPID << 32) | 0x02000000)


def run_checker(dump: dict, *, stdin: bool = False) -> subprocess.CompletedProcess[str]:
    payload = json.dumps(dump)
    command = [sys.executable, str(CHECKER), str(TARGET_APPID)]
    if not stdin:
        command.append(payload)
    return subprocess.run(
        command,
        cwd=ROOT,
        input=payload if stdin else None,
        text=True,
        capture_output=True,
    )


def target_running(*, run_game_calls: list[list[str]] | None = None) -> dict:
    return {
        "runGameCalls": run_game_calls or [[TARGET_GAMEID]],
        "running": [
            {"appid": TARGET_APPID, "name": "Target", "gameid": TARGET_GAMEID},
        ],
    }


def test_target_launched_with_64_bit_gameid_passes_from_stdin():
    result = run_checker(target_running(), stdin=True)

    assert result.returncode == 0
    assert result.stdout.strip() == TARGET_GAMEID
    assert result.stderr == ""


def test_nothing_running_fails_cleanly():
    result = run_checker({"runGameCalls": [], "running": []})

    assert result.returncode != 0
    assert result.stderr.startswith("FAIL: nothing running after Play press")


def test_unrelated_running_app_does_not_false_pass_target():
    result = run_checker(
        {
            "runGameCalls": [[TARGET_GAMEID]],
            "running": [{"appid": 999, "name": "Other", "gameid": TARGET_GAMEID}],
        }
    )

    assert result.returncode != 0
    assert f"target appid {TARGET_APPID} is not running" in result.stderr


def test_bare_appid_gameid_for_target_fails():
    result = run_checker(target_running(run_game_calls=[[str(TARGET_APPID)]]))

    assert result.returncode != 0
    assert "bare appid gameid" in result.stderr


def test_unrelated_32_bit_rungame_call_does_not_fail_target():
    result = run_checker(target_running(run_game_calls=[["999"], [TARGET_GAMEID]]))

    assert result.returncode == 0
    assert result.stdout.strip() == TARGET_GAMEID


def test_non_numeric_rungame_arg_is_skipped_without_crashing():
    result = run_checker(
        target_running(run_game_calls=[["steam://run/999"], [""], [TARGET_GAMEID]])
    )

    assert result.returncode == 0
    assert result.stdout.strip() == TARGET_GAMEID
