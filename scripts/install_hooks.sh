#!/usr/bin/env bash
set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"; cd "$repo_root"
mode=check
case "${1:---check}" in --check) mode=check;; --install) mode=install;; *) echo "Usage: install_hooks.sh [--check|--install]" >&2; exit 2;; esac
git_dir="${DECKY_GIT_DIR:-$(git rev-parse --git-dir)}"; [[ "$git_dir" == /* ]] || git_dir="$repo_root/$git_dir"
declare -A targets=([pre-commit]=scripts/check_tdd.sh [post-commit]=scripts/post_commit.sh [post-merge]=scripts/post_commit.sh)
legacy_body() {
  case "$1" in
    pre-commit) printf '%s' $'#!/usr/bin/env bash\n# Playhub Metadata pre-commit gate (installed from AGENTS.md contract).\nset -euo pipefail\nrepo_root="$(git rev-parse --show-toplevel)"\nexec "$repo_root/scripts/check_tdd.sh"' ;;
    post-commit) printf '%s' $'#!/usr/bin/env bash\n# Decky-Metadata post-commit hook (installed from AGENTS.md contract).\n# Delegates to the tracked scripts/post_commit.sh: build + package + push to Deck.\nrepo_root="$(git rev-parse --show-toplevel)"\nexec "$repo_root/scripts/post_commit.sh"' ;;
    post-merge) printf '%s' $'#!/usr/bin/env bash\n# Decky-Metadata post-merge hook.\n# git merge (and git pull) fire post-merge, NOT post-commit, so the orchestration\n# flow that lands work on dev via `git merge --no-ff` needs this to trigger the\n# same build + package + push-to-Deck step as post-commit.\nrepo_root="$(git rev-parse --show-toplevel)"\nexec "$repo_root/scripts/post_commit.sh"' ;;
  esac
}
status=0
for hook in pre-commit post-commit post-merge; do
  body="#!/usr/bin/env bash
exec \"\$(git rev-parse --show-toplevel)/${targets[$hook]}\" \"\$@\"
"
  path="$git_dir/hooks/$hook"
  actual="$(cat "$path" 2>/dev/null || true)"
  expected_direct="${body%$'\n'}"
  expected_legacy="$(legacy_body "$hook")"
  if [[ -f "$path" && -x "$path" && ( "$actual" == "$expected_direct" || "$actual" == "$expected_legacy" ) ]]; then echo "$hook: OK"
  elif [[ "$mode" == install ]]; then mkdir -p "$(dirname "$path")"; printf '%s' "$body" >"$path"; chmod +x "$path"; echo "$hook: INSTALLED"
  else echo "$hook: DRIFT"; status=1; fi
done
exit "$status"
