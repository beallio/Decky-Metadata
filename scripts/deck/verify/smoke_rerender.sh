#!/usr/bin/env bash
# Re-render churn check — the gameinfo-focus-reset regression guard.
#
#   smoke_rerender.sh <appid>
#
# Opens the game page, then does 3 same-app subsection round-trips
# (detail -> /activity -> back). There must be no SetCachedDataForApp writes
# for this app, and none of the keys the plugin writes for any app: that churn
# is what reset focus/scroll before the fix. Steam itself refreshes other apps'
# details (e.g. "achievements") in the background; those are listed, not failed.
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
python3 - "$dump" "$appid" <<'PY' || exit 1
import json, sys
d = json.loads(sys.argv[1])
if d.get("error"):
    sys.exit(f"FAIL: {d['error']}")
# Keep in sync with the SetCachedDataForApp keys in src/steam/metadataPatch.ts.
plugin_keys = {"descriptions", "associations", "screenshots"}
churn = [c for c in d["calls"] if str(c.get("appid")) == sys.argv[2] or c.get("key") in plugin_keys]
if churn:
    sys.exit(f"FAIL: {len(churn)} cache writes during same-app round-trips: {churn}")
other = sorted({f"{c.get('appid')}:{c.get('key')}" for c in d["calls"]})
if other:
    print(f"note: ignored Steam's own writes for other apps: {', '.join(other)}")
PY
pass "re-render churn: 0 plugin cache writes across 3 subsection round-trips on $appid"
