#!/usr/bin/env bash
# Bounded no-selection controller chooser tab-persistence smoke.
#
#   smoke_controller_tab_persistence.sh <displayed-appid> <source-appid> <expected-controller-type> [evidence-json]
source "$(dirname -- "${BASH_SOURCE[0]}")/_lib.sh"

displayed_appid="${1:?usage: smoke_controller_tab_persistence.sh <displayed-appid> <source-appid> <expected-controller-type> [evidence-json]}"
source_appid="${2:?usage: smoke_controller_tab_persistence.sh <displayed-appid> <source-appid> <expected-controller-type> [evidence-json]}"
expected_controller_type="${3:?usage: smoke_controller_tab_persistence.sh <displayed-appid> <source-appid> <expected-controller-type> [evidence-json]}"
evidence="${4:-/tmp/Decky-Metadata/controller-layout-tab-preservation/tab-persistence-$(date -u +%Y%m%dT%H%M%SZ).json}"
[[ "$expected_controller_type" =~ ^[0-9]+$ ]] || fail "expected type must be a non-negative integer"
case "$evidence" in
  /tmp/Decky-Metadata/*) ;;
  *) fail "tab-persistence evidence must stay below /tmp/Decky-Metadata" ;;
esac

probe() {
  local target="$1"
  local phase="$2"
  local restore_tab="${3:-Community Layouts}"
  cdp eval "$target" "@$JS_DIR/check_controller_tab_persistence.js" \
    --var "PHASE=$phase" \
    --var "DISPLAY_APPID=$displayed_appid" \
    --var "SOURCE_APPID=$source_appid" \
    --var "RESTORE_TAB=$restore_tab"
}

original_tab=""
restore_armed=1
restore_tab() {
  if [[ -n "$original_tab" ]]; then
    probe "Steam Big Picture Mode" "dom-restore" "$original_tab" >/dev/null
  fi
}
restore_on_exit() {
  local original_status=$?
  trap - EXIT
  if ((restore_armed)); then
    restore_tab || true
  fi
  exit "$original_status"
}
trap restore_on_exit EXIT

before_json="$(probe "Steam Big Picture Mode" "dom-select")"
original_tab="$(python3 - "$before_json" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
tab = payload.get("originalSelectedTab", {})
label = tab.get("label") if isinstance(tab, dict) else None
if not isinstance(label, str) or not label:
    raise SystemExit("FAIL: probe payload missing original selected tab")
print(label)
PY
)"
query_json="$(probe "SharedJSContext" "query")"
after_json="$(probe "Steam Big Picture Mode" "dom-observe")"

mkdir -p "$(dirname -- "$evidence")"
python3 - "$before_json" "$query_json" "$after_json" "$expected_controller_type" "$evidence" <<'PY'
import json
import sys
from pathlib import Path

before, query, after = (json.loads(value) for value in sys.argv[1:4])
expected_type = int(sys.argv[4])
evidence = Path(sys.argv[5])


def field(payload, key, label):
    if not isinstance(payload, dict) or key not in payload:
        raise SystemExit(f"FAIL: probe payload missing {label}")
    return payload[key]


def selected(payload, label):
    tab = field(payload, "selectedTab", f"{label}.selectedTab")
    name = tab.get("label") if isinstance(tab, dict) else None
    if not isinstance(name, str) or not name:
        raise SystemExit(f"FAIL: probe payload has invalid {label} selected tab")
    return name


def nonnegative(value, label):
    if not isinstance(value, int) or value < 0:
        raise SystemExit(f"FAIL: probe payload has invalid {label}")
    return value


if selected(before, "before") != "Community Layouts":
    raise SystemExit("FAIL: chooser did not select Community Layouts before direct query")
if selected(after, "after") != "Community Layouts":
    raise SystemExit("FAIL: active tab changes unexpectedly after direct query")
for label, payload in (("before", before), ("after", after)):
    tabs = field(payload, "tabs", f"{label}.tabs")
    labels = {item.get("label") for item in tabs if isinstance(item, dict)} if isinstance(tabs, list) else set()
    if not {"Templates", "Community Layouts", "Search"}.issubset(labels):
        raise SystemExit(f"FAIL: {label} chooser signature is incomplete")

rendered_before = nonnegative(field(before, "renderedCount", "before.renderedCount"), "before renderedCount")
rendered_after = nonnegative(field(after, "renderedCount", "after.renderedCount"), "after renderedCount")
if rendered_before <= 0 or rendered_after <= 0:
    raise SystemExit("FAIL: Community rows are empty")
controller_type = nonnegative(field(query, "controllerType", "query.controllerType"), "controllerType")
controller_index = nonnegative(field(query, "controllerIndex", "query.controllerIndex"), "controllerIndex")
if controller_type != expected_type:
    raise SystemExit(
        f"FAIL: controller type {controller_type} does not match expected type {expected_type}"
    )
if field(query, "filterDuringQuery", "query.filterDuringQuery") is not False:
    raise SystemExit("FAIL: direct query did not expose the unfiltered controller setting")
if field(query, "cacheReplaced", "query.cacheReplaced") is not True:
    raise SystemExit("FAIL: direct query completion did not replace the displayed cache")
after_getter = field(query, "after", "query.after")
getter_count = nonnegative(field(after_getter, "getterCount", "query.after.getterCount"), "getterCount")
hashes = field(after_getter, "urlHashes", "query.after.urlHashes")
before_hashes = field(field(query, "before", "query.before"), "urlHashes", "query.before.urlHashes")
if not isinstance(hashes, list) or not all(isinstance(item, str) and item for item in hashes):
    raise SystemExit("FAIL: query after hashes are invalid")
if not isinstance(before_hashes, list) or not set(before_hashes).issubset(set(hashes)):
    raise SystemExit("FAIL: direct query removed a before-query Community identity")
if getter_count <= 0 or getter_count != rendered_after:
    raise SystemExit("FAIL: Community getter and rendered counts disagree")

evidence.write_text(json.dumps({
    "before": before,
    "query": query,
    "after": after,
    "controllerType": controller_type,
    "expectedControllerType": expected_type,
    "controllerIndex": controller_index,
    "renderedBefore": rendered_before,
    "renderedAfter": rendered_after,
    "getterCount": getter_count,
}, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
PY

restore_json="$(probe "Steam Big Picture Mode" "dom-restore" "$original_tab")"
python3 - "$restore_json" "$original_tab" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
selected = payload.get("selectedTab")
label = selected.get("label") if isinstance(selected, dict) else None
if label != sys.argv[2]:
    raise SystemExit("FAIL: chooser tab restoration did not restore the original tab")
PY
restore_armed=0
trap - EXIT
pass "controller tab persistence: active Community tab survived direct query; evidence=$evidence"
