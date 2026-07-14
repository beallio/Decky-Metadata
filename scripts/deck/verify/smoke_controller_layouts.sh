#!/usr/bin/env bash
# Read-only matched controller-configuration discovery check.
#
#   smoke_controller_layouts.sh <fixtures-json> [evidence-json]
source "$(dirname -- "${BASH_SOURCE[0]}")/_lib.sh"

fixtures="${1:?usage: smoke_controller_layouts.sh <fixtures-json> [evidence-json]}"
evidence="${2:-/tmp/Decky-Metadata/verification/controller-layouts-$(date -u +%Y%m%dT%H%M%SZ).json}"
case "$evidence" in
  /tmp/Decky-Metadata/*) ;;
  *) fail "controller-layout evidence must stay below /tmp/Decky-Metadata" ;;
esac

read -r listed_appid listed_source delisted_appid delisted_source never_appid < <(
  python3 - "$fixtures" <<'PY'
import json
import sys

f = json.load(open(sys.argv[1], encoding="utf-8"))["fixtures"]
listed = f["listed_match"] or {}
delisted = f["delisted_match"] or {}
never = f["never_on_steam"] or {}
print(
    listed.get("appid", ""), listed.get("steam_appid", ""),
    delisted.get("appid", ""), delisted.get("steam_appid", ""),
    never.get("appid", ""),
)
PY
)
[[ -n "$listed_appid" && -n "$listed_source" ]] || fail "listed matched fixture is incomplete"
[[ -n "$delisted_appid" && -n "$delisted_source" ]] || fail "delisted matched fixture is incomplete"
[[ -n "$never_appid" ]] || fail "never-on-Steam fixture is incomplete"

probe() {
  cdp eval SharedJSContext "@$JS_DIR/check_controller_layouts.js" \
    --var "DISPLAY_APPID=$1" --var "SOURCE_APPID=$2" \
    --var "SECOND_DISPLAY_APPID=${3:-}" --var "SECOND_SOURCE_APPID=${4:-}"
}

listed_json="$(probe \
  "$listed_appid" "$listed_source" \
  "$delisted_appid" "$delisted_source")"
never_json="$(probe "$never_appid" 0)"
mkdir -p "$(dirname -- "$evidence")"

python3 - "$listed_json" "$never_json" "$evidence" <<'PY' || exit 1
import json
import sys
from pathlib import Path

listed = json.loads(sys.argv[1])
delisted = listed["second"]
never = json.loads(sys.argv[2])
evidence = Path(sys.argv[3])


def check_matched(label, result):
    if not result["sourceCompared"] or result["source"] is None:
        raise SystemExit(f"FAIL: {label} fixture did not compare its matched source")
    source = result["source"]["community"]
    displayed = result["displayed"]["community"]
    if source["count"] <= 0:
        raise SystemExit(f"FAIL: {label} matched source Community results are empty")
    if len(source["urlHashes"]) != len(set(source["urlHashes"])):
        raise SystemExit(f"FAIL: {label} source has duplicate Community layout identities")
    if len(displayed["urlHashes"]) != len(set(displayed["urlHashes"])):
        raise SystemExit(f"FAIL: {label} shortcut has duplicate Community layout identities")
    missing = set(source["urlHashes"]) - set(displayed["urlHashes"])
    if missing:
        raise SystemExit(
            f"FAIL: {label} shortcut is missing {len(missing)} matched Community identities"
        )
    print(
        f"OK: {label} Community shortcut={displayed['count']} source={source['count']}; "
        f"Official={result['displayed']['official']['count']} "
        f"Recommended={result['displayed']['recommended']['count']}"
    )


check_matched("listed", listed)
if delisted is None:
    raise SystemExit("FAIL: delisted fixture was not included in the bounded sequence")
check_matched("delisted", delisted)
if never["sourceCompared"] or never["source"] is not None or never["sourceAppid"] is not None:
    raise SystemExit("FAIL: never-on-Steam fixture unexpectedly requested a source comparison")
print(
    f"OK: never-on-Steam native query only; "
    f"Official={never['displayed']['official']['count']} "
    f"Recommended={never['displayed']['recommended']['count']} "
    f"Community={never['displayed']['community']['count']}"
)
isolation = listed["isolation"]
if isolation is None:
    raise SystemExit("FAIL: controller Search isolation observation is missing")
if isolation["firstSourceCount"] != 0:
    raise SystemExit(
        "FAIL: inactive first matched source remains visible in controller Search"
    )
if isolation["secondSourceHasResults"] and isolation["secondSourceCount"] <= 0:
    raise SystemExit(
        "FAIL: active second matched source is missing from controller Search"
    )
print(
    "OK: controller Search isolated inactive source, including pre-existing caches; "
    f"first={isolation['firstSourceCount']} "
    f"second={isolation['secondSourceCount']}"
)
evidence.write_text(
    json.dumps(
        {
            "listed_match": listed,
            "delisted_match": delisted,
            "never_on_steam": never,
            "search_isolation": isolation,
        },
        sort_keys=True,
        separators=(",", ":"),
    ) + "\n",
    encoding="utf-8",
)
PY
pass "controller layouts: matched Community identities supplemented; evidence=$evidence"
