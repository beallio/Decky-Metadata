#!/usr/bin/env bash
# Persistent-but-reverted UI smoke for per-game Steam shortcut names.
#
#   smoke_shortcut_name.sh <shortcut-appid> <expected-cleaned-steam-name>
#   smoke_shortcut_name.sh --fixture-test <missing-appid|empty-target|equal-target|absent-control>
#
# Normal writes go only through the visible editor controls. The trap uses the
# native API solely to restore the captured name after an assertion failure.
set -euo pipefail

fixture_test() {
  case "${1:-}" in
    missing-appid) printf 'FAIL: shortcut app ID is required\n' >&2; return 2 ;;
    empty-target) printf 'FAIL: expected Steam name is required\n' >&2; return 2 ;;
    equal-target) printf 'FAIL: expected Steam name already matches current shortcut name\n' >&2; return 2 ;;
    absent-control) printf 'FAIL: editor never exposed expected control\n' >&2; return 2 ;;
    *) printf 'FAIL: unknown shortcut-name fixture test\n' >&2; return 2 ;;
  esac
}

if [[ "${1:-}" == "--fixture-test" ]]; then
  fixture_test "${2:-}"
  exit $?
fi

shortcut_appid="${1:-}"
expected_name="${2:-}"
[[ "$shortcut_appid" =~ ^[1-9][0-9]*$ ]] || fixture_test missing-appid
[[ -n "$expected_name" ]] || fixture_test empty-target

source "$(dirname -- "${BASH_SOURCE[0]}")/_lib.sh"

evidence_dir="/tmp/Decky-Metadata/per-game-steam-shortcut-names"
mkdir -p "$evidence_dir"
evidence="$evidence_dir/shortcut-name-${shortcut_appid}.json"
expected_b64="$(printf %s "$expected_name" | base64 | tr -d '\n')"
original_b64=""
original_sort_b64=""
restore_armed=0

probe() {
  cdp eval SharedJSContext "@$JS_DIR/shortcut_name_probe.js" \
    --var "APPID=$shortcut_appid" --var "TARGET_B64=$expected_b64"
}

management() {
  cdp eval SharedJSContext "@$JS_DIR/check_shortcut_name_management.js" --var "APPID=$shortcut_appid"
}

assert_probe() { # assert_probe <json> <want-target:true|false> <phase>
  python3 - "$1" "$2" "$3" "$expected_b64" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
want_target = sys.argv[2] == "true"
phase = sys.argv[3]
if not payload.get("native"):
    raise SystemExit(f"FAIL: {phase}: requested app is not a native shortcut")
if payload.get("running"):
    raise SystemExit(f"FAIL: {phase}: a game is running")
if not payload.get("hasCurrent"):
    raise SystemExit(f"FAIL: {phase}: native shortcut has no display name")
if not isinstance(payload.get("currentB64"), str) or not payload["currentB64"]:
    raise SystemExit(f"FAIL: {phase}: native shortcut name is unavailable")
if bool(payload.get("matchesTarget")) != want_target:
    if want_target:
        raise SystemExit(f"FAIL: {phase}: Steam did not report the expected shortcut name")
    raise SystemExit("FAIL: expected Steam name already matches current shortcut name")
PY
}

assert_management() { # assert_management <json> <has-state:true|false> <phase>
  python3 - "$1" "$2" "$3" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
if payload.get("ok") is not True:
    raise SystemExit(f"FAIL: {sys.argv[3]}: backend eligibility is not ready ({payload.get('reason')})")
if bool(payload.get("hasState")) != (sys.argv[2] == "true"):
    raise SystemExit(f"FAIL: {sys.argv[3]}: backend shortcut-name state is unexpected")
PY
}

cleanup() {
  status=$?
  if [[ "$restore_armed" == 1 && -n "$original_b64" ]]; then
    cdp eval SharedJSContext "@$JS_DIR/restore_shortcut_name.js" \
      --var "APPID=$shortcut_appid" --var "NAME_B64=$original_b64" >/dev/null || true
    for _ in {1..30}; do
      current="$(probe || true)"
      if python3 - "$current" "$original_b64" <<'PY'
import json, sys
try:
    raise SystemExit(0 if json.loads(sys.argv[1]).get("currentB64") == sys.argv[2] else 1)
except Exception:
    raise SystemExit(1)
PY
      then
        break
      fi
      sleep 0.1
    done
  fi
  exit "$status"
}
trap cleanup EXIT

before="$(probe)"
assert_probe "$before" false "preflight"
original_b64="$(python3 - "$before" <<'PY'
import json, sys
print(json.loads(sys.argv[1])["currentB64"])
PY
)"
original_sort_b64="$(python3 - "$before" <<'PY'
import json, sys
print(json.loads(sys.argv[1])["sortAsB64"])
PY
)"
assert_management "$(management)" false "preflight"
restore_armed=1

nav "/decky-metadata/$shortcut_appid"
click_result="$(cdp eval "$BPM_TARGET" "@$JS_DIR/click_by_label.js" --var 'LABEL=Use Steam name')"
[[ "$click_result" != FAIL:* ]] || fail "editor never exposed expected control"
modal_result="$(cdp eval "$BPM_TARGET" "@$JS_DIR/click_modal_label.js" --var 'LABEL=Use Steam name')"
[[ "$modal_result" != FAIL:* ]] || fail "editor never exposed expected control"

renamed="$(probe)"
assert_probe "$renamed" true "after UI rename"
assert_management "$(management)" true "after UI rename"

cdp reload "$BPM_TARGET" >/dev/null
cdp wait-ready --timeout 30 >/dev/null
after_reload="$(probe)"
assert_probe "$after_reload" true "after rename reload"

nav "/decky-metadata/$shortcut_appid"
restore_result="$(cdp eval "$BPM_TARGET" "@$JS_DIR/click_by_label.js" --var 'LABEL=Restore original name')"
[[ "$restore_result" != FAIL:* ]] || fail "editor never exposed expected control"
modal_restore="$(cdp eval "$BPM_TARGET" "@$JS_DIR/click_modal_label.js" --var 'LABEL=Restore original name')"
[[ "$modal_restore" != FAIL:* ]] || fail "editor never exposed expected control"

restored="$(probe)"
python3 - "$restored" "$original_b64" "$original_sort_b64" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
if payload.get("currentB64") != sys.argv[2]:
    raise SystemExit("FAIL: UI restore did not return the exact original shortcut name")
if payload.get("sortAsB64") != sys.argv[3]:
    raise SystemExit("FAIL: UI restore changed sort_as")
PY
assert_management "$(management)" false "after UI restore"

cdp reload "$BPM_TARGET" >/dev/null
cdp wait-ready --timeout 30 >/dev/null
final_probe="$(probe)"
python3 - "$final_probe" "$original_b64" "$original_sort_b64" "$evidence" "$shortcut_appid" <<'PY'
import base64, hashlib, json, sys, time
payload = json.loads(sys.argv[1])
if payload.get("currentB64") != sys.argv[2]:
    raise SystemExit("FAIL: restored shortcut name did not persist after reload")
if payload.get("sortAsB64") != sys.argv[3]:
    raise SystemExit("FAIL: restored sort_as did not persist after reload")
def digest(encoded):
    return hashlib.sha256(base64.b64decode(encoded)).hexdigest()
evidence = {
    "status": "passed",
    "shortcutAppId": int(sys.argv[5]),
    "nameRestored": True,
    "sortAsRestored": True,
    "originalNameSha256": digest(sys.argv[2]),
    "finalNameSha256": digest(payload["currentB64"]),
    "completedAt": int(time.time()),
}
open(sys.argv[4], "w", encoding="utf-8").write(json.dumps(evidence, sort_keys=True) + "\n")
PY

restore_armed=0
trap - EXIT
pass "shortcut name: UI rename persisted and UI restore completed; evidence=$evidence"
