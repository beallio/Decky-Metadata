#!/usr/bin/env bash
# Decky-Metadata post-commit: build + package the plugin and push it to the
# Steam Deck for the Developer-Mode sideload loop. Mirrors the approach in
# beallio/SDH-Ludusavi. Installed as .git/hooks/post-commit (see AGENTS.md).
#
# A post-commit hook's exit status is ignored by git, so this never blocks a
# commit; failures are surfaced as warnings only.
#
# Config (env overrides):
#   DECKY_DECK_HOST   ssh host/alias of the Deck        (default: steamdeck)
#   DECKY_DECK_DEST   destination dir on the Deck        (default: /home/deck/Downloads/)
#   DECKY_POST_COMMIT_ALL=1   run on every branch (default: only dev / main)
set -uo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$repo_root" || exit 0

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"

# Skip on feature/orchestration branches so in-progress rounds don't spam
# packages/pushes. Set DECKY_POST_COMMIT_ALL=1 to package on any branch.
if [[ "${DECKY_POST_COMMIT_ALL:-0}" != "1" && "$branch" != "dev" && "$branch" != "main" ]]; then
  echo "post-commit: branch '$branch' is not dev/main; skipping package (DECKY_POST_COMMIT_ALL=1 to force)."
  exit 0
fi

if ! DECKY_HOOK_AUTHORIZED=1 scripts/deck/package_push.sh --hook; then
  echo "post-commit: WARNING package/delivery failed; commit is unaffected." >&2
fi
exit 0
