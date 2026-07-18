#!/usr/bin/env bash
# Prepare a stable GitHub Release locally; never pushes.
#
# Expected stable flow:
#   1. Merge dev into main with --no-ff and check out the clean main branch.
#   2. Run: scripts/release.sh X.Y.Z
#   3. Review the annotated tag, hash-free package, and any version commit.
#   4. Run the printed main/tag pushes when ready.
#   5. Run scripts/bump_next_patch.sh on dev and commit the next development base.
#
# Every push to dev automatically refreshes the rolling dev prerelease; no
# manual release command is needed for that testing channel.
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

usage() {
  cat <<'EOF'
Usage: scripts/release.sh X.Y.Z

Prepare an annotated vX.Y.Z tag and hash-free Decky-Metadata.zip on clean main.
The script creates a version commit only when the metadata version changes;
otherwise it tags the current HEAD. Merge dev to main with --no-ff before running
this command. The script does not push; it prints the explicit push commands.

Development builds need no manual command: every dev push refreshes the rolling
dev prerelease through GitHub Actions.
EOF
}

if [[ ${1:-} == "--help" || ${1:-} == "-h" ]]; then
  usage
  exit 0
fi
if [[ $# -ne 1 || ! $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  usage >&2
  echo "release: version must match X.Y.Z" >&2
  exit 2
fi

version="$1"
tag="v$version"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "release: working tree must be clean" >&2
  exit 1
fi
if git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null; then
  echo "release: tag $tag already exists" >&2
  exit 1
fi
if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "release: expected clean main after the dev -> main --no-ff merge" >&2
  exit 1
fi

python3 scripts/changelog.py check "$version"
scripts/orchestration/run-quality-gates
scripts/set_release_version.py "$version"
git add package.json plugin.json
if ! git diff --cached --quiet; then
  git commit -m "release: $tag"
else
  echo "release: package.json/plugin.json already at $version; tagging current HEAD"
fi
node scripts/package.mjs --release
git tag -a "$tag" -m "Release $tag"

cat <<EOF

Prepared $tag locally on main and built Decky-Metadata.zip.
Review the tag, package, and any version commit. When ready, publish with:

  git push origin main
  git push origin $tag

Afterward, return to dev, run scripts/bump_next_patch.sh, and commit the next
development base so the release drift guard stays green.
EOF
