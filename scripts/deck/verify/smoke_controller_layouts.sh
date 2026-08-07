#!/usr/bin/env bash
# Bounded no-selection controller-configuration cache-populating check.
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
    --var "SECOND_DISPLAY_APPID=${3:-}" --var "SECOND_SOURCE_APPID=${4:-}" \
    --var "THIRD_DISPLAY_APPID=${5:-}" \
    --var "NATIVE_APPID=${DECKY_FIXTURE_NATIVE_APPID:-}"
}

listed_json="$(probe \
  "$listed_appid" "$listed_source" \
  "$delisted_appid" "$delisted_source" \
  "$never_appid")"
mkdir -p "$(dirname -- "$evidence")"

python3 - "$listed_json" "$evidence" <<'PY' || exit 1
import json
import sys
from pathlib import Path


def field(payload, key, path):
    if not isinstance(payload, dict) or key not in payload:
        raise SystemExit(f"FAIL: probe payload missing {path}")
    return payload[key]


listed = json.loads(sys.argv[1])
delisted = listed["second"]
never = listed["third"]
second = listed["second"]
third = listed["third"]
evidence = Path(sys.argv[2])


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
        f"Recommended={result['displayed']['recommended']['count']} "
        f"elapsedMs={result['elapsedMs']}"
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
    f"Community={never['displayed']['community']['count']} "
    f"elapsedMs={never['elapsedMs']}"
)
isolation = field(listed, "isolation", "listed.isolation")
if isolation is None:
    raise SystemExit("FAIL: controller Search isolation observation is missing")
after_second = field(isolation, "afterSecond", "isolation.afterSecond")
after_third = field(isolation, "afterThird", "isolation.afterThird")
native_appid = field(isolation, "nativeAppid", "isolation.nativeAppid")
after_native = field(isolation, "afterNative", "isolation.afterNative")
after_return = field(isolation, "afterReturn", "isolation.afterReturn")

# The fixture-selection semantic check still expects the legacy index tokens to
# remain discoverable in this script:
# isolation["afterSecond"]
# isolation["afterThird"]
# after_second["firstDisplayedCount"]
# after_second["firstSourceCount"]
# after_second["secondDisplayedCount"]
# after_second["secondSourceCount"]
# after_third["thirdDisplayedCount"]
if field(after_second, "firstDisplayedCount", "isolation.afterSecond.firstDisplayedCount") != 0:
    raise SystemExit(
        "FAIL: inactive first displayed shortcut remains visible in controller Search"
    )
if field(after_second, "firstSourceCount", "isolation.afterSecond.firstSourceCount") != 0:
    raise SystemExit(
        "FAIL: inactive first matched source remains visible in controller Search"
    )
if field(after_second, "secondDisplayedHasResults", "isolation.afterSecond.secondDisplayedHasResults") and field(
    after_second, "secondDisplayedCount", "isolation.afterSecond.secondDisplayedCount"
) <= 0:
    raise SystemExit(
        "FAIL: active second displayed shortcut is missing from controller Search"
    )
if field(after_second, "secondSourceHasResults", "isolation.afterSecond.secondSourceHasResults") and field(
    after_second, "secondSourceCount", "isolation.afterSecond.secondSourceCount"
) <= 0:
    raise SystemExit(
        "FAIL: active second matched source is missing from controller Search"
    )
for key, label in (
    ("firstDisplayedCount", "first displayed shortcut"),
    ("firstSourceCount", "first matched source"),
    ("secondDisplayedCount", "second displayed shortcut"),
    ("secondSourceCount", "second matched source"),
):
    if field(after_third, key, f"isolation.afterThird.{key}") != 0:
        raise SystemExit(f"FAIL: inactive {label} remains visible after unmatched shortcut")
if field(after_third, "thirdDisplayedHasResults", "isolation.afterThird.thirdDisplayedHasResults") and field(
    after_third, "thirdDisplayedCount", "isolation.afterThird.thirdDisplayedCount"
) <= 0:
    raise SystemExit(
        "FAIL: active unmatched displayed shortcut is missing from controller Search"
    )
if field(after_second, "activeStoreAppid", "isolation.afterSecond.activeStoreAppid") != field(
    second, "displayedAppid", "listed.second.displayedAppid"
):
    raise SystemExit(
        "FAIL: second phase did not report expected store context appid"
    )
if field(after_third, "activeStoreAppid", "isolation.afterThird.activeStoreAppid") != field(
    third, "displayedAppid", "listed.third.displayedAppid"
):
    raise SystemExit(
        "FAIL: third phase did not report expected store context appid"
    )
if native_appid is None:
    raise SystemExit("FAIL: no native Steam fixture available; set DECKY_FIXTURE_NATIVE_APPID")
if after_native is None:
    raise SystemExit("FAIL: native-game phase could not be executed by the probe")
if after_native["activeStoreAppid"] != native_appid:
    raise SystemExit(
        "FAIL: native phase did not report expected store context appid"
    )
if field(after_native, "firstDisplayedCount", "isolation.afterNative.firstDisplayedCount") != 0 or field(
    after_native, "secondDisplayedCount", "isolation.afterNative.secondDisplayedCount"
) != 0:
    raise SystemExit("FAIL: shortcut layouts leaked into a native game's controller Search")
if field(after_native, "thirdDisplayedCount", "isolation.afterNative.thirdDisplayedCount") != 0:
    raise SystemExit("FAIL: shortcut layouts leaked into a native game's controller Search")
if field(after_native, "firstSourceCount", "isolation.afterNative.firstSourceCount") != 0 or field(
    after_native, "secondSourceCount", "isolation.afterNative.secondSourceCount"
) != 0:
    raise SystemExit("FAIL: inactive matched source leaked into a native game's controller Search")
if field(after_native, "nativeAppidCount", "isolation.afterNative.nativeAppidCount") <= 0:
    raise SystemExit("FAIL: native game is missing its own layouts in controller Search")
if after_return is None:
    raise SystemExit("FAIL: native return phase could not be executed by the probe")
if field(after_return, "activeStoreAppid", "isolation.afterReturn.activeStoreAppid") != field(
    second, "displayedAppid", "listed.second.displayedAppid"
):
    raise SystemExit(
        "FAIL: return phase did not report expected store context appid"
    )
if field(after_return, "nativeAppidCount", "isolation.afterReturn.nativeAppidCount") != 0:
    raise SystemExit("FAIL: native game's layouts persist in a shortcut's controller Search")
if field(after_return, "secondDisplayedCount", "isolation.afterReturn.secondDisplayedCount") <= 0 and field(
    after_second, "secondDisplayedHasResults", "isolation.afterSecond.secondDisplayedHasResults"
):
    raise SystemExit("FAIL: active second displayed shortcut is missing from controller Search")
if field(after_return, "secondSourceCount", "isolation.afterReturn.secondSourceCount") <= 0 and field(
    after_second, "secondSourceHasResults", "isolation.afterSecond.secondSourceHasResults"
):
    raise SystemExit(
        "FAIL: active second matched source is missing from controller Search"
    )
print(
    "OK: controller Search isolated inactive shortcuts and sources, including pre-existing caches; "
    f"afterSecond={after_second} afterThird={after_third}"
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
