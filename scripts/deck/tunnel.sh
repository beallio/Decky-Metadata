#!/usr/bin/env bash
# Manage the SSH tunnel to the Steam Deck's CEF remote debugger.
#
#   tunnel.sh up      open localhost:$CDP_PORT -> deck 127.0.0.1:8080 (idempotent)
#   tunnel.sh down    close the tunnel
#   tunnel.sh status  report tunnel + debugger reachability
#
# Environment:
#   DECKY_DECK_HOST  ssh host/alias of the Deck (default: steamdeck)
#   CDP_PORT         local tunnel port         (default: 18081)
#
# The tunnel process is identified by its exact forward spec, so down/status
# never touch unrelated ssh sessions.
set -euo pipefail

host="${DECKY_DECK_HOST:-steamdeck}"
port="${CDP_PORT:-18081}"
forward_spec="${port}:localhost:8080"

tunnel_pids() {
  pgrep -f -- "ssh .*-L ${forward_spec} ${host}" 2>/dev/null || true
}

debugger_ok() {
  curl -s --max-time 4 "http://localhost:${port}/json/version" | grep -q '"Browser"'
}

case "${1:-}" in
  up)
    if debugger_ok; then
      echo "tunnel: already up (localhost:${port})"
      exit 0
    fi
    # A dead tunnel can still hold the pid; clear it before reopening.
    pids="$(tunnel_pids)"
    [[ -n "$pids" ]] && kill $pids 2>/dev/null || true
    ssh -f -N -o ExitOnForwardFailure=yes -o ConnectTimeout=8 -L "$forward_spec" "$host"
    sleep 1
    if debugger_ok; then
      echo "tunnel: up (localhost:${port} -> ${host}:8080)"
    else
      echo "tunnel: ssh connected but debugger not answering on ${host}:8080." >&2
      echo "tunnel: is Steam running with CEF debugging enabled (~/.steam/steam/.cef-enable-remote-debugging)?" >&2
      exit 1
    fi
    ;;
  down)
    pids="$(tunnel_pids)"
    if [[ -z "$pids" ]]; then
      echo "tunnel: not running"
      exit 0
    fi
    kill $pids
    echo "tunnel: closed (pids: $pids)"
    ;;
  status)
    pids="$(tunnel_pids)"
    if [[ -n "$pids" ]] && debugger_ok; then
      echo "tunnel: up (pids: $pids, localhost:${port})"
    elif [[ -n "$pids" ]]; then
      echo "tunnel: ssh alive (pids: $pids) but debugger unreachable"
      exit 1
    else
      echo "tunnel: down"
      exit 1
    fi
    ;;
  *)
    echo "usage: tunnel.sh up|down|status" >&2
    exit 2
    ;;
esac
