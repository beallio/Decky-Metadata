#!/usr/bin/env bash
# Pre-commit sanity check for Decky-Metadata.
#
# This repo is a Decky plugin: TS/React frontend + single-file Python backend.
# Guard the checks that break a build silently:
#   1. staged TypeScript still type-checks
#   2. a staged main.py still parses
#   3. backend tests pass when backend/test files are staged
#
# Exit non-zero to block the commit. Skips cleanly when the relevant files or
# tools are not part of the staged change.
set -euo pipefail

staged=$(git diff --cached --name-only --diff-filter=ACM)

# --- frontend: type-check staged TS -----------------------------------------
if echo "$staged" | grep -q '^src/.*\.tsx\?$'; then
  if command -v npx >/dev/null 2>&1 && [ -d node_modules ]; then
    npx tsc --noEmit
  else
    echo "⚠️  skipping tsc (node_modules/npx unavailable)"
  fi
fi

# --- backend: syntax-check staged main.py -----------------------------------
if echo "$staged" | grep -qx 'main.py'; then
  python_bin=$(command -v python3 || command -v python || true)
  if [ -n "$python_bin" ]; then
    "$python_bin" -m py_compile main.py
  else
    echo "⚠️  skipping py_compile (python unavailable)"
  fi
fi

# --- backend: pytest staged backend/tests -----------------------------------
if [ -d tests ] && echo "$staged" | grep -Eq '^(main\.py|tests/)'; then
  if command -v uv >/dev/null 2>&1; then
    export UV_CACHE_DIR="/tmp/Decky-Metadata/.uv"
    mkdir -p "$UV_CACHE_DIR"
    uv run --with pytest -- pytest -q
  else
    echo "⚠️  skipping pytest (uv unavailable)"
  fi
fi

echo "check_tdd: OK"
