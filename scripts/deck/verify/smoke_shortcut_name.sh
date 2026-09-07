#!/usr/bin/env bash
# Persistent-but-reverted UI smoke for per-game Steam shortcut names.
#
#   smoke_shortcut_name.sh <shortcut-appid> <expected-cleaned-steam-name>
#
# Normal writes go only through the visible editor controls. The trap uses the
# native API solely to restore the captured name after an assertion failure.
set -euo pipefail

input_fail() { printf 'FAIL: %s\n' "$1" >&2; exit 2; }

shortcut_appid="${1:-}"
expected_name="${2:-}"
[[ "$shortcut_appid" =~ ^[1-9][0-9]*$ ]] || input_fail "shortcut app ID is required"
[[ -n "$expected_name" ]] || input_fail "expected Steam name is required"

source "$(dirname -- "${BASH_SOURCE[0]}")/_lib.sh"

evidence_root="${SMOKE_SHORTCUT_NAME_EVIDENCE_DIR:-/tmp/Decky-Metadata/per-game-steam-shortcut-names}"
[[ "$evidence_root" == /tmp/Decky-Metadata/* ]] || fail "evidence path must be below /tmp/Decky-Metadata"
device_label="${DECKY_DECK_HOST:-local}"
device_label="$(printf %s "$device_label" | tr -cd '[:alnum:]._-')"
[[ -n "$device_label" ]] || device_label="local"
evidence_dir="$evidence_root/$device_label"
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

probe_matches_target() { # probe_matches_target <json> <want-target:true|false>
  python3 - "$1" "$2" <<'PY'
import json, sys
try:
    payload = json.loads(sys.argv[1])
except Exception:
    raise SystemExit(2)
if not payload.get("native") or payload.get("running") or not payload.get("hasCurrent"):
    raise SystemExit(2)
raise SystemExit(0 if bool(payload.get("matchesTarget")) == (sys.argv[2] == "true") else 1)
PY
}

wait_for_target() { # wait_for_target <want-target:true|false> <phase>
  local want_target="$1" phase="$2" payload="" result=0
  for _ in {1..30}; do
    payload="$(probe)" || fail "$phase: native shortcut probe failed"
    result=0
    probe_matches_target "$payload" "$want_target" || result=$?
    if [[ "$result" == 0 ]]; then
      printf %s "$payload"
      return 0
    fi
    if [[ "$result" != 1 ]]; then
      assert_probe "$payload" "$want_target" "$phase"
    fi
    sleep 0.1
  done
  assert_probe "$payload" "$want_target" "$phase"
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

is_exact_original() { # is_exact_original <json>
  python3 - "$1" "$original_b64" "$original_sort_b64" <<'PY'
import json, sys
try:
    payload = json.loads(sys.argv[1])
except Exception:
    raise SystemExit(1)
raise SystemExit(0 if payload.get("currentB64") == sys.argv[2] and payload.get("sortAsB64") == sys.argv[3] else 1)
PY
}

wait_for_exact_original() { # wait_for_exact_original <phase>
  local phase="$1" payload=""
  for _ in {1..30}; do
    payload="$(probe)" || fail "$phase: native shortcut probe failed"
    if is_exact_original "$payload"; then
      printf %s "$payload"
      return 0
    fi
    sleep 0.1
  done
  python3 - "$payload" "$original_b64" "$original_sort_b64" "$phase" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
if payload.get("currentB64") != sys.argv[2]:
    raise SystemExit(f"FAIL: {sys.argv[4]} did not return the exact original shortcut name")
raise SystemExit(f"FAIL: {sys.argv[4]} changed sort_as")
PY
}

cleanup() {
  status=$?
  cleanup_failed=0
  if [[ "$restore_armed" == 1 && -n "$original_b64" ]]; then
    cleanup_request="$(cdp eval SharedJSContext "@$JS_DIR/restore_shortcut_name.js" \
      --var "APPID=$shortcut_appid" --var "NAME_B64=$original_b64" 2>&1)" || cleanup_failed=1
    if [[ "$cleanup_request" == FAIL:* ]]; then
      cleanup_failed=1
    fi
    restored=0
    for _ in {1..30}; do
      current="$(probe || true)"
      if is_exact_original "$current"; then
        restored=1
        break
      fi
      sleep 0.1
    done
    if [[ "$restored" != 1 ]]; then
      cleanup_failed=1
    fi
  fi
  if [[ "$cleanup_failed" == 1 ]]; then
    printf 'FAIL: cleanup could not restore the exact original shortcut name and sort_as\n' >&2
    exit 1
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

renamed="$(wait_for_target true "after UI rename")"
assert_probe "$renamed" true "after UI rename"
assert_management "$(management)" true "after UI rename"

cdp reload "$BPM_TARGET" >/dev/null
cdp wait-ready --timeout 30 >/dev/null
after_reload="$(wait_for_target true "after rename reload")"
assert_probe "$after_reload" true "after rename reload"

nav "/decky-metadata/$shortcut_appid"
restore_result="$(cdp eval "$BPM_TARGET" "@$JS_DIR/click_by_label.js" --var 'LABEL=Restore original name')"
[[ "$restore_result" != FAIL:* ]] || fail "editor never exposed expected control"
modal_restore="$(cdp eval "$BPM_TARGET" "@$JS_DIR/click_modal_label.js" --var 'LABEL=Restore original name')"
[[ "$modal_restore" != FAIL:* ]] || fail "editor never exposed expected control"

restored="$(wait_for_exact_original "after UI restore")"
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
final_probe="$(wait_for_exact_original "after restore reload")"
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
