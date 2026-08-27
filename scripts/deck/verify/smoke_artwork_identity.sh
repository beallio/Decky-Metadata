#!/usr/bin/env bash
# Read-only Library Home artwork identity check.
#
#   smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <evidence-dir>
source "$(dirname -- "${BASH_SOURCE[0]}")/_lib.sh"

shortcut="${1:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <evidence-dir>}"
matched="${2:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <evidence-dir>}"
expected_scope="${3:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <evidence-dir>}"
expected_identity="${4:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <evidence-dir>}"
evidence="${5:?usage: smoke_artwork_identity.sh <shortcut-appid> <matched-appid> <route-scope> <shortcut-identity> <evidence-dir>}"

[[ "$shortcut" =~ ^[1-9][0-9]*$ ]] || fail "shortcut appid must be a positive integer"
[[ "$matched" =~ ^[1-9][0-9]*$ ]] || fail "matched appid must be a positive integer"
case "$expected_scope" in library-home|current-detail|other) ;; *) fail "invalid expected route scope" ;; esac
case "$expected_identity" in true|false) ;; *) fail "shortcut identity must be true or false" ;; esac

python3 - "$evidence" <<'PY'
from pathlib import Path
import sys

root = Path("/tmp/Decky-Metadata").resolve()
evidence = Path(sys.argv[1]).resolve()
if evidence != root and root not in evidence.parents:
    raise SystemExit("FAIL: evidence directory must be below /tmp/Decky-Metadata")
evidence.mkdir(parents=True, exist_ok=True)
(evidence / "artwork-identity-status.json").write_text('{"status": "started"}\n')
PY

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
if not isinstance(data["iconAttempts"], int) or not 1 <= data["iconAttempts"] <= 4:
    raise SystemExit("FAIL: icon resolver attempt count is outside its bound")
for kind in ("vertical", "landscape", "hero", "logo"):
    candidate = data["artwork"].get(kind)
    if not isinstance(candidate, dict):
        raise SystemExit(f"FAIL: missing {kind} artwork candidates")
    count, hashes = candidate.get("count"), candidate.get("hashes")
    if not isinstance(count, int) or count <= 0 or not isinstance(hashes, list) or len(hashes) != count:
        raise SystemExit(f"FAIL: missing {kind} custom-art candidates")
    if any(not isinstance(value, str) or len(value) != 8 for value in hashes):
        raise SystemExit(f"FAIL: malformed {kind} artwork hash")
if not isinstance(data["elapsedMs"], int) or data["elapsedMs"] < 0:
    raise SystemExit("FAIL: malformed artwork identity elapsed time")
Path(status_file).write_text('{"status": "complete"}\n')
PY

pass "artwork identity: shortcut=$shortcut, matched=$matched, scope=$expected_scope; icon resolver and custom art verified"
