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

running_count="$(cdp eval SharedJSContext 'String(SteamUIStore.RunningApps.length)')"
[[ "$running_count" == "0" ]] || fail \
  "pre-flight requires no running games (found $running_count); stop them and retry"

cdp eval SharedJSContext "@$JS_DIR/tracer_rungame_install.js" >/dev/null
nav "/library/app/$appid"
click="$(cdp eval "$BPM_TARGET" "@$JS_DIR/click_play.js" --var "APPID=$appid")"
[[ "$click" == clicked* ]] || fail "could not press Play: $click"
sleep 6
dump="$(cdp eval SharedJSContext "@$JS_DIR/tracer_rungame_dump.js")"

gameid="$(printf '%s' "$dump" | python3 "$(dirname -- "${BASH_SOURCE[0]}")/check_launch.py" "$appid")"

cdp eval SharedJSContext "@$JS_DIR/terminate.js" --var "GAMEID=$gameid" >/dev/null
echo "terminated $gameid"
pass "launch smoke for appid $appid (game started with a 64-bit gameid)"
