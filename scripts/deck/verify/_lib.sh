# Shared helpers for the on-device smoke checks. Source, don't execute.
set -euo pipefail

DECK_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
JS_DIR="$DECK_DIR/js"
BPM_TARGET="Steam Big Picture Mode"

"$DECK_DIR/tunnel.sh" up >/dev/null

cdp() { python3 "$DECK_DIR/cdp.py" "$@"; }

nav() { # nav <route>
  cdp eval SharedJSContext "@$JS_DIR/nav.js" --var "ROUTE=$1" >/dev/null
}

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
