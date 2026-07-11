#!/usr/bin/env bash
# Run the full on-device verification suite. Picks test appids from the
# device's metadata store unless overridden:
#
#   MATCHED_APPID   matched game WITH a steam_appid (launch + links-row checks)
#   NEVER_APPID     matched game WITHOUT a steam_appid (links suppression check)
#
#   run_all.sh [--no-launch]   # --no-launch skips the game-launching smoke
#
# NOTE: the launch smoke really starts MATCHED_APPID for a few seconds.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
host="${DECKY_DECK_HOST:-steamdeck}"

if [[ -z "${MATCHED_APPID:-}" || -z "${NEVER_APPID:-}" ]]; then
  picks="$(ssh "$host" 'python3 -' <<'PY'
import json
data = json.load(open("/home/deck/homebrew/settings/Decky-Metadata/decky_metadata.json"))
metadata = data.get("metadata", data)
matched = never = ""
for appid, entry in metadata.items():
    if not isinstance(entry, dict):
        continue
    steam_appid = entry.get("steam_appid")
    if steam_appid and not matched:
        matched = appid
    if not steam_appid and not never:
        never = appid
print(matched, never)
PY
)"
  read -r auto_matched auto_never <<<"$picks"
  MATCHED_APPID="${MATCHED_APPID:-$auto_matched}"
  NEVER_APPID="${NEVER_APPID:-$auto_never}"
fi
[[ -n "$MATCHED_APPID" && -n "$NEVER_APPID" ]] || { echo "run_all: could not pick test appids" >&2; exit 1; }

echo "run_all: matched=$MATCHED_APPID never-on-steam=$NEVER_APPID"
failures=0

run() {
  echo "--- $*"
  if "$@"; then :; else failures=$((failures + 1)); fi
}

run "$here/smoke_quicklinks.sh" "$MATCHED_APPID" "$NEVER_APPID"
run "$here/smoke_rerender.sh" "$MATCHED_APPID"
if [[ "${1:-}" != "--no-launch" ]]; then
  run "$here/smoke_launch.sh" "$MATCHED_APPID"
else
  echo "--- launch smoke skipped (--no-launch)"
fi

if [[ "$failures" -gt 0 ]]; then
  echo "run_all: $failures check(s) FAILED" >&2
  exit 1
fi
echo "run_all: all checks passed"
