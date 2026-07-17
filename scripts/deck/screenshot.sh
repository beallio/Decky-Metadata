#!/usr/bin/env bash
# Capture the visual Gaming Mode page through the Deck's CEF debugger.
#
# Usage: screenshot.sh OUTPUT.png [TARGET_TITLE]
#
# Relative outputs are written below /tmp/Decky-Metadata/screenshots. Absolute
# outputs must remain below DECKY_TMP_ROOT (default /tmp/Decky-Metadata).
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

tmp_root="$(realpath -m "${DECKY_TMP_ROOT:-/tmp/Decky-Metadata}")"
[[ "$tmp_root" == /tmp || "$tmp_root" == /tmp/* ]] || {
  echo "screenshot: DECKY_TMP_ROOT must resolve below /tmp" >&2
  exit 2
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: screenshot.sh OUTPUT.png [TARGET_TITLE]" >&2
  exit 2
fi

output="$1"
target="${2:-Steam Big Picture Mode}"
if [[ "$output" == /* ]]; then
  output_path="$(realpath -m "$output")"
else
  output_path="$(realpath -m "$tmp_root/screenshots/$output")"
fi
[[ "$output_path" == "$tmp_root"/* ]] || {
  echo "screenshot: output must resolve below $tmp_root" >&2
  exit 2
}

DECKY_DECK_HOST="${DECKY_DECK_HOST:-steamdeck}" \
  "$repo_root/scripts/deck/tunnel.sh" up
DECKY_TMP_ROOT="$tmp_root" \
  "$repo_root/scripts/deck/cdp.py" screenshot "$output_path" "$target"
