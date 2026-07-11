#!/usr/bin/env bash
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"; cd "$repo_root"
mode=check
case "${1:---check}" in --check) mode=check;; --install) mode=install;; *) echo "Usage: install_hooks.sh [--check|--install]" >&2; exit 2;; esac
git_dir="${DECKY_GIT_DIR:-$(git rev-parse --git-dir)}"; [[ "$git_dir" == /* ]] || git_dir="$repo_root/$git_dir"
declare -A targets=([pre-commit]=scripts/check_tdd.sh [post-commit]=scripts/post_commit.sh [post-merge]=scripts/post_commit.sh)
status=0
for hook in pre-commit post-commit post-merge; do
  body="#!/usr/bin/env bash
exec \"\$(git rev-parse --show-toplevel)/${targets[$hook]}\" \"\$@\"
"
  path="$git_dir/hooks/$hook"
  last_line="$(sed '/^[[:space:]]*$/d' "$path" 2>/dev/null | tail -n 1 || true)"
  expected_direct='exec "$(git rev-parse --show-toplevel)/'"${targets[$hook]}"'" "$@"'
  expected_variable='exec "$repo_root/'"${targets[$hook]}"'"'
  if [[ -f "$path" && -x "$path" && ( "$last_line" == "$expected_direct" || "$last_line" == "$expected_variable" ) ]]; then echo "$hook: OK"
  elif [[ "$mode" == install ]]; then mkdir -p "$(dirname "$path")"; printf '%s' "$body" >"$path"; chmod +x "$path"; echo "$hook: INSTALLED"
  else echo "$hook: DRIFT"; status=1; fi
done
exit "$status"
