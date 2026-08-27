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
  local restore_filter="${4:-}"
  cdp eval "$target" "@$JS_DIR/check_controller_tab_persistence.js" \
    --var "PHASE=$phase" \
    --var "DISPLAY_APPID=$displayed_appid" \
    --var "SOURCE_APPID=$source_appid" \
    --var "RESTORE_TAB=$restore_tab" \
    --var "RESTORE_FILTER=$restore_filter"
}

original_tab=""
original_filter=""
restore_armed=1
filter_restore_armed=0
restore_tab() {
  if [[ -n "$original_tab" ]]; then
    probe "Steam Big Picture Mode" "dom-restore" "$original_tab" >/dev/null
  fi
}
restore_filter() {
  if ((filter_restore_armed)) && [[ -n "$original_filter" ]]; then
    probe "SharedJSContext" "restore-filter" "" "$original_filter" >/dev/null
  fi
}
restore_on_exit() {
  local original_status=$?
  trap - EXIT
  restore_filter || true
  if ((restore_armed)); then
    restore_tab || true
  fi
  exit "$original_status"
}
trap restore_on_exit EXIT

mkdir -p "$(dirname -- "$evidence")"
python3 - "$evidence" "$expected_controller_type" <<'PY'
import json
import sys
from pathlib import Path

evidence = Path(sys.argv[1])
temporary = evidence.with_name(f".{evidence.name}.tmp")
temporary.write_text(json.dumps({
    "status": "started",
    "expectedControllerType": int(sys.argv[2]),
}, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
temporary.replace(evidence)
PY
capture_filter_json="$(probe "SharedJSContext" "capture-filter")"
original_filter="$(python3 - "$capture_filter_json" <<'PY'
import json
import sys

value = json.loads(sys.argv[1]).get("originalFilter")
if not isinstance(value, bool):
    raise SystemExit("FAIL: probe payload missing original visible filter")
print(str(value).lower())
PY
)"
filter_restore_armed=1
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

python3 - "$before_json" "$query_json" "$after_json" "$expected_controller_type" "$evidence" <<'PY'
import json
import sys
from pathlib import Path

before, query, after = (json.loads(value) for value in sys.argv[1:4])
expected_type = int(sys.argv[4])
evidence = Path(sys.argv[5])

# Keep the bounded, redacted probe payload when a later invariant fails.  The
# final write below replaces this with a passed summary only after every
# validation has succeeded, so a diagnostic capture can never be mistaken for
# a passing smoke result.
evidence.write_text(json.dumps({
    "status": "pending-validation",
    "before": before,
    "query": query,
    "after": after,
}, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")


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
if field(query, "resultSettled", "query.resultSettled") is not True:
    raise SystemExit("FAIL: direct query result did not settle")
after_getter = field(query, "after", "query.after")
getter_count = nonnegative(field(after_getter, "getterCount", "query.after.getterCount"), "getterCount")
hashes = field(after_getter, "urlHashes", "query.after.urlHashes")
before_hashes = field(field(query, "before", "query.before"), "urlHashes", "query.before.urlHashes")
if not isinstance(hashes, list) or not all(isinstance(item, str) and item for item in hashes):
    raise SystemExit("FAIL: query after hashes are invalid")
if not isinstance(before_hashes, list):
    raise SystemExit("FAIL: query before hashes are invalid")
if controller_type == 102 and not set(before_hashes).issubset(set(hashes)):
    raise SystemExit("FAIL: direct query removed a before-query Community identity")
if getter_count <= 0 or rendered_after > getter_count:
    raise SystemExit("FAIL: Community getter and rendered counts disagree")
PY

restore_filter_json="$(probe "SharedJSContext" "restore-filter" "" "$original_filter")"
python3 - "$restore_filter_json" "$original_filter" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
expected = sys.argv[2] == "true"
if payload.get("restoredFilter") is not expected:
    raise SystemExit("FAIL: visible controller filter restoration did not restore the original value")
if payload.get("restorationQueryIssued") is not True:
    raise SystemExit("FAIL: visible controller filter restoration did not refresh the chooser result")
PY
filter_restore_armed=0
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
python3 - "$evidence" "$restore_filter_json" "$restore_json" "$expected_controller_type" <<'PY'
import json
import sys
from pathlib import Path

evidence = Path(sys.argv[1])
payload = json.loads(evidence.read_text(encoding="utf-8"))
before = payload["before"]
query = payload["query"]
after = payload["after"]
payload["status"] = "passed"
payload["controllerType"] = query["controllerType"]
payload["expectedControllerType"] = int(sys.argv[4])
payload["controllerIndex"] = query["controllerIndex"]
payload["renderedBefore"] = before["renderedCount"]
payload["renderedAfter"] = after["renderedCount"]
payload["getterCount"] = query["after"]["getterCount"]
payload["renderCoverage"] = (
    "complete" if payload["renderedAfter"] == payload["getterCount"] else "virtualized"
)
payload["restoredFilter"] = json.loads(sys.argv[2]).get("restoredFilter")
payload["restoredTab"] = json.loads(sys.argv[3]).get("selectedTab")
evidence.write_text(json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
PY
restore_armed=0
trap - EXIT
pass "controller tab persistence: active Community tab survived direct query; evidence=$evidence"
