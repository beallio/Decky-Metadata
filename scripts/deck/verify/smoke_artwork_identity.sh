#!/usr/bin/env bash
# Read-only Library Home artwork identity check and redacted artwork-file audit.
#
#   smoke_artwork_identity.sh --capture-artwork-files <shortcut-appid> <manifest>
#   smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <before-manifest> <evidence-dir> <sidebar-label-hash>

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

shortcut="${1:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <before-manifest> <evidence-dir> <sidebar-label-hash>}"
matched="${2:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <before-manifest> <evidence-dir> <sidebar-label-hash>}"
expected_scope="${3:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <before-manifest> <evidence-dir> <sidebar-label-hash>}"
expected_identity="${4:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <before-manifest> <evidence-dir> <sidebar-label-hash>}"
before_manifest="${5:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <before-manifest> <evidence-dir> <sidebar-label-hash>}"
evidence="${6:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <before-manifest> <evidence-dir> <sidebar-label-hash>}"
sidebar_label_hash="${7:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <before-manifest> <evidence-dir> <sidebar-label-hash>}"

[[ "$#" -eq 7 ]] || fail_early "artwork identity smoke takes exactly seven arguments"
require_positive_appid "$shortcut" "shortcut appid"
require_positive_appid "$matched" "matched appid"
[[ "$shortcut" != "$matched" ]] || fail_early "shortcut and matched appids must differ"
case "$expected_scope" in library-home|current-detail|other) ;; *) fail_early "invalid expected route scope" ;; esac
case "$expected_identity" in true|false) ;; *) fail_early "shortcut identity must be true or false" ;; esac
[[ "$sidebar_label_hash" =~ ^[0-9a-f]{8}$ ]] || fail_early "sidebar label hash must be an eight-character lowercase hex value"

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
payload="$(cdp eval SharedJSContext "@$JS_DIR/check_artwork_identity.js" --var "SHORTCUT_APPID=$shortcut" --var "MATCHED_APPID=$matched" --var "PROBE_MODE=identity" --var "SIDEBAR_LABEL_HASH=$sidebar_label_hash")"
desktop_payload=""
if [[ "$expected_scope" == "library-home" ]]; then
  desktop_payload="$(cdp eval Steam "@$JS_DIR/check_artwork_identity.js" --var "SHORTCUT_APPID=$shortcut" --var "MATCHED_APPID=$matched" --var "PROBE_MODE=desktop-home" --var "SIDEBAR_LABEL_HASH=$sidebar_label_hash")"
fi

python3 - "$payload" "$desktop_payload" "$shortcut" "$matched" "$expected_scope" "$expected_identity" "$evidence/artwork-identity-status.json" "$evidence/artwork-identity.json" "$evidence/desktop-library-home.json" <<'PY'
import json
from pathlib import Path
import sys

(
    payload,
    desktop_payload,
    shortcut,
    matched,
    expected_scope,
    expected_identity,
    status_file,
    identity_file,
    desktop_file,
) = sys.argv[1:]
Path(status_file).write_text('{"status": "pending-validation"}\n')
try:
    data = json.loads(payload)
except json.JSONDecodeError as exc:
    raise SystemExit(f"FAIL: malformed artwork identity payload: {exc}")

required = {
    "routeScope", "shortcutAppId", "matchedAppId", "requestedObjectAppId",
    "matchedObjectAppId", "aliasSameObject", "isShortcut", "isModOrShortcut",
    "appType", "iconHashPresent", "iconDataPresent", "iconResolved", "iconValueHash",
    "iconRequestError", "iconAttempts", "iconDeadlineMs", "artwork", "elapsedMs",
}
if not isinstance(data, dict) or set(data) != required:
    raise SystemExit("FAIL: malformed artwork identity payload")
if data["routeScope"] not in {"library-home", "current-detail", "other"}:
    raise SystemExit("FAIL: malformed artwork route scope")
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
if not isinstance(data["iconResolved"], bool):
    raise SystemExit("FAIL: malformed icon resolver diagnostic")
if data["iconValueHash"] is not None and (
    not isinstance(data["iconValueHash"], str) or len(data["iconValueHash"]) != 8
):
    raise SystemExit("FAIL: malformed icon resolver value hash")
if data["iconResolved"] and data["iconValueHash"] is None:
    raise SystemExit("FAIL: resolved icon is missing its diagnostic hash")
if not isinstance(data["iconRequestError"], bool):
    raise SystemExit("FAIL: malformed icon resolver request state")
if data["iconRequestError"]:
    raise SystemExit("FAIL: icon resolver request failed")
if data["iconDeadlineMs"] != 15000:
    raise SystemExit("FAIL: icon resolver deadline does not match the permanent bound")
if not isinstance(data["iconAttempts"], int) or not 1 <= data["iconAttempts"] <= 61:
    raise SystemExit("FAIL: icon resolver attempt count is outside its bound")
if not isinstance(data["appType"], int):
    raise SystemExit("FAIL: malformed shortcut app type")
if not isinstance(data["artwork"], dict) or set(data["artwork"]) != {"vertical", "landscape", "hero", "logo"}:
    raise SystemExit("FAIL: malformed custom-art candidates")
for kind in ("vertical", "landscape", "hero", "logo"):
    candidate = data["artwork"].get(kind)
    if not isinstance(candidate, dict) or set(candidate) != {"count", "hashes"}:
        raise SystemExit(f"FAIL: missing {kind} artwork candidates")
    count, hashes = candidate.get("count"), candidate.get("hashes")
    if not isinstance(count, int) or count < 0 or not isinstance(hashes, list) or len(hashes) != count:
        raise SystemExit(f"FAIL: malformed {kind} custom-art candidates")
    if any(not isinstance(value, str) or len(value) != 8 for value in hashes):
        raise SystemExit(f"FAIL: malformed {kind} artwork hash")
if not isinstance(data["elapsedMs"], int) or data["elapsedMs"] < 0:
    raise SystemExit("FAIL: malformed artwork identity elapsed time")

if expected_scope == "library-home":
    try:
        desktop = json.loads(desktop_payload)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"FAIL: malformed Desktop Library payload: {exc}")
    desktop_required = {
        "homeSelected", "labelHashValid", "matchingCellCount", "completeImageCount",
        "customImageCount", "portraitCandidateCount", "customSidebarIconCount",
        "customSidebarIconFound", "completeImageDimensions",
    }
    if not isinstance(desktop, dict) or set(desktop) != desktop_required:
        raise SystemExit("FAIL: malformed Desktop Library payload")
    if desktop["homeSelected"] is not True:
        raise SystemExit("FAIL: Desktop Library Home is not selected")
    if desktop["labelHashValid"] is not True:
        raise SystemExit("FAIL: Desktop Library label hash is malformed")
    for name in (
        "matchingCellCount", "completeImageCount", "customImageCount",
        "portraitCandidateCount", "customSidebarIconCount",
    ):
        if not isinstance(desktop[name], int) or desktop[name] < 0:
            raise SystemExit(f"FAIL: malformed Desktop Library {name}")
    if desktop["matchingCellCount"] < 1:
        raise SystemExit("FAIL: Desktop Library Home row is missing")
    if not isinstance(desktop["customSidebarIconFound"], bool):
        raise SystemExit("FAIL: malformed Desktop Library custom sidebar icon state")
    if desktop["customSidebarIconFound"] is not (desktop["customSidebarIconCount"] > 0):
        raise SystemExit("FAIL: malformed Desktop Library custom sidebar icon state")
    if desktop["customSidebarIconCount"] > desktop["customImageCount"] or desktop["customSidebarIconCount"] > desktop["completeImageCount"]:
        raise SystemExit("FAIL: malformed Desktop Library custom sidebar icon count")
    if desktop["portraitCandidateCount"] > desktop["customImageCount"]:
        raise SystemExit("FAIL: malformed Desktop Library portrait candidate count")
    dimensions = desktop["completeImageDimensions"]
    if not isinstance(dimensions, list) or len(dimensions) != desktop["completeImageCount"]:
        raise SystemExit("FAIL: malformed Desktop Library complete image dimensions")
    if any(
        not isinstance(dimension, list) or len(dimension) != 4
        or any(not isinstance(value, int) or value <= 0 for value in dimension)
        for dimension in dimensions
    ):
        raise SystemExit("FAIL: malformed Desktop Library complete image dimensions")
    if not desktop["customSidebarIconFound"]:
        raise SystemExit("FAIL: Desktop Library Home custom sidebar icon is missing")
    if data["routeScope"] not in {"library-home", "other"}:
        raise SystemExit(f"FAIL: route scope {data['routeScope']!r}, expected 'library-home'")
    effective_scope = "library-home"
    Path(desktop_file).write_text(json.dumps(desktop, sort_keys=True) + "\n")
else:
    effective_scope = data["routeScope"]

if effective_scope != expected_scope:
    raise SystemExit(f"FAIL: route scope {effective_scope!r}, expected {expected_scope!r}")
Path(identity_file).write_text(json.dumps(data, sort_keys=True) + "\n")
Path(status_file).write_text('{"status": "complete"}\n')
PY

after_manifest="$evidence/artwork-files-after.json"
capture_artwork_files "$shortcut" "$after_manifest"
validate_and_compare_artwork_manifests "$before_manifest" "$after_manifest" "$shortcut" "$evidence/artwork-file-comparison.json"

pass "artwork identity: shortcut=$shortcut, matched=$matched, scope=$expected_scope; shortcut identity, artwork files, and bounded icon diagnostics verified"
