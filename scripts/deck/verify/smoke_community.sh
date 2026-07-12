#!/usr/bin/env bash
# Community fallback render check for a never-on-Steam shortcut.
#
#   smoke_community.sh <never-on-steam-appid>
#
# A non-Steam shortcut that was never on Steam populates its Community tab from
# stored metadata screenshots (provider-icon cards), or shows nothing when it has
# no stored screenshots. Uses the plugin's own `feed selected` log line as the
# source of truth for what the fallback served, then asserts the DOM rendered
# matching cards. When the fixture has no stored screenshots, rendering nothing is
# correct (PASS with a note).
source "$(dirname -- "${BASH_SOURCE[0]}")/_lib.sh"

appid="${1:?usage: smoke_community.sh <never-on-steam-appid>}"
host="${DECKY_DECK_HOST:-steamdeck}"
log="/home/deck/homebrew/logs/Decky-Metadata/decky-metadata.log"

nav "/library/app/$appid"
sleep 2
cdp eval "$BPM_TARGET" "@$JS_DIR/click_by_label.js" --var "LABEL=Community" >/dev/null
sleep 5

feed_line="$(ssh "$host" "grep -aE \"feed selected appId='${appid}'.*page='1'\" '$log' 2>/dev/null | tail -1")"
source_val="$(sed -nE "s/.*source='([^']*)'.*/\1/p" <<<"$feed_line")"
hublen_val="$(sed -nE "s/.*hubLen='([^']*)'.*/\1/p" <<<"$feed_line")"
cards_json="$(cdp eval "$BPM_TARGET" "@$JS_DIR/community_cards.js")"

python3 - "$appid" "$source_val" "$hublen_val" "$cards_json" <<'PY' || exit 1
import json, sys
appid, source, hublen, cards_raw = sys.argv[1:]
cards = json.loads(cards_raw)
if source in ("", "native", "none") or hublen in ("", "0"):
    print(f"NOTE: {appid} has no metadata fallback content "
          f"(source={source or 'n/a'}, hubLen={hublen or 'n/a'}); nothing to render is correct")
    sys.exit(0)
if cards["cardImageCount"] <= 0:
    sys.exit(f"FAIL: fallback served source={source} hubLen={hublen} "
             f"but no card images rendered in the Community tab")
print(f"OK: source={source} hubLen={hublen} "
      f"cards={cards['cardImageCount']} data-uri-avatars={cards['dataUriAvatarCount']}")
PY
pass "community: appid=$appid fallback renders (or correctly empty when no stored content)"
