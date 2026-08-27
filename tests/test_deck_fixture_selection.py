import json
import os
import re
import subprocess
from pathlib import Path

import pytest

from scripts.deck.verify.select_fixtures import select

FIXTURE = Path(__file__).parent / "fixtures/agent_workflow/metadata.json"


def _serialized_objects(source: str):
    """Return the actual object literals passed to JSON.stringify by a probe."""
    marker = "return JSON.stringify({"
    cursor = 0
    objects = []
    while (start := source.find(marker, cursor)) >= 0:
        object_start = source.find("{", start)
        depth = 0
        for index in range(object_start, len(source)):
            if source[index] == "{":
                depth += 1
            elif source[index] == "}":
                depth -= 1
                if depth == 0:
                    objects.append(source[object_start + 1:index])
                    cursor = index + 1
                    break
        else:
            raise AssertionError("unterminated JSON.stringify object")
    return objects


def _assert_controller_tab_probe_payload_contract(probe: str) -> None:
    payloads = _serialized_objects(probe)
    assert len(payloads) == 5
    selected = [payload for payload in payloads if "originalSelectedTab:" in payload]
    observed = [
        payload for payload in payloads
        if "selectedTab:" in payload and "originalSelectedTab:" not in payload
    ]
    queried = [payload for payload in payloads if re.search(r"(?m)^\s*controllerType(?:,|:)", payload)]
    restored = [payload for payload in payloads if "restoredFilter:" in payload]
    captured = [
        payload for payload in payloads
        if "originalFilter:" in payload and "controllerType" not in payload
    ]
    assert len(selected) == 1
    assert len(observed) == 1
    assert len(queried) == 1
    assert len(restored) == 1
    assert len(captured) == 1
    selected = selected[0]
    observed = observed[0]
    queried = queried[0]

    for payload in (selected, observed):
        assert "selectedTab:" in payload
        assert "tabs:" in payload
        assert "renderedCount:" in payload
    assert "originalSelectedTab:" in selected
    assert "displayedAppid" in restored[0]
    for required in (
        "controllerIndex",
        "controllerType",
        "activeStoreAppid",
        "before",
        "after",
        "originalFilter",
        "filterDuringQuery",
        "elapsedMs:",
    ):
        assert required in queried
    assert "return { getterCount: identities.length, urlHashes: identities.map(hash) };" in probe
    assert "cacheEntryFingerprint(cacheAfterQuery)" in probe
    assert "controller query result did not settle" in probe
    assert "expectedExpandedResult" in probe
    assert "candidate.getterCount > before.getterCount" in probe
    assert "resultSettled: true" in probe
    assert "if (stableSamples >= 3) {\n          after = candidate;" in probe
    assert "chooser remount did not settle" in probe
    for forbidden in ("identities:", "URL:", "title:", "account"):
        assert forbidden not in "\n".join(payloads)


def _assert_controller_tab_smoke_contract(smoke: str) -> None:
    assert 'expected_controller_type="${3:?usage:' in smoke
    assert "expected type must be a non-negative integer" in smoke
    assert "if controller_type != expected_type:" in smoke
    assert "expectedControllerType" in smoke
    assert "query.resultSettled" in smoke
    assert "restorationQueryIssued" in smoke
    assert "if controller_type == 102 and not set(before_hashes).issubset(set(hashes)):" in smoke
    capture_filter = 'capture_filter_json="$(probe "SharedJSContext" "capture-filter")"'
    assert capture_filter in smoke
    assert smoke.index(capture_filter) < smoke.index('query_json="$(probe "SharedJSContext" "query")"')
    assert smoke.index("filter_restore_armed=1") < smoke.index(
        'query_json="$(probe "SharedJSContext" "query")"'
    )
    assert '"status": "started"' in smoke
    assert smoke.index('"status": "started"') < smoke.index(
        'before_json="$(probe "Steam Big Picture Mode" "dom-select")"'
    )
    assert '"status": "pending-validation"' in smoke
    assert smoke.index('"status": "pending-validation"') < smoke.index(
        'if selected(before, "before") != "Community Layouts":'
    )
    restore_filter = 'restore_filter_json="$(probe "SharedJSContext" "restore-filter" "" "$original_filter")"'
    assert restore_filter in smoke
    assert smoke.index('after_json="$(probe "Steam Big Picture Mode" "dom-observe")"') < smoke.index(
        restore_filter
    )
    restore = 'restore_json="$(probe "Steam Big Picture Mode" "dom-restore" "$original_tab")"'
    assert restore in smoke
    assert smoke.index(restore) < smoke.index('pass "controller tab persistence')
    assert "trap - EXIT" in smoke


def test_selection_is_semantic_and_deterministic():
    data = json.loads(FIXTURE.read_text())
    first = select(data)
    reversed_data = {"metadata": dict(reversed(list(data["metadata"].items())))}
    assert select(reversed_data) == first
    assert first["fixtures"]["listed_match"]["appid"] == "10"
    assert first["fixtures"]["delisted_match"]["appid"] == "20"
    assert first["fixtures"]["never_on_steam"]["appid"] == "30"


def test_invalid_override_is_rejected():
    with pytest.raises(ValueError):
        select(json.loads(FIXTURE.read_text()), {"listed_match": "30"})


def test_launcher_without_stored_game_metadata_is_not_a_never_on_steam_fixture():
    result = select(
        {
            "metadata": {
                "10": {"title": "Lutris"},
                "20": {
                    "title": "Mario Kart",
                    "source": "IGN",
                    "developers": [{"name": "Nintendo"}],
                },
            }
        }
    )
    assert result["fixtures"]["never_on_steam"]["appid"] == "20"


def test_auto_selected_fixture_is_never_a_launch_target():
    run_all = (Path(__file__).parents[1] / "scripts/deck/verify/run_all.sh").read_text()
    assert "launch_appid_explicit" in run_all
    assert "auto-selected fixtures are render-only" in run_all
    assert 'fixture_args+=(--listed-match "$MATCHED_APPID")' in run_all
    assert '>"$run_dir/fixtures.json"' in run_all
    assert 'QUICKLINK_FEATURE_APPID="${QUICKLINK_FEATURE_APPID:-}"' in run_all
    assert (
        'smoke_quicklinks.sh" "$MATCHED_APPID" "$NEVER_APPID" '
        '"$DELISTED_APPID" "$QUICKLINK_FEATURE_APPID"'
    ) in run_all
    assert 'smoke_launch.sh" "$QUICKLINK_FEATURE_APPID"' not in run_all


def test_quicklink_smoke_accepts_feature_fixture_and_checks_policy_order():
    root = Path(__file__).parents[1]
    smoke = (root / "scripts/deck/verify/smoke_quicklinks.sh").read_text()
    probe = (root / "scripts/deck/js/check_quicklinks.js").read_text()

    assert 'feature="${4:-}"' in smoke
    assert 'expected_order = ["Store Page", "DLC", "Community Hub", "Points Shop"]' in smoke
    assert 'delisted["storePage"]' in smoke
    assert 'delisted["support"]' in smoke
    assert 'matched["market"]' in smoke
    assert 'delisted["market"]' in smoke
    assert 'feature["support"]' in smoke
    assert 'feature["market"]' in smoke
    assert "quickLinkOrder" in probe
    assert "pointsShop" in probe
    assert "support" in probe
    assert '"Market"' in probe
    assert '"Community Market"' in probe
    assert "detailsMetadata" in probe
    assert 'matched["developerInfo"] or matched["detailsMetadata"]' in smoke
    assert 'never["developerInfo"] or never["detailsMetadata"]' in smoke


def test_controller_layout_probe_is_bounded_cache_populating_and_hashes_layout_identities():
    root = Path(__file__).parents[1]
    probe_path = root / "scripts/deck/js/check_controller_layouts.js"
    probe = probe_path.read_text()

    assert "globalThis.ControllerStore" in probe
    assert "globalThis.controllerStore" in probe
    assert "const controllerListStore" in probe
    assert 'typeof controllerListStore?.GetControllers !== "function"' in probe
    assert 'throw new Error("controller list unavailable")' in probe
    assert "controllerListStore.GetControllers()" in probe
    assert "Number.isInteger(controllerType)" in probe
    assert 'typeof filterOtherControllerTypes !== "boolean"' in probe
    serialized_payload = probe.rsplit("return JSON.stringify({", 1)[1]
    assert re.search(r"^    controllerType,$", serialized_payload, re.MULTILINE)
    assert re.search(r"^    filterOtherControllerTypes,$", serialized_payload, re.MULTILINE)
    assert "controllerConfiguratorStore.QueryConfigsForApp" in probe
    assert "GetOfficialConfigsForApp" in probe
    assert "GetTemplateConfigsForApp" in probe
    assert "GetWorkshopConfigsForApp" in probe
    assert "GetAllConfigs" in probe
    assert "SECOND_DISPLAY_APPID" in probe
    assert "SECOND_SOURCE_APPID" in probe
    assert "THIRD_DISPLAY_APPID" in probe
    assert "m_mapAppConfigs.has(sourceAppid)" in probe
    assert "m_mapAppConfigs.has(secondSourceAppid)" in probe
    assert "firstSourceCount" in probe
    assert "secondSourceCount" in probe
    assert "firstDisplayedCount" in probe
    assert "secondDisplayedCount" in probe
    assert "thirdDisplayedCount" in probe
    assert "elapsedMs" in probe
    assert "BConfigurationQueryInFlight" in probe
    assert "urlHashes" in probe
    assert "URL:" not in probe

    forbidden_mutators = (
        "SetSelectedConfigForApp",
        "PreviewConfigForAppAndController",
        "ClearSelectedConfigForApp",
        "ExportCurrentControllerConfiguration",
        "DeletePersonalControllerConfiguration",
        "StartEditingControllerConfiguration",
        "SaveEditingControllerConfiguration",
        "SetEditingControllerConfiguration",
        "save_metadata",
        "remove_metadata",
        "reload",
        "navigate",
        "launch",
        "m_mapAppConfigs.set",
        "m_mapAppConfigs.delete",
        "m_mapAppConfigs.clear",
        "m_mapAppConfigs.entries",
        "m_mapAppConfigs.keys",
        "m_mapAppConfigs.values",
        "m_mapAppConfigs.forEach",
    )
    for mutator in forbidden_mutators:
        assert mutator not in probe


def test_controller_layout_smoke_reuses_semantic_fixtures_and_no_launch_suite():
    root = Path(__file__).parents[1]
    smoke = (root / "scripts/deck/verify/smoke_controller_layouts.sh").read_text()
    run_all = (root / "scripts/deck/verify/run_all.sh").read_text()

    assert 'fixtures="${1:?usage:' in smoke
    assert 'f["listed_match"]' in smoke
    assert 'f["delisted_match"]' in smoke
    assert 'f["never_on_steam"]' in smoke
    assert "sourceCompared" in smoke
    assert "Community results are empty" in smoke
    assert "duplicate Community layout identities" in smoke
    assert "Recommended" in smoke
    assert "Official" in smoke
    assert 'SECOND_DISPLAY_APPID=${3:-}' in smoke
    assert 'SECOND_SOURCE_APPID=${4:-}' in smoke
    assert 'THIRD_DISPLAY_APPID=${5:-}' in smoke
    assert '"$delisted_appid" "$delisted_source"' in smoke
    assert '"$never_appid"' in smoke
    assert 'isolation["deferred"]' not in smoke
    assert 'field(isolation, "afterSecond"' in smoke
    assert 'field(isolation, "afterThird"' in smoke
    assert 'field(after_second, "firstDisplayedCount"' in smoke
    assert 'field(after_second, "firstSourceCount"' in smoke
    assert 'field(after_second, "secondDisplayedCount"' in smoke
    assert 'field(after_second, "secondSourceCount"' in smoke
    assert 'field(after_third, "thirdDisplayedCount"' in smoke
    assert "elapsedMs" in smoke
    assert "including pre-existing caches" in smoke
    assert "Bounded no-selection controller-configuration cache-populating check." in smoke
    assert "Read-only matched controller-configuration discovery check." not in smoke
    assert 'smoke_controller_layouts.sh" "$run_dir/fixtures.json"' in run_all
    assert "if ((no_launch)); then" in run_all
    assert "use --no-launch for bounded cache-populating verification" in run_all
    assert "use --no-launch for read-only verification" not in run_all


def test_controller_tab_persistence_probe_and_smoke_are_bounded_and_output_safe():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_controller_tab_persistence.js").read_text()
    smoke = (root / "scripts/deck/verify/smoke_controller_tab_persistence.sh").read_text()
    run_all = (root / "scripts/deck/verify/run_all.sh").read_text()

    assert "DISPLAY_APPID" in probe
    assert "SOURCE_APPID" in probe
    assert "QueryControllerConfigsForApp" in probe
    assert "BConfigurationQueryInFlight" in probe
    _assert_controller_tab_probe_payload_contract(probe)
    assert "m_bFilterOtherControllerTypes" in probe
    assert "finally" in probe
    assert "SharedJSContext" in smoke
    assert "Steam Big Picture Mode" in smoke
    assert "DISPLAY_APPID" in smoke
    assert "SOURCE_APPID" in smoke
    _assert_controller_tab_smoke_contract(smoke)
    assert "active tab changes unexpectedly" in smoke
    assert "/tmp/Decky-Metadata/" in smoke
    assert "smoke_controller_tab_persistence.sh" not in run_all

    forbidden = (
        "SetSelectedConfigForApp",
        "PreviewConfigForAppAndController",
        "ApplyConfig",
        "StartEditingControllerConfiguration",
        "SaveEditingControllerConfiguration",
        "RunGame",
        "run-game",
        "cdp.py input",
        "Navigation.Navigate",
        "location.href",
        "URL:",
        "accountName",
    )
    for token in forbidden:
        assert token not in probe
        assert token not in smoke


def test_controller_tab_probe_contract_rejects_missing_payload_fields_and_raw_identities():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_controller_tab_persistence.js").read_text()

    with pytest.raises(AssertionError):
        _assert_controller_tab_probe_payload_contract(
            probe.replace("selectedTab: selected.snapshot.selectedTab,", "", 1)
        )
    with pytest.raises(AssertionError):
        _assert_controller_tab_probe_payload_contract(
            probe.replace("urlHashes: identities.map(hash)", "hashes: identities.map(hash)", 1)
        )
    with pytest.raises(AssertionError):
        _assert_controller_tab_probe_payload_contract(
            probe.replace("elapsedMs: Date.now() - startedAt,", "identities: [],", 1)
        )
    with pytest.raises(AssertionError):
        _assert_controller_tab_probe_payload_contract(
            probe.replace(
                "if (stableSamples >= 3) {\n          after = candidate;",
                "if (stableSamples >= 1) {\n          after = candidate;",
                1,
            )
        )


def _run_controller_tab_query_probe(probe: str, replacement_delay_ms: int | None):
    source = (
        probe.replace('"__PHASE__"', '"query"')
        .replace('"__DISPLAY_APPID__"', '"3213262460"')
        .replace('"__SOURCE_APPID__"', '"55150"')
    )
    delayed_replacement = (
        f"setTimeout(() => {{ entry = {{ generation: 2 }}; records = [{{ URL: \"layout://one\" }}, {{ URL: \"layout://two\" }}]; }}, {replacement_delay_ms});"
        if replacement_delay_ms is not None
        else ""
    )
    runner = f"""
const first = {{ generation: 1 }};
let entry = first;
let records = [{{ URL: "layout://one" }}];
globalThis.controllerConfiguratorStore = {{
  m_bFilterOtherControllerTypes: true,
  m_appId: 3213262460,
  m_lastValidAppId: 3213262460,
  BConfigurationQueryInFlight: false,
  m_mapAppConfigs: {{ get: () => entry }},
  GetWorkshopConfigsForApp: () => records,
}};
globalThis.ControllerStore = {{
  GetControllers: () => [{{ nControllerIndex: 0, eControllerType: 102 }}],
}};
globalThis.SteamClient = {{ Input: {{
  QueryControllerConfigsForApp: () => {{ {delayed_replacement} }},
}} }};
{source}.then((payload) => process.stdout.write(payload)).catch((error) => {{
  process.stderr.write(String(error.message));
  process.exit(1);
}});
"""
    return subprocess.run(
        ["node", "-e", runner],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
    )


def test_controller_tab_query_probe_waits_for_delayed_cache_replacement_and_times_out_without_one():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_controller_tab_persistence.js").read_text()

    delayed = _run_controller_tab_query_probe(probe, replacement_delay_ms=75)
    assert delayed.returncode == 0, delayed.stderr
    payload = json.loads(delayed.stdout)
    assert payload["cacheReplaced"] is True
    assert payload["cacheUpdated"] is True
    assert payload["elapsedMs"] >= 50
    assert payload["after"]["getterCount"] == 2
    assert payload["stableSamples"] >= 3

    short_timeout = probe.replace("const deadline = Date.now() + 15000;", "const deadline = Date.now() + 50;")
    missing = _run_controller_tab_query_probe(short_timeout, replacement_delay_ms=None)
    assert missing.returncode != 0
    assert "controller query result did not settle" in missing.stderr


def test_controller_tab_query_probe_accepts_an_expanded_result_when_steam_keeps_cache_identity():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_controller_tab_persistence.js").read_text()
    source = (
        probe.replace('"__PHASE__"', '"query"')
        .replace('"__DISPLAY_APPID__"', '"3213262460"')
        .replace('"__SOURCE_APPID__"', '"55150"')
        .replace("const deadline = Date.now() + 15000;", "const deadline = Date.now() + 1000;")
    )
    runner = f"""
const entry = {{ generation: 1 }};
let records = [{{ URL: "layout://one" }}];
globalThis.controllerConfiguratorStore = {{
  m_bFilterOtherControllerTypes: true,
  m_appId: 3213262460,
  m_lastValidAppId: 3213262460,
  BConfigurationQueryInFlight: false,
  m_mapAppConfigs: {{ get: () => entry }},
  GetWorkshopConfigsForApp: () => records,
}};
globalThis.ControllerStore = {{
  GetControllers: () => [{{ nControllerIndex: 0, eControllerType: 102 }}],
}};
globalThis.SteamClient = {{ Input: {{
  QueryControllerConfigsForApp: () => {{
    setTimeout(() => {{ records = [{{ URL: "layout://one" }}, {{ URL: "layout://two" }}]; }}, 75);
  }},
}} }};
{source}.then((payload) => process.stdout.write(payload)).catch((error) => {{
  process.stderr.write(String(error.message));
  process.exit(1);
}});
"""
    completed = subprocess.run(
        ["node", "-e", runner],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
    )

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(completed.stdout)
    assert payload["cacheUpdated"] is False
    assert payload["resultSettled"] is True
    assert payload["after"]["getterCount"] == 2


def test_controller_tab_query_probe_accepts_a_delayed_in_place_cache_mutation():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_controller_tab_persistence.js").read_text()
    source = (
        probe.replace('"__PHASE__"', '"query"')
        .replace('"__DISPLAY_APPID__"', '"3213262460"')
        .replace('"__SOURCE_APPID__"', '"55150"')
    )
    runner = f"""
const entry = {{ generation: 1 }};
let records = [{{ URL: "layout://one" }}];
globalThis.controllerConfiguratorStore = {{
  m_bFilterOtherControllerTypes: true,
  m_appId: 3213262460,
  m_lastValidAppId: 3213262460,
  BConfigurationQueryInFlight: false,
  m_mapAppConfigs: {{ get: () => entry }},
  GetWorkshopConfigsForApp: () => records,
}};
globalThis.ControllerStore = {{
  GetControllers: () => [{{ nControllerIndex: 0, eControllerType: 102 }}],
}};
globalThis.SteamClient = {{ Input: {{
  QueryControllerConfigsForApp: () => {{ setTimeout(() => {{ entry.generation = 2; records = [{{ URL: "layout://one" }}, {{ URL: "layout://two" }}]; }}, 75); }},
}} }};
{source}.then((payload) => process.stdout.write(payload)).catch((error) => {{
  process.stderr.write(String(error.message));
  process.exit(1);
}});
"""
    mutated = subprocess.run(
        ["node", "-e", runner],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
    )
    assert mutated.returncode == 0, mutated.stderr
    payload = json.loads(mutated.stdout)
    assert payload["cacheReplaced"] is False
    assert payload["cacheMutated"] is True
    assert payload["cacheUpdated"] is True
    assert payload["after"]["getterCount"] == 2


def test_controller_tab_query_probe_ignores_an_early_unrelated_cache_mutation_until_expanded_result_settles():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_controller_tab_persistence.js").read_text()
    source = (
        probe.replace('"__PHASE__"', '"query"')
        .replace('"__DISPLAY_APPID__"', '"3213262460"')
        .replace('"__SOURCE_APPID__"', '"55150"')
    )
    runner = f"""
const entry = {{ generation: 1 }};
let records = [{{ URL: "layout://one" }}];
globalThis.controllerConfiguratorStore = {{
  m_bFilterOtherControllerTypes: true,
  m_appId: 3213262460,
  m_lastValidAppId: 3213262460,
  BConfigurationQueryInFlight: false,
  m_mapAppConfigs: {{ get: () => entry }},
  GetWorkshopConfigsForApp: () => records,
}};
globalThis.ControllerStore = {{
  GetControllers: () => [{{ nControllerIndex: 0, eControllerType: 102 }}],
}};
globalThis.SteamClient = {{ Input: {{
  QueryControllerConfigsForApp: () => {{
    setTimeout(() => {{ entry.generation = 2; }}, 25);
    setTimeout(() => {{
      entry.generation = 3;
      records = [{{ URL: "layout://one" }}, {{ URL: "layout://two" }}];
    }}, 250);
  }},
}} }};
{source}.then((payload) => process.stdout.write(payload)).catch((error) => {{
  process.stderr.write(String(error.message));
  process.exit(1);
}});
"""
    completed = subprocess.run(
        ["node", "-e", runner],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
    )

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(completed.stdout)
    assert payload["after"]["getterCount"] == 2
    assert payload["after"]["urlHashes"] != payload["before"]["urlHashes"]
    assert payload["stableSamples"] >= 3
    assert payload["elapsedMs"] >= 350


def test_controller_tab_filter_restore_probe_restores_the_original_visible_filter():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_controller_tab_persistence.js").read_text()
    source = (
        probe.replace('"__PHASE__"', '"restore-filter"')
        .replace('"__DISPLAY_APPID__"', '"3213262460"')
        .replace('"__SOURCE_APPID__"', '"55150"')
        .replace('"__RESTORE_FILTER__"', '"false"')
    )
    runner = f"""
const calls = [];
globalThis.controllerConfiguratorStore = {{
  m_bFilterOtherControllerTypes: true,
  GetWorkshopConfigsForApp: () => [],
}};
globalThis.ControllerStore = {{
  GetControllers: () => [{{ nControllerIndex: 0, eControllerType: 102 }}],
}};
globalThis.SteamClient = {{ Input: {{
  QueryControllerConfigsForApp: (...args) => calls.push(args),
}} }};
{source}.then((payload) => process.stdout.write(JSON.stringify({{
  payload: JSON.parse(payload),
  calls,
}}))).catch((error) => {{
  process.stderr.write(String(error.message));
  process.exit(1);
}});
"""
    restored = subprocess.run(
        ["node", "-e", runner],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
    )
    assert restored.returncode == 0, restored.stderr
    result = json.loads(restored.stdout)
    payload = result["payload"]
    assert payload["restoredFilter"] is False
    assert payload["restorationQueryIssued"] is True
    assert payload["controllerIndex"] == 0
    assert result["calls"] == [[3213262460, 0, False]]


def test_controller_tab_filter_capture_probe_reads_the_original_visible_filter_without_querying():
    root = Path(__file__).parents[1]
    probe = (root / "scripts/deck/js/check_controller_tab_persistence.js").read_text()
    source = (
        probe.replace('"__PHASE__"', '"capture-filter"')
        .replace('"__DISPLAY_APPID__"', '"3213262460"')
        .replace('"__SOURCE_APPID__"', '"55150"')
    )
    runner = f"""
globalThis.controllerConfiguratorStore = {{ m_bFilterOtherControllerTypes: true }};
{source}.then((payload) => process.stdout.write(payload)).catch((error) => {{
  process.stderr.write(String(error.message));
  process.exit(1);
}});
"""
    captured = subprocess.run(
        ["node", "-e", runner],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
    )
    assert captured.returncode == 0, captured.stderr
    assert json.loads(captured.stdout)["originalFilter"] is True


def _write_controller_tab_smoke_fixture(tmp_path: Path) -> Path:
    root = tmp_path / "fixture"
    verify = root / "scripts/deck/verify"
    verify.mkdir(parents=True)
    smoke_source = (
        Path(__file__).parents[1] / "scripts/deck/verify/smoke_controller_tab_persistence.sh"
    ).read_text(encoding="utf-8")
    smoke = verify / "smoke_controller_tab_persistence.sh"
    smoke.write_text(smoke_source, encoding="utf-8")
    (verify / "_lib.sh").write_text(
        """#!/usr/bin/env bash
set -euo pipefail
DECK_DIR=\"$(cd -- \"$(dirname -- \"${BASH_SOURCE[0]}\")/..\" && pwd)\"
JS_DIR=\"$DECK_DIR/js\"
cdp() { python3 \"$DECK_DIR/cdp.py\" \"$@\"; }
pass() { echo \"PASS: $*\"; }
fail() { echo \"FAIL: $*\" >&2; exit 1; }
""",
        encoding="utf-8",
    )
    deck = root / "scripts/deck"
    (deck / "js").mkdir(exist_ok=True)
    (deck / "js/check_controller_tab_persistence.js").write_text("// fake transport ignores the source\n")
    (deck / "cdp.py").write_text(
        """import json
import os
import sys
from pathlib import Path

variables = dict(
    value.split("=", 1) for value in sys.argv if "=" in value and not value.startswith("@")
)
phase = variables["PHASE"]
log = Path(os.environ["FAKE_CDP_LOG"])
log.write_text(log.read_text() + phase + "\\n" if log.exists() else phase + "\\n")
filter_state = Path(os.environ["FAKE_FILTER_STATE"])
if phase == "capture-filter":
    print(json.dumps({"originalFilter": filter_state.read_text() == "true"}))
elif phase == "dom-select":
    if os.environ.get("FAKE_CDP_MODE") == "select-fail":
        raise SystemExit("dom-select transport failed")
    print(json.dumps({
        "originalSelectedTab": {"label": "Your Layouts"},
        "selectedTab": {"label": "Community Layouts"},
        "tabs": [],
        "renderedCount": 1,
    }))
elif phase == "query":
    filter_state.write_text("false")
    raise SystemExit("query transport failed")
elif phase == "restore-filter":
    filter_state.write_text(variables["RESTORE_FILTER"])
    print(json.dumps({"restoredFilter": variables["RESTORE_FILTER"] == "true"}))
elif phase == "dom-restore":
    print(json.dumps({"selectedTab": {"label": variables["RESTORE_TAB"]}}))
else:
    raise SystemExit(f"unexpected phase: {phase}")
""",
        encoding="utf-8",
    )
    return smoke


def _run_controller_tab_smoke_with_failed_transport(
    tmp_path: Path,
    evidence: Path,
    mode: str | None = None,
) -> tuple[subprocess.CompletedProcess[str], Path, Path]:
    smoke = _write_controller_tab_smoke_fixture(tmp_path)
    log = tmp_path / "cdp.log"
    filter_state = tmp_path / "filter-state"
    filter_state.write_text("true")
    environment = {
        "FAKE_CDP_LOG": str(log),
        "FAKE_FILTER_STATE": str(filter_state),
    }
    if mode is not None:
        environment["FAKE_CDP_MODE"] = mode
    completed = subprocess.run(
        ["bash", str(smoke), "3213262460", "55150", "102", str(evidence)],
        check=False,
        capture_output=True,
        text=True,
        timeout=3,
        env={**os.environ, **environment},
    )
    return completed, log, filter_state


def _controller_tab_smoke_evidence_path(tmp_path: Path) -> Path:
    evidence = (
        Path("/tmp/Decky-Metadata/pytest-controller-tab-smoke")
        / tmp_path.name
        / "tab-persistence.json"
    )
    evidence.parent.mkdir(parents=True, exist_ok=True)
    return evidence


def test_controller_tab_smoke_restores_filter_when_query_transport_fails(tmp_path: Path):
    evidence = _controller_tab_smoke_evidence_path(tmp_path)
    completed, log, filter_state = _run_controller_tab_smoke_with_failed_transport(tmp_path, evidence)

    assert completed.returncode != 0
    assert filter_state.read_text() == "true"
    assert log.read_text().splitlines() == [
        "capture-filter",
        "dom-select",
        "query",
        "restore-filter",
        "dom-restore",
    ]
    assert json.loads(evidence.read_text())["status"] != "passed"


def test_controller_tab_smoke_invalidates_prior_passing_evidence_before_dom_select(tmp_path: Path):
    evidence = _controller_tab_smoke_evidence_path(tmp_path)
    evidence.write_text('{"status":"passed"}\n')
    completed, log, _filter_state = _run_controller_tab_smoke_with_failed_transport(
        tmp_path,
        evidence,
        mode="select-fail",
    )

    assert completed.returncode != 0
    assert log.read_text().splitlines() == ["capture-filter", "dom-select", "restore-filter"]
    assert json.loads(evidence.read_text())["status"] != "passed"


def test_controller_tab_smoke_contract_rejects_early_pass_before_tab_restoration():
    root = Path(__file__).parents[1]
    smoke = (root / "scripts/deck/verify/smoke_controller_tab_persistence.sh").read_text()
    restore = 'restore_json="$(probe "Steam Big Picture Mode" "dom-restore" "$original_tab")"'

    with pytest.raises(AssertionError):
        _assert_controller_tab_smoke_contract(smoke.replace(restore, "", 1))
