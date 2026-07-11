#!/usr/bin/env bash
# Launch smoke test for a non-Steam shortcut — the launch-regression check.
#
#   smoke_launch.sh <appid>
#
# Navigates to the game page and presses Play IMMEDIATELY (inside the route
# shield window — the case the nonsteam-launch-incall-truth fix covers), then
# asserts the game actually starts and any traced RunGame call used a real
# 64-bit shortcut gameid, not the bare appid. Terminates the game afterwards.
#
# NOTE: this really launches the game for a few seconds.
source "$(dirname -- "${BASH_SOURCE[0]}")/_lib.sh"

appid="${1:?usage: smoke_launch.sh <appid>}"

cdp eval SharedJSContext "@$JS_DIR/tracer_rungame_install.js" >/dev/null
nav "/library/app/$appid"
click="$(cdp eval "$BPM_TARGET" "@$JS_DIR/click_play.js")"
[[ "$click" == clicked* ]] || fail "could not press Play: $click"
sleep 6
dump="$(cdp eval SharedJSContext "@$JS_DIR/tracer_rungame_dump.js")"

gameid="$(python3 - "$appid" "$dump" <<'PY'
import json, sys
appid, dump = sys.argv[1], sys.argv[2]
d = json.loads(dump)
if not d.get("running"):
    sys.exit(f"FAIL: nothing running after Play press (RunGame calls: {d.get('runGameCalls')})")
for call in d.get("runGameCalls", []):
    gid = call[0]
    if gid == appid or int(gid) <= 0xFFFFFFFF:
        sys.exit(f"FAIL: RunGame received a bare appid gameid: {gid} (launch-regression signature)")
print(d["running"][0].get("gameid") or "")
PY
)" || exit 1

if [[ -n "$gameid" ]]; then
  cdp eval SharedJSContext "@$JS_DIR/terminate.js" --var "GAMEID=$gameid" >/dev/null
  echo "terminated $gameid"
fi
pass "launch smoke for appid $appid (game started with a 64-bit gameid)"
