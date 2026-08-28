#!/usr/bin/env bash
# Read-only Library Home artwork identity check and redacted artwork-file audit.
#
#   smoke_artwork_identity.sh --capture-artwork-files <shortcut-appid> <manifest>
#   smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <before-manifest> <evidence-dir>

fail_early() { printf 'FAIL: %s\n' "$*" >&2; exit 2; }

require_positive_appid() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]] || fail_early "$2 must be a positive integer"
}

prepare_output_path() {
  python3 - "$1" <<'PY'
from pathlib import Path
import sys

root = Path("/tmp/Decky-Metadata").resolve()
output = Path(sys.argv[1]).resolve()
if output.parent != root and root not in output.parents:
    raise SystemExit("FAIL: artifact path must be below /tmp/Decky-Metadata")
output.parent.mkdir(parents=True, exist_ok=True)
PY
}

capture_artwork_files() {
  local shortcut="$1"
  local manifest="$2"
  local temporary="${manifest}.partial"
  local deck_host="${DECKY_DECK_HOST:-steamdeck}"
  prepare_output_path "$manifest"
  if ! ssh "$deck_host" sh -s -- "$shortcut" > "$temporary" <<'REMOTE'
set -eu
shortcut="$1"
root="$HOME/.local/share/Steam/userdata"
if [ ! -d "$root" ]; then
  root="$HOME/.steam/steam/userdata"
fi
[ -d "$root" ] || exit 1
hashes="$({ find "$root" -type f -path '*/config/grid/*' -name "${shortcut}*" -print0 | xargs -0r sha256sum | awk '{ print $1 }' | LC_ALL=C sort; } || exit 1)"
printf '%s\n' "$hashes" | python3 -c '
import json
import re
import sys
shortcut = int(sys.argv[1])
hashes = [line.strip() for line in sys.stdin if line.strip()]
if any(re.fullmatch(r"[0-9a-f]{64}", value) is None for value in hashes):
    raise SystemExit(1)
print(json.dumps({"shortcutAppId": shortcut, "fileCount": len(hashes), "fileHashes": hashes}, sort_keys=True))
' "$shortcut"
REMOTE
  then
    fail_early "could not capture redacted artwork-file hashes"
  fi
  mv -- "$temporary" "$manifest"
}

validate_and_compare_artwork_manifests() {
  python3 - "$1" "$2" "$3" "$4" <<'PY'
from collections import Counter
import json
from pathlib import Path
import re
import sys

before_path, after_path, shortcut, comparison_path = sys.argv[1:]
expected_shortcut = int(shortcut)

def load_manifest(path_text, label):
    try:
        data = json.loads(Path(path_text).read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"FAIL: malformed {label} artwork-file manifest: {exc}")
    if set(data) != {"shortcutAppId", "fileCount", "fileHashes"}:
        raise SystemExit(f"FAIL: malformed {label} artwork-file manifest fields")
    if data["shortcutAppId"] != expected_shortcut:
        raise SystemExit(f"FAIL: {label} artwork-file manifest has the wrong shortcut")
    count, hashes = data["fileCount"], data["fileHashes"]
    if not isinstance(count, int) or count <= 0 or not isinstance(hashes, list) or len(hashes) != count:
        raise SystemExit(f"FAIL: malformed {label} artwork-file count")
    if any(not isinstance(value, str) or re.fullmatch(r"[0-9a-f]{64}", value) is None for value in hashes):
        raise SystemExit(f"FAIL: malformed {label} artwork-file hash")
    if hashes != sorted(hashes):
        raise SystemExit(f"FAIL: unsorted {label} artwork-file hashes")
    return count, hashes

before_count, before_hashes = load_manifest(before_path, "before")
after_count, after_hashes = load_manifest(after_path, "after")
if before_count != after_count:
    raise SystemExit("FAIL: artwork file count changed")
if Counter(before_hashes) != Counter(after_hashes):
    raise SystemExit("FAIL: artwork file hash set changed")
Path(comparison_path).write_text(json.dumps({
    "shortcutAppId": expected_shortcut,
    "beforeFileCount": before_count,
    "afterFileCount": after_count,
    "fileHashSetUnchanged": True,
}, sort_keys=True) + "\n")
PY
}

if [[ "${1:-}" == "--capture-artwork-files" ]]; then
  shortcut="${2:?usage: smoke_artwork_identity.sh --capture-artwork-files <shortcut-appid> <manifest>}"
  manifest="${3:?usage: smoke_artwork_identity.sh --capture-artwork-files <shortcut-appid> <manifest>}"
  [[ "$#" -eq 3 ]] || fail_early "capture-artwork-files takes exactly two arguments"
  require_positive_appid "$shortcut" "shortcut appid"
  capture_artwork_files "$shortcut" "$manifest"
  exit 0
fi

shortcut="${1:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <before-manifest> <evidence-dir>}"
matched="${2:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <before-manifest> <evidence-dir>}"
expected_scope="${3:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <before-manifest> <evidence-dir>}"
expected_identity="${4:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <before-manifest> <evidence-dir>}"
before_manifest="${5:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <before-manifest> <evidence-dir>}"
evidence="${6:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <before-manifest> <evidence-dir>}"

[[ "$#" -eq 6 ]] || fail_early "artwork identity smoke takes exactly six arguments"
require_positive_appid "$shortcut" "shortcut appid"
require_positive_appid "$matched" "matched appid"
[[ "$shortcut" != "$matched" ]] || fail_early "shortcut and matched appids must differ"
case "$expected_scope" in library-home|current-detail|other) ;; *) fail_early "invalid expected route scope" ;; esac
case "$expected_identity" in true|false) ;; *) fail_early "shortcut identity must be true or false" ;; esac

python3 - "$evidence" "$before_manifest" "$shortcut" <<'PY'
import json
from pathlib import Path
import sys

root = Path("/tmp/Decky-Metadata").resolve()
evidence = Path(sys.argv[1]).resolve()
before = Path(sys.argv[2]).resolve()
shortcut = int(sys.argv[3])
if evidence != root and root not in evidence.parents:
    raise SystemExit("FAIL: evidence directory must be below /tmp/Decky-Metadata")
if before.parent != root and root not in before.parents:
    raise SystemExit("FAIL: before artwork-file manifest must be below /tmp/Decky-Metadata")
try:
    baseline = json.loads(before.read_text())
except (OSError, json.JSONDecodeError) as exc:
    raise SystemExit(f"FAIL: malformed before artwork-file manifest: {exc}")
if baseline.get("shortcutAppId") != shortcut:
    raise SystemExit("FAIL: before artwork-file manifest has the wrong shortcut")
evidence.mkdir(parents=True, exist_ok=True)
(evidence / "artwork-identity-status.json").write_text('{"status": "started"}\n')
PY

source "$(dirname -- "${BASH_SOURCE[0]}")/_lib.sh"
payload="$(cdp eval SharedJSContext "@$JS_DIR/check_artwork_identity.js" --var "SHORTCUT_APPID=$shortcut" --var "MATCHED_APPID=$matched")"
printf '%s\n' "$payload" > "$evidence/artwork-identity.json"

python3 - "$payload" "$shortcut" "$matched" "$expected_scope" "$expected_identity" "$evidence/artwork-identity-status.json" <<'PY'
import json
from pathlib import Path
import sys

payload, shortcut, matched, expected_scope, expected_identity, status_file = sys.argv[1:]
Path(status_file).write_text('{"status": "pending-validation"}\n')
try:
    data = json.loads(payload)
except json.JSONDecodeError as exc:
    raise SystemExit(f"FAIL: malformed artwork identity payload: {exc}")

required = (
    "routeScope", "shortcutAppId", "matchedAppId", "requestedObjectAppId",
    "matchedObjectAppId", "aliasSameObject", "isShortcut", "isModOrShortcut",
    "iconHashPresent", "iconDataPresent", "iconResolved", "iconRequestError",
    "iconAttempts", "artwork", "elapsedMs",
)
missing = [name for name in required if name not in data]
if missing:
    raise SystemExit(f"FAIL: malformed artwork identity payload missing {missing}")
if data["routeScope"] != expected_scope:
    raise SystemExit(f"FAIL: route scope {data['routeScope']!r}, expected {expected_scope!r}")
if data["shortcutAppId"] != int(shortcut) or data["matchedAppId"] != int(matched):
    raise SystemExit("FAIL: probe app identifiers do not match the requested shortcut")
if data["requestedObjectAppId"] != int(shortcut):
    raise SystemExit("FAIL: requested shortcut returned the wrong overview object")
if data["matchedObjectAppId"] != int(shortcut) or not data["aliasSameObject"]:
    raise SystemExit("FAIL: matched overview alias changed")
if data["isShortcut"] is not True:
    raise SystemExit("FAIL: shortcut no longer reports native shortcut identity")
if data["isModOrShortcut"] is not (expected_identity == "true"):
    raise SystemExit("FAIL: shortcut identity does not match the requested route scope")
if data["iconRequestError"] or not data["iconResolved"]:
    raise SystemExit("FAIL: icon resolver stayed null after its bounded request")
if not isinstance(data["iconAttempts"], int) or not 1 <= data["iconAttempts"] <= 20:
    raise SystemExit("FAIL: icon resolver attempt count is outside its bound")
for kind in ("vertical", "landscape", "hero", "logo"):
    candidate = data["artwork"].get(kind)
    if not isinstance(candidate, dict):
        raise SystemExit(f"FAIL: missing {kind} artwork candidates")
    count, hashes = candidate.get("count"), candidate.get("hashes")
    if not isinstance(count, int) or count < 0 or not isinstance(hashes, list) or len(hashes) != count:
        raise SystemExit(f"FAIL: malformed {kind} custom-art candidates")
    if any(not isinstance(value, str) or len(value) != 8 for value in hashes):
        raise SystemExit(f"FAIL: malformed {kind} artwork hash")
if not isinstance(data["elapsedMs"], int) or data["elapsedMs"] < 0:
    raise SystemExit("FAIL: malformed artwork identity elapsed time")
Path(status_file).write_text('{"status": "complete"}\n')
PY

after_manifest="$evidence/artwork-files-after.json"
capture_artwork_files "$shortcut" "$after_manifest"
validate_and_compare_artwork_manifests "$before_manifest" "$after_manifest" "$shortcut" "$evidence/artwork-file-comparison.json"

pass "artwork identity: shortcut=$shortcut, matched=$matched, scope=$expected_scope; icon resolver and artwork files verified"
