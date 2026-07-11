#!/usr/bin/env bash
# Fast on-device iteration loop: build -> push bundle -> hard-reload UI -> wait.
#
#   deploy.sh              build, scp dist/index.js, reload, wait-ready
#   deploy.sh --no-build   skip the rollup build (push what's in dist/)
#
# The hard reload (Page.reload ignoreCache) is required: a plain plugin
# reload does NOT bust the CEF cache, so the old bundle keeps running.
#
# Environment:
#   DECKY_DECK_HOST  ssh host/alias of the Deck (default: steamdeck)
#   CDP_PORT         local tunnel port         (default: 18081)
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

host="${DECKY_DECK_HOST:-steamdeck}"
deck_dir="/home/deck/homebrew/plugins/Decky-Metadata"
here="$(dirname -- "${BASH_SOURCE[0]}")"

if [[ "${1:-}" != "--no-build" ]]; then
  echo "deploy: building bundle..."
  ./run.sh npm run build
fi

"$here/tunnel.sh" up

echo "deploy: pushing dist/index.js -> ${host}:${deck_dir}/dist/"
scp -q dist/index.js "${host}:${deck_dir}/dist/index.js"

echo "deploy: hard-reloading Steam UI..."
python3 "$here/cdp.py" reload SharedJSContext

echo "deploy: waiting for UI + Decky..."
python3 "$here/cdp.py" wait-ready

echo "deploy: done — new bundle live."
