#!/usr/bin/env bash
# Canned queries over the plugin's device logs and Steam's client logs.
#
#   logs.sh reasons                BIsModOrShortcut decision-reason distribution
#   logs.sh hijacks                render-shield decisions that overrode in-call truth
#                                  (bypassCounterBefore=-1 — the launch-killer signature)
#   logs.sh gameactions [appid]    GameAction task sequences (all apps or one appid)
#   logs.sh launches               game process add/remove lines (gameprocess_log)
#   logs.sh tail [n]               tail the live plugin log (default 50 lines)
#   logs.sh sync                   snapshot plugin logs locally (sync_deck_logs.sh)
#
# Environment:
#   DECKY_DECK_HOST  ssh host/alias of the Deck (default: steamdeck)
set -euo pipefail

host="${DECKY_DECK_HOST:-steamdeck}"
plugin_logs='~/homebrew/logs/Decky-Metadata'
steam_logs='~/.local/share/Steam/logs'

case "${1:-}" in
  reasons)
    ssh "$host" "grep -ho \"reason='[a-z-]*'\" ${plugin_logs}/decky-metadata.log* 2>/dev/null | sort | uniq -c | sort -rn"
    ;;
  hijacks)
    ssh "$host" "grep -h \"reason='render-shield'\" ${plugin_logs}/decky-metadata.log* 2>/dev/null | grep \"bypassCounterBefore='-1'\" | tail -20"
    ;;
  gameactions)
    if [[ -n "${2:-}" ]]; then
      ssh "$host" "grep -h \"GameAction \\[AppID ${2},\" ${steam_logs}/console_log.previous.txt ${steam_logs}/console_log.txt 2>/dev/null | tail -40"
    else
      ssh "$host" "grep -h 'GameAction' ${steam_logs}/console_log.txt 2>/dev/null | tail -40"
    fi
    ;;
  launches)
    ssh "$host" "grep -hE 'adding PID|no longer tracking|Remove .* from running list' ${steam_logs}/gameprocess_log.txt 2>/dev/null | tail -30"
    ;;
  tail)
    ssh "$host" "tail -n ${2:-50} ${plugin_logs}/decky-metadata.log"
    ;;
  sync)
    exec "$(git rev-parse --show-toplevel)/scripts/sync_deck_logs.sh"
    ;;
  *)
    sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
