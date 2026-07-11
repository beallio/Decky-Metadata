#!/usr/bin/env bash
# Command wrapper for Decky-Metadata.
#
# Keeps every generated cache, temp file, and install footprint OUT of Dropbox by
# redirecting them under /tmp/Decky-Metadata. Run project tooling through
# this wrapper so the redirections apply:
#
#   ./run.sh npm ci
#   ./run.sh npm run build
#   ./run.sh npx tsc --noEmit
#   ./run.sh python3 -m py_compile main.py
CACHE_ROOT=/tmp/Decky-Metadata

export TMPDIR="$CACHE_ROOT"
export XDG_CACHE_HOME="$CACHE_ROOT/.cache"
export npm_config_cache="$CACHE_ROOT/.npm"
export PYTHONPYCACHEPREFIX="$CACHE_ROOT/__pycache__"

mkdir -p "$TMPDIR" "$XDG_CACHE_HOME" "$npm_config_cache" "$PYTHONPYCACHEPREFIX"

echo "Using cache root: $CACHE_ROOT" >&2
exec "$@"
