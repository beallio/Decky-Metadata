#!/usr/bin/env bash
# Run the full on-device verification suite. Picks test appids from the
# device's metadata store unless overridden:
#
#   MATCHED_APPID   matched game WITH a steam_appid (launch + links-row checks)
#   DELISTED_APPID  matched game whose Steam store entry is delisted
#   NEVER_APPID     matched game WITHOUT a steam_appid (links suppression check)
#   QUICKLINK_FEATURE_APPID  render-only match with DLC + Points Shop metadata
#
#   run_all.sh [--no-launch] [--extended]
#
# NOTE: the launch smoke really starts MATCHED_APPID for a few seconds.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
host="${DECKY_DECK_HOST:-steamdeck}"
launch_appid_explicit=0
[[ -n "${MATCHED_APPID:-}" ]] && launch_appid_explicit=1
QUICKLINK_FEATURE_APPID="${QUICKLINK_FEATURE_APPID:-}"
no_launch=0
extended=0
while (($#)); do
  case "$1" in
    --no-launch) no_launch=1 ;;
    --extended) extended=1 ;;
    *) echo "run_all: unknown option $1" >&2; exit 2 ;;
  esac
  shift
done

run_id="${DECKY_VERIFY_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
run_dir="/tmp/Decky-Metadata/verification/$run_id"
mkdir -p "$run_dir"

metadata="$run_dir/metadata.json"
ssh "$host" 'cat /home/deck/homebrew/settings/Decky-Metadata/decky_metadata.json' >"$metadata"
fixture_args=()
[[ -z "${MATCHED_APPID:-}" ]] || fixture_args+=(--listed-match "$MATCHED_APPID")
[[ -z "${DELISTED_APPID:-}" ]] || fixture_args+=(--delisted-match "$DELISTED_APPID")
[[ -z "${NEVER_APPID:-}" ]] || fixture_args+=(--never-on-steam "$NEVER_APPID")
"${here}/select_fixtures.py" "$metadata" "${fixture_args[@]}" >"$run_dir/fixtures.json"
read -r auto_matched auto_delisted auto_never < <(python3 - "$run_dir/fixtures.json" <<'PY'
import json,sys
f=json.load(open(sys.argv[1]))["fixtures"]
print((f["listed_match"] or {}).get("appid",""),(f["delisted_match"] or {}).get("appid",""),(f["never_on_steam"] or {}).get("appid",""))
PY
)
MATCHED_APPID="${MATCHED_APPID:-$auto_matched}"
DELISTED_APPID="${DELISTED_APPID:-$auto_delisted}"
NEVER_APPID="${NEVER_APPID:-$auto_never}"
[[ -n "$MATCHED_APPID" && -n "$DELISTED_APPID" && -n "$NEVER_APPID" ]] || { echo "run_all: could not pick semantic test appids" >&2; exit 1; }

echo "run_all: listed=$MATCHED_APPID delisted=$DELISTED_APPID never-on-steam=$NEVER_APPID feature=${QUICKLINK_FEATURE_APPID:-SKIP}"
failures=0

run() {
  echo "--- $*"
  if "$@"; then :; else failures=$((failures + 1)); fi
}

run "$here/smoke_quicklinks.sh" "$MATCHED_APPID" "$NEVER_APPID" "$DELISTED_APPID" "$QUICKLINK_FEATURE_APPID"
run "$here/smoke_rerender.sh" "$MATCHED_APPID"
run "$here/smoke_community.sh" "$NEVER_APPID"
if ((no_launch)); then
  run "$here/smoke_controller_layouts.sh" "$run_dir/fixtures.json" "$run_dir/controller-layouts.json"
else
  echo "--- controller-layout smoke SKIP (use --no-launch for read-only verification)"
fi
if ((!no_launch && launch_appid_explicit)); then
  run "$here/smoke_launch.sh" "$MATCHED_APPID"
elif ((!no_launch)); then
  echo "--- launch smoke SKIP (set explicit MATCHED_APPID; auto-selected fixtures are render-only)"
else
  echo "--- launch smoke skipped (--no-launch)"
fi
if ((extended)); then
  run "$here/smoke_idle_quicklinks.sh" "$MATCHED_APPID" "$NEVER_APPID" "$DELISTED_APPID" "$QUICKLINK_FEATURE_APPID"
fi

if [[ "$failures" -gt 0 ]]; then
  echo "run_all: $failures check(s) FAILED" >&2
  exit 1
fi
echo "run_all: all checks passed"
