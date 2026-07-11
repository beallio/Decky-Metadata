#!/usr/bin/env bash
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
wait_seconds="${DECKY_IDLE_WAIT_SECONDS:-30}"
[[ "$wait_seconds" =~ ^[0-9]+$ ]] || { echo "smoke_idle_quicklinks: invalid wait" >&2; exit 2; }
"$here/smoke_quicklinks.sh" "$1" "$2"
sleep "$wait_seconds"
"$here/smoke_quicklinks.sh" "$1" "$2"
