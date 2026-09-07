from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).parents[1]


def fixture(tmp_path: Path, management_helper: str | None = None) -> Path:
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
        """import base64, json, os, subprocess, sys
from pathlib import Path

path = Path(os.environ["FAKE_STATE"])
original = os.environ.get("FAKE_ORIGINAL", "Original")
def load():
    return json.loads(path.read_text()) if path.exists() else {
        "current": original,
        "state": False,
        "pending": 0,
        "management_pending": 0,
        "editor_pending": int(os.environ.get("FAKE_DELAYED_EDITOR_READINESS", "0")),
        "modal_pending": int(os.environ.get("FAKE_DELAYED_MODAL_READINESS", "0")),
    }
def save(data):
    path.write_text(json.dumps(data))
def b64(value):
    return base64.b64encode(value.encode()).decode()
def unb64(value):
    return base64.b64decode(value).decode()
def variables(args):
    return dict(item.split("=", 1) for index, item in enumerate(args) if index and args[index - 1] == "--var")

args = sys.argv[1:]
if args[:1] == ["reload"]:
    if args[1:] != ["SharedJSContext"]:
        raise SystemExit("reload must target SharedJSContext")
    data = load()
    data["shared_reloads"] = data.get("shared_reloads", 0) + 1
    save(data)
    raise SystemExit()
if args[:1] == ["wait-ready"]:
    data = load()
    if not data.get("shared_reloads"):
        raise SystemExit("wait-ready requires a SharedJSContext reload")
    data["ready_waits"] = data.get("ready_waits", 0) + 1
    save(data)
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
    if data.get("management_pending", 0):
        data["management_pending"] -= 1
        if not data["management_pending"]:
            data["state"] = False
        save(data)
    if os.environ.get("FAKE_MISSING_LOADER") == "1":
        print(json.dumps({"ok": False, "reason": "loader_unavailable", "hasState": False}))
    else:
        helper = Path(source[1:]).read_text().replace("__APPID__", vars["APPID"])
        response = {"eligible": True, "reason": "ready", "state": {} if data["state"] else None}
        harness = '''
const expectedAppId = %s;
const response = %s;
const api = {
  call: function(route, ...args) {
    if (this !== api) throw new Error("backend call receiver was lost");
    if (route !== "get_shortcut_name_management" || args.length !== 1 ||
        typeof args[0] !== "number" || args[0] !== expectedAppId) {
      throw new Error("backend call must receive exactly one scalar app id");
    }
    return Promise.resolve(response);
  },
};
const loader = {
  connect: function(version, pluginName) {
    if (this !== loader) throw new Error("loader connect receiver was lost");
    if ((version !== 1 && version !== 2) || pluginName !== "Decky Metadata") {
      throw new Error("wrong plugin connection");
    }
    return api;
  },
};
global.window = { __DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit: loader };
Promise.resolve(eval(%s)).then(
  (value) => process.stdout.write(String(value)),
  (error) => { console.error(error.message); process.exit(1); },
);
''' % (json.dumps(int(vars["APPID"])), json.dumps(response), json.dumps(helper))
        completed = subprocess.run(["node", "-e", harness], capture_output=True, text=True)
        if completed.returncode:
            raise SystemExit(completed.stderr.strip() or "management helper failed")
        print(completed.stdout)
elif "shortcut_name_editor_status.js" in source:
    if os.environ.get("FAKE_ABSENT_CONTROL") == "1":
        print(json.dumps({"status": "unavailable", "reason": "control_absent"}))
    elif data.get("editor_pending", 0):
        data["editor_pending"] -= 1
        save(data)
        print(json.dumps({"status": "loading", "reason": "metadata_or_backfill_pending"}))
    else:
        print(json.dumps({"status": "ready", "reason": "control_ready"}))
elif "shortcut_name_modal_status.js" in source:
    if data.get("modal_pending", 0):
        data["modal_pending"] -= 1
        save(data)
        print(json.dumps({"status": "loading", "reason": "modal_not_rendered"}))
    else:
        print(json.dumps({"status": "ready", "reason": "modal_control_ready"}))
elif "restore_shortcut_name.js" in source:
    if os.environ.get("FAKE_CLEANUP_FAIL") == "1":
        print("FAIL: forced cleanup failure")
    else:
        helper = Path(source[1:]).read_text().replace("__APPID__", vars["APPID"]).replace("__NAME_B64__", vars["NAME_B64"])
        harness = '''
const expectedAppId = %s;
const expectedName = %s;
let called = false;
const apps = {
  SetShortcutName: function(appId, name) {
    if (this !== apps) throw new Error("Apps receiver was lost");
    if (appId !== expectedAppId || name !== expectedName) throw new Error("wrong cleanup request");
    called = true;
  },
};
global.SteamClient = { Apps: apps };
const result = eval(%s);
if (result !== "cleanup requested" || !called) throw new Error("cleanup helper did not make the expected request");
''' % (json.dumps(int(vars["APPID"])), json.dumps(original), json.dumps(helper))
        completed = subprocess.run(["node", "-e", harness], capture_output=True, text=True)
        if completed.returncode:
            raise SystemExit(completed.stderr.strip() or "receiver-sensitive cleanup transport rejected helper")
        data.update(current=original, state=False, rename=False)
        save(data)
        print(completed.stdout or "cleanup requested")
elif "click_by_label.js" in source:
    print("FAIL: absent" if os.environ.get("FAKE_ABSENT_CONTROL") == "1" else "clicked")
elif "click_modal_label.js" in source:
    if vars.get("LABEL") == "Use Steam name":
        data.update(state=True, rename=True, pending=int(os.environ.get("FAKE_DELAYED_POLLS", "0")))
    elif vars.get("LABEL") == "Restore original name" and os.environ.get("FAKE_POST_RENAME_FAILURE") != "1":
        delay = int(os.environ.get("FAKE_DELAYED_HISTORY_POLLS", "0"))
        data.update(current=original, rename=False, management_pending=delay)
        if not delay:
            data["state"] = False
    save(data)
    print("clicked")
else:
    print("{}")
"""
    )
    for name in (
        "shortcut_name_probe.js",
        "check_shortcut_name_management.js",
        "restore_shortcut_name.js",
        "shortcut_name_editor_status.js",
        "shortcut_name_modal_status.js",
        "click_by_label.js",
        "click_modal_label.js",
        "nav.js",
    ):
        source = (ROOT / "scripts/deck/js" / name).read_text()
        if name == "check_shortcut_name_management.js" and management_helper is not None:
            source = management_helper
        (js / name).write_text(source)
    return smoke


def run(tmp_path: Path, *args: str, management_helper: str | None = None, **overrides: str):
    smoke = fixture(tmp_path, management_helper)
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


def test_smoke_waits_for_editor_and_modal_readiness_before_clicking(tmp_path: Path):
    completed, _state, evidence = run(
        tmp_path,
        "2312439508",
        "Expected",
        FAKE_DELAYED_EDITOR_READINESS="3",
        FAKE_DELAYED_MODAL_READINESS="2",
    )

    assert completed.returncode == 0, completed.stderr
    assert json.loads(evidence.read_text())["status"] == "passed"


def test_smoke_waits_for_delayed_history_clear_and_shared_context_checkpoints(tmp_path: Path):
    completed, state, _evidence = run(
        tmp_path, "2312439508", "Expected", FAKE_DELAYED_HISTORY_POLLS="3"
    )

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(state.read_text())
    assert payload["state"] is False
    assert payload["shared_reloads"] == 2
    assert payload["ready_waits"] == 2


def test_smoke_runs_absent_control_and_forced_restore_failures_through_real_path(tmp_path: Path):
    absent, state, _evidence = run(tmp_path, "2312439508", "Expected", FAKE_ABSENT_CONTROL="1")
    assert absent.returncode != 0
    assert "FAIL: editor control 'Use Steam name' is unavailable (control_absent)" in absent.stderr
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


def test_smoke_executes_the_management_helper_and_rejects_bad_rpc_contracts(tmp_path: Path):
    missing_loader, _state, _evidence = run(
        tmp_path, "2312439508", "Expected", FAKE_MISSING_LOADER="1"
    )
    assert missing_loader.returncode != 0
    assert "backend eligibility is not ready (loader_unavailable)" in missing_loader.stderr

    helper = (ROOT / "scripts/deck/js/check_shortcut_name_management.js").read_text()
    wrong_shape = helper.replace(
        'api.call.call(api, "get_shortcut_name_management", appId)',
        'api.call.call(api, "get_shortcut_name_management", [appId])',
    )
    bad_call, _state, _evidence = run(
        tmp_path, "2312439508", "Expected", management_helper=wrong_shape
    )
    assert bad_call.returncode != 0
    assert "backend eligibility is not ready (rpc_failed)" in bad_call.stderr


def test_smoke_restores_a_whitespace_bearing_name_after_a_forced_failure(tmp_path: Path):
    original = "  Original ™  "
    completed, state, _evidence = run(
        tmp_path,
        "2312439508",
        "Expected",
        FAKE_ORIGINAL=original,
        FAKE_POST_RENAME_FAILURE="1",
    )

    assert completed.returncode != 0
    assert "FAIL: after UI restore did not return the exact original shortcut name" in completed.stderr
    assert json.loads(state.read_text())["current"] == original


def test_smoke_uses_the_plugin_scoped_rpc_and_reloads_its_owning_context():
    helper = (ROOT / "scripts/deck/js/check_shortcut_name_management.js").read_text()
    probe = (ROOT / "scripts/deck/js/shortcut_name_probe.js").read_text()
    smoke = (ROOT / "scripts/deck/verify/smoke_shortcut_name.sh").read_text()

    assert "deckyLoaderAPIInit" in helper
    assert 'api.call.call(api, "get_shortcut_name_management", appId)' in helper
    assert "[appId]" not in helper
    assert smoke.count("cdp reload SharedJSContext") == 2
    assert "overview.display_name.trim()" not in probe
    assert "wait_for_editor_control" in smoke
    assert "wait_for_modal_control" in smoke


def test_emergency_cleanup_helper_keeps_the_apps_receiver():
    helper = (ROOT / "scripts/deck/js/restore_shortcut_name.js").read_text()
    harness = """
const apps = {
  SetShortcutName: function(appId, name) {
    if (this !== apps) throw new Error("Apps receiver was lost");
    if (appId !== 2312439508 || name !== "  Original ™  ") throw new Error("wrong cleanup request");
  },
};
global.SteamClient = { Apps: apps };
const result = eval(%s);
if (result !== "cleanup requested") throw new Error(String(result));
""" % json.dumps(
        helper.replace("__APPID__", "2312439508").replace(
            "__NAME_B64__", "ICBPcmlnaW5hbCDihKIgIA=="
        )
    )
    completed = subprocess.run(["node", "-e", harness], capture_output=True, text=True)
    assert completed.returncode == 0, completed.stderr
