#!/usr/bin/env bash
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"; cd "$repo_root"
source_path="$repo_root/skills/decky-project-workflow"
install=0; allow_external=0; dest=""; agent="codex"
while (($#)); do
  case "$1" in
    --install) install=1 ;;
    --dest) [[ $# -ge 2 ]] || { echo "install-project-skill: --dest requires PATH" >&2; exit 2; }; dest="$2"; shift ;;
    --agent) [[ $# -ge 2 ]] || { echo "install-project-skill: --agent requires claude or codex" >&2; exit 2; }; agent="$2"; shift ;;
    --allow-external-worktree) allow_external=1 ;;
    *) echo "install-project-skill: unknown option $1" >&2; exit 2 ;;
  esac
  shift
done
case "$agent" in codex|claude) ;; *) echo "install-project-skill: --agent must be claude or codex" >&2; exit 2;; esac
if [[ -z "$dest" ]]; then
  [[ "$agent" == codex ]] && dest="${CODEX_HOME:-$HOME/.codex}/skills/decky-project-workflow" || dest="$HOME/.claude/skills/decky-project-workflow"
fi
dest="$(realpath -m -s "$dest")"; parent="$(dirname "$dest")"
external=""; probe="$parent"
while [[ ! -e "$probe" && "$probe" != / ]]; do probe="$(dirname "$probe")"; done
if worktree="$(git -C "$probe" rev-parse --show-toplevel 2>/dev/null)" && [[ "$(realpath -m "$worktree")" != "$repo_root" ]]; then external="$worktree"; fi
if [[ -L "$dest" ]]; then
  target="$(realpath -m "$dest")"
  if target_repo="$(git -C "$target" rev-parse --show-toplevel 2>/dev/null)" && [[ "$(realpath -m "$target_repo")" != "$repo_root" ]]; then external="$target_repo"; fi
fi
action=dry-run; ((install)) && action=install
printf 'source: %s\ndestination: %s\naction: %s\n' "$source_path" "$dest" "$action"
[[ -z "$external" || "$allow_external" == 1 ]] || { echo "install-project-skill: destination is in external Git worktree $external; use --allow-external-worktree" >&2; exit 1; }
((install)) || exit 0
if [[ -e "$dest" || -L "$dest" ]]; then
  [[ -L "$dest" && "$(realpath -m "$dest")" == "$source_path" ]] && { echo "already installed"; exit 0; }
  echo "install-project-skill: destination conflict: $dest" >&2; exit 1
fi
mkdir -p "$parent"; ln -s "$source_path" "$dest"; echo "installed"
