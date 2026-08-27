import json
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
    assert len(payloads) == 3
    selected = [payload for payload in payloads if "originalSelectedTab:" in payload]
    observed = [
        payload for payload in payloads
        if "selectedTab:" in payload and "originalSelectedTab:" not in payload
    ]
    queried = [payload for payload in payloads if re.search(r"(?m)^\s*controllerType(?:,|:)", payload)]
    assert len(selected) == 1
    assert len(observed) == 1
    assert len(queried) == 1
    selected = selected[0]
    observed = observed[0]
    queried = queried[0]

    for payload in (selected, observed):
        assert "selectedTab:" in payload
        assert "tabs:" in payload
        assert "renderedCount:" in payload
    assert "originalSelectedTab:" in selected
    for required in (
        "controllerIndex",
        "controllerType",
        "before",
        "after",
        "filterDuringQuery",
        "elapsedMs:",
    ):
        assert required in queried
    assert "return { getterCount: identities.length, urlHashes: identities.map(hash) };" in probe
    assert "cacheReplaced = cacheReplaced || displayedCacheEntry() !== cacheBeforeQuery;" in probe
    assert "controller query cache replacement timed out" in probe
    assert "stableSamples >= 3" in probe
    assert "chooser remount did not settle" in probe
    for forbidden in ("identities:", "URL:", "title:", "account"):
        assert forbidden not in "\n".join(payloads)


def _assert_controller_tab_smoke_contract(smoke: str) -> None:
    assert 'expected_controller_type="${3:?usage:' in smoke
    assert "expected type must be a non-negative integer" in smoke
    assert "if controller_type != expected_type:" in smoke
    assert "expectedControllerType" in smoke
    assert "query.cacheReplaced" in smoke
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
            probe.replace("stableSamples >= 3", "stableSamples >= 1", 1)
        )


def _run_controller_tab_query_probe(probe: str, replacement_delay_ms: int | None):
    source = (
        probe.replace('"__PHASE__"', '"query"')
        .replace('"__DISPLAY_APPID__"', '"3213262460"')
        .replace('"__SOURCE_APPID__"', '"55150"')
    )
    delayed_replacement = (
        f"setTimeout(() => {{ entry = {{ generation: 2 }}; }}, {replacement_delay_ms});"
        if replacement_delay_ms is not None
        else ""
    )
    runner = f"""
const first = {{ generation: 1 }};
let entry = first;
globalThis.controllerConfiguratorStore = {{
  m_bFilterOtherControllerTypes: true,
  BConfigurationQueryInFlight: false,
  m_mapAppConfigs: {{ get: () => entry }},
  GetWorkshopConfigsForApp: () => [{{ URL: "layout://one" }}],
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
    assert payload["elapsedMs"] >= 50

    short_timeout = probe.replace("const deadline = Date.now() + 15000;", "const deadline = Date.now() + 50;")
    missing = _run_controller_tab_query_probe(short_timeout, replacement_delay_ms=None)
    assert missing.returncode != 0
    assert "controller query cache replacement timed out" in missing.stderr


def test_controller_tab_smoke_contract_rejects_early_pass_before_tab_restoration():
    root = Path(__file__).parents[1]
    smoke = (root / "scripts/deck/verify/smoke_controller_tab_persistence.sh").read_text()
    restore = 'restore_json="$(probe "Steam Big Picture Mode" "dom-restore" "$original_tab")"'

    with pytest.raises(AssertionError):
        _assert_controller_tab_smoke_contract(smoke.replace(restore, "", 1))
