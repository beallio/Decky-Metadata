#!/usr/bin/env bash
set -euo pipefail
#
# Keeps generated caches, temporary files, and Cargo output outside the
# checkout. Existing TMPDIR and Cargo overrides are preserved.
#
#   ./run.sh npm run build
#   ./run.sh npm run test:backend
#   ./run.sh node scripts/package.mjs
#   ./run.sh python3 -m py_compile main.py
if [[ -n "${TMPDIR:-}" ]]; then
  CACHE_ROOT="$(realpath -m -- "$TMPDIR")"
  mkdir -p -- "$CACHE_ROOT"
else
  CACHE_ROOT=/var/tmp/omp-1000
  [[ ! -L "$CACHE_ROOT" ]] || {
    echo "run.sh: fallback TMPDIR must not be a symlink: $CACHE_ROOT" >&2
    exit 2
  }
  mkdir -p -m 0700 -- "$CACHE_ROOT"
  chmod 0700 -- "$CACHE_ROOT"
fi

CACHE_ROOT="$(realpath -- "$CACHE_ROOT")"
[[ -d "$CACHE_ROOT" ]] || {
  echo "run.sh: TMPDIR is not a directory: $CACHE_ROOT" >&2
  exit 2
}

export TMPDIR="$CACHE_ROOT"
export XDG_CACHE_HOME="$CACHE_ROOT/.cache"
export npm_config_cache="$CACHE_ROOT/.npm"
export PYTHONPYCACHEPREFIX="$CACHE_ROOT/__pycache__"
export UV_CACHE_DIR="$CACHE_ROOT/.uv"
export CARGO_HOME="${CARGO_HOME:-$CACHE_ROOT/cargo-home}"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$CACHE_ROOT/cargo-target/Decky-Metadata}"

mkdir -p -- \
  "$XDG_CACHE_HOME" \
  "$npm_config_cache" \
  "$PYTHONPYCACHEPREFIX" \
  "$UV_CACHE_DIR" \
  "$CARGO_HOME" \
  "$CARGO_TARGET_DIR"

echo "Using cache root: $CACHE_ROOT" >&2
exec "$@"
