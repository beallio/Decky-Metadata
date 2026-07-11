#!/usr/bin/env bash
# Re-render churn check — the gameinfo-focus-reset regression guard.
#
#   smoke_rerender.sh <appid>
#
# Opens the game page, then does 3 same-app subsection round-trips
# (detail -> /activity -> back). The plugin must not issue any
# SetCachedDataForApp writes during the round-trips: that churn is what reset
# focus/scroll before the fix.
source "$(dirname -- "${BASH_SOURCE[0]}")/_lib.sh"

appid="${1:?usage: smoke_rerender.sh <appid>}"

cdp eval SharedJSContext "@$JS_DIR/counter_cachewrites_install.js" >/dev/null
nav "/library/app/$appid"
sleep 4
# Re-running the install snippet resets the baseline to the current count,
# so first-entry writes (activity refresh) are excluded from the assertion.
cdp eval SharedJSContext "@$JS_DIR/counter_cachewrites_install.js" >/dev/null

for _ in 1 2 3; do
  nav "/library/app/$appid/activity"
  sleep 2
  cdp eval SharedJSContext "@$JS_DIR/goback.js" >/dev/null
  sleep 2
done

dump="$(cdp eval SharedJSContext "@$JS_DIR/counter_cachewrites_dump.js" --var RESTORE=yes)"
python3 - "$dump" <<'PY' || exit 1
import json, sys
d = json.loads(sys.argv[1])
if d.get("error"):
    sys.exit(f"FAIL: {d['error']}")
if d["sinceBase"] != 0:
    sys.exit(f"FAIL: {d['sinceBase']} cache writes during same-app round-trips: {d['calls']}")
PY
pass "re-render churn: 0 cache writes across 3 subsection round-trips on $appid"
