from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).parents[1]


def fixture(tmp_path: Path) -> Path:
    root = tmp_path / "fixture"
    verify = root / "scripts/deck/verify"
    js = root / "scripts/deck/js"
    verify.mkdir(parents=True, exist_ok=True)
    js.mkdir(parents=True, exist_ok=True)
    smoke = verify / "smoke_shortcut_name.sh"
    smoke.write_text((ROOT / "scripts/deck/verify/smoke_shortcut_name.sh").read_text())
    (verify / "_lib.sh").write_text(
        """set -euo pipefail
DECK_DIR="$(cd -- "$(dirname -- "$0")/.." && pwd)"
JS_DIR="$DECK_DIR/js"
BPM_TARGET="Steam Big Picture Mode"
"$DECK_DIR/tunnel.sh" up >/dev/null
cdp() { python3 "$DECK_DIR/cdp.py" "$@"; }
nav() { cdp eval SharedJSContext "@$JS_DIR/nav.js" --var "ROUTE=$1" >/dev/null; }
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
"""
    )
    tunnel = root / "scripts/deck/tunnel.sh"
    tunnel.write_text("#!/usr/bin/env bash\nexit 0\n")
    tunnel.chmod(0o755)
    (root / "scripts/deck/cdp.py").write_text(
        """import base64, json, os, sys
from pathlib import Path

path = Path(os.environ["FAKE_STATE"])
def load():
    return json.loads(path.read_text()) if path.exists() else {"current": "Original", "state": False, "pending": 0}
def save(data):
    path.write_text(json.dumps(data))
def b64(value):
    return base64.b64encode(value.encode()).decode()
def unb64(value):
    return base64.b64decode(value).decode()
def variables(args):
    return dict(item.split("=", 1) for index, item in enumerate(args) if index and args[index - 1] == "--var")

args = sys.argv[1:]
if args[:1] in (["reload"], ["wait-ready"]):
    raise SystemExit()
if args[:1] != ["eval"]:
    raise SystemExit("unexpected fake CDP command")
source = args[2]
vars = variables(args)
data = load()
if "shortcut_name_probe.js" in source:
    target = unb64(vars["TARGET_B64"])
    if data["pending"]:
        data["pending"] -= 1
    elif data.get("rename"):
        data["current"] = target
    save(data)
    current = data["current"]
    print(json.dumps({"native": True, "running": False, "hasCurrent": True, "currentB64": b64(current), "sortAsB64": b64("sort"), "matchesTarget": current == target}))
elif "check_shortcut_name_management.js" in source:
    print(json.dumps({"ok": True, "reason": "ready", "hasState": data["state"]}))
elif "restore_shortcut_name.js" in source:
    if os.environ.get("FAKE_CLEANUP_FAIL") == "1":
        print("FAIL: forced cleanup failure")
    else:
        data.update(current="Original", state=False, rename=False)
        save(data)
        print("cleanup requested")
elif "click_by_label.js" in source:
    print("FAIL: absent" if os.environ.get("FAKE_ABSENT_CONTROL") == "1" else "clicked")
elif "click_modal_label.js" in source:
    if vars.get("LABEL") == "Use Steam name":
        data.update(state=True, rename=True, pending=int(os.environ.get("FAKE_DELAYED_POLLS", "0")))
    elif vars.get("LABEL") == "Restore original name" and os.environ.get("FAKE_POST_RENAME_FAILURE") != "1":
        data.update(current="Original", state=False, rename=False)
    save(data)
    print("clicked")
else:
    print("{}")
"""
    )
    for name in ("shortcut_name_probe.js", "check_shortcut_name_management.js", "restore_shortcut_name.js", "click_by_label.js", "click_modal_label.js", "nav.js"):
        (js / name).write_text("// fake")
    return smoke


def run(tmp_path: Path, *args: str, **overrides: str):
    smoke = fixture(tmp_path)
    state = tmp_path / "state.json"
    evidence_root = Path("/tmp/Decky-Metadata/pytest-shortcut-name-smoke") / tmp_path.name
    completed = subprocess.run(
        ["bash", str(smoke), *args],
        capture_output=True,
        text=True,
        timeout=10,
        env={
            **os.environ,
            "FAKE_STATE": str(state),
            "SMOKE_SHORTCUT_NAME_EVIDENCE_DIR": str(evidence_root),
            "DECKY_DECK_HOST": "fixture-deck",
            **overrides,
        },
    )
    return completed, state, evidence_root / "fixture-deck" / "shortcut-name-2312439508.json"


def test_smoke_uses_real_argument_and_equal_target_preflights(tmp_path: Path):
    missing, _state, _evidence = run(tmp_path, "", "Expected")
    assert missing.returncode != 0
    assert "FAIL: shortcut app ID is required" in missing.stderr

    empty, _state, _evidence = run(tmp_path, "2312439508", "")
    assert empty.returncode != 0
    assert "FAIL: expected Steam name is required" in empty.stderr

    equal, _state, _evidence = run(tmp_path, "2312439508", "Original")
    assert equal.returncode != 0
    assert "FAIL: expected Steam name already matches current shortcut name" in equal.stderr


def test_smoke_polls_delayed_ui_success(tmp_path: Path):
    completed, _state, evidence = run(tmp_path, "2312439508", "Expected", FAKE_DELAYED_POLLS="3")

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(evidence.read_text())
    assert payload["status"] == "passed"
    assert payload["nameRestored"] is True
    assert payload["sortAsRestored"] is True


def test_smoke_runs_absent_control_and_forced_restore_failures_through_real_path(tmp_path: Path):
    absent, state, _evidence = run(tmp_path, "2312439508", "Expected", FAKE_ABSENT_CONTROL="1")
    assert absent.returncode != 0
    assert "FAIL: editor never exposed expected control" in absent.stderr
    assert json.loads(state.read_text())["current"] == "Original"

    failed_restore, state, _evidence = run(tmp_path, "2312439508", "Expected", FAKE_POST_RENAME_FAILURE="1")
    assert failed_restore.returncode != 0
    assert "FAIL: after UI restore did not return the exact original shortcut name" in failed_restore.stderr
    assert json.loads(state.read_text())["current"] == "Original"


def test_smoke_reports_cleanup_failure(tmp_path: Path):
    completed, _state, _evidence = run(
        tmp_path, "2312439508", "Expected", FAKE_ABSENT_CONTROL="1", FAKE_CLEANUP_FAIL="1"
    )

    assert completed.returncode != 0
    assert "FAIL: cleanup could not restore the exact original shortcut name and sort_as" in completed.stderr
