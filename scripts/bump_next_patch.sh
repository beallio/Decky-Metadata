#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

python_bin="$(command -v python3 || command -v python)"
highest_tag="$("$python_bin" scripts/version_guard.py highest)"

if [[ -z "$highest_tag" ]]; then
  echo "No stable release tags found; leaving package.json/plugin.json unchanged."
  exit 0
fi

highest_version="${highest_tag#v}"
next_version="$("$python_bin" scripts/version_guard.py next-patch "$highest_version")"
"$python_bin" scripts/set_release_version.py "$next_version"
