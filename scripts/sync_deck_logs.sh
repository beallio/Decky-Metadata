#!/usr/bin/env bash
# Sync Decky-Metadata plugin logs from a Steam Deck into the project temp root.
#
# Defaults try the user's SSH bookmarks in order:
#   steamdeck, then steamdeck-legos
#
# Environment overrides:
#   DECKY_LOG_HOSTS       Space-separated host aliases to try
#   DECKY_LOG_REMOTE_DIR  Remote Deck log directory
#   DECKY_LOG_SYNC_DIR    Local destination root
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

cache_root="$(awk -F= '$1 == "CACHE_ROOT" { print $2 }' .protocol 2>/dev/null)"
cache_root="${cache_root:-/tmp/Decky-Metadata}"

remote_dir="${DECKY_LOG_REMOTE_DIR:-/home/deck/homebrew/logs/Decky-Metadata}"
dest_root="${DECKY_LOG_SYNC_DIR:-$cache_root/deck-logs}"
hosts="${DECKY_LOG_HOSTS:-steamdeck steamdeck-legos}"

mkdir -p "$dest_root"

selected_host=""
for host in $hosts; do
  if ssh -q -o BatchMode=yes -o ConnectTimeout=3 "$host" "test -d '$remote_dir'" >/dev/null 2>&1; then
    selected_host="$host"
    break
  fi
done

if [[ -z "$selected_host" ]]; then
  echo "sync_deck_logs: no reachable Deck log directory found." >&2
  echo "sync_deck_logs: tried hosts: $hosts" >&2
  echo "sync_deck_logs: remote dir: $remote_dir" >&2
  exit 1
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
dest="$dest_root/$selected_host/$timestamp"
mkdir -p "$dest"

echo "sync_deck_logs: copying $selected_host:$remote_dir -> $dest"
scp -p -r "$selected_host:$remote_dir/." "$dest/"

latest_link="$dest_root/$selected_host/latest"
rm -f "$latest_link"
ln -s "$dest" "$latest_link"

echo "sync_deck_logs: synced logs to $dest"
echo "sync_deck_logs: latest -> $latest_link"
