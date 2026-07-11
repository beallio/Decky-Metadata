#!/usr/bin/env bash
# Quick-links row check on Game Info pages.
#
#   smoke_quicklinks.sh <listed-appid> <never-on-steam-appid> [delisted-appid]
#
# The matched game (has steam_appid) must SHOW the Store Page / Community Hub
# row; the never-on-Steam game must NOT, while both keep plugin metadata
# (developer info) on the page.
source "$(dirname -- "${BASH_SOURCE[0]}")/_lib.sh"

matched="${1:?usage: smoke_quicklinks.sh <matched-appid> <never-appid>}"
never="${2:?usage: smoke_quicklinks.sh <matched-appid> <never-appid>}"
delisted="${3:-}"

check() { # check <appid> -> JSON
  nav "/library/app/$1/tab/GameInfo"
  sleep 4
  cdp eval "$BPM_TARGET" "@$JS_DIR/check_quicklinks.js"
}

matched_json="$(check "$matched")"
never_json="$(check "$never")"
delisted_json="{}"
[[ -z "$delisted" ]] || delisted_json="$(check "$delisted")"

python3 - "$matched_json" "$never_json" "$delisted_json" <<'PY' || exit 1
import json, sys
matched, never, delisted = map(json.loads, sys.argv[1:])
if not matched["quickLinksRow"]:
    sys.exit("FAIL: matched game is missing its quick-links row")
if never["quickLinksRow"]:
    sys.exit("FAIL: never-on-Steam game still shows the dead quick-links row")
if not (matched["developerInfo"] and never["developerInfo"]):
    sys.exit("FAIL: developer metadata missing from a Game Info page")
if delisted:
    if not delisted["developerInfo"]:
        sys.exit("FAIL: delisted game lost rich metadata")
    if delisted["market"]:
        sys.exit("FAIL: delisted game still shows Market")
PY
pass "quick-links: listed=$matched, delisted=${delisted:-SKIP}, never-on-steam=$never; metadata intact"
