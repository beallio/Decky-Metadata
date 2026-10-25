#!/usr/bin/env bash
# Pre-commit sanity checks for the frontend and native packaging paths.
set -euo pipefail

staged=$(git diff --cached --name-only --diff-filter=ACM)

if echo "$staged" | grep -q '^src/.*\.tsx\?$'; then
  if command -v npx >/dev/null 2>&1 && [ -d node_modules ]; then
    ./run.sh npx tsc --noEmit
  else
    echo "check_tdd: tsc requires installed node_modules and npx" >&2
    exit 1
  fi
fi

if echo "$staged" | grep -qx 'main.py'; then
  ./run.sh python3 -m py_compile main.py
fi

if echo "$staged" | grep -Eq '^(backend-rust/.*|package\.json|plugin\.json|main\.py|scripts/package\.mjs|scripts/build_backend\.mjs)$'; then
  ./run.sh npm run test:backend
  ./run.sh npm run build:backend
  ./run.sh cargo build --locked --manifest-path backend-rust/Cargo.toml --bin backend-diagnostics
fi

if echo "$staged" | grep -Eq '^(package\.json|plugin\.json|main\.py|scripts/package\.mjs|scripts/build_backend\.mjs|tests/package_mjs_test\.mjs)$'; then
  ./run.sh node --test tests/package_mjs_test.mjs
fi

if [ -d tests ] && echo "$staged" | grep -Eq '^(main\.py|scripts/decky_doctor\.py|scripts/deck/package_push\.sh|tests/)'; then
  if command -v uv >/dev/null 2>&1; then
    ./run.sh uv run --with pytest -- pytest -q
  else
    echo "check_tdd: uv is required for Python tooling tests" >&2
    exit 1
  fi
fi

echo "check_tdd: OK"
