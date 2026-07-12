#!/usr/bin/env bash
# Wait until the Deck is reachable over SSH, then optionally run a command.
#
#   wait_online.sh [--timeout SECONDS] [--interval SECONDS] [-- CMD ...]
#
# Polls `ssh <host> echo` until it answers (host = DECKY_DECK_HOST, default
# steamdeck), then execs CMD if one was given after `--`. Exits 0 when reachable,
# 1 on timeout. The Deck drops off Wi-Fi / sleeps intermittently, so gate deploys
# and on-device checks behind this rather than failing on a transient outage:
#
#   scripts/deck/wait_online.sh -- scripts/decky package-push --push
set -euo pipefail

host="${DECKY_DECK_HOST:-steamdeck}"
timeout=1800
interval=15
cmd=()
while (($#)); do
  case "$1" in
    --timeout) timeout="$2"; shift 2 ;;
    --interval) interval="$2"; shift 2 ;;
    --) shift; cmd=("$@"); break ;;
    *) echo "wait_online: unknown arg $1" >&2; exit 2 ;;
  esac
done

deadline=$(( $(date +%s) + timeout ))
until ssh -o ConnectTimeout=5 -o BatchMode=yes "$host" "echo online" 2>/dev/null | grep -q online; do
  if (( $(date +%s) >= deadline )); then
    echo "wait_online: $host still offline after ${timeout}s" >&2
    exit 1
  fi
  sleep "$interval"
done

echo "wait_online: $host reachable"
if ((${#cmd[@]})); then
  exec "${cmd[@]}"
fi
