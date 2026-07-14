import json
from pathlib import Path

import pytest

from scripts.deck.verify.select_fixtures import select

FIXTURE = Path(__file__).parent / "fixtures/agent_workflow/metadata.json"


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


def test_controller_layout_probe_is_read_only_and_hashes_layout_identities():
    root = Path(__file__).parents[1]
    probe_path = root / "scripts/deck/js/check_controller_layouts.js"
    probe = probe_path.read_text()

    assert "controllerStore.GetControllers()" in probe
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
    assert 'isolation["afterSecond"]' in smoke
    assert 'isolation["afterThird"]' in smoke
    assert 'after_second["firstDisplayedCount"]' in smoke
    assert 'after_second["firstSourceCount"]' in smoke
    assert 'after_second["secondDisplayedCount"]' in smoke
    assert 'after_second["secondSourceCount"]' in smoke
    assert 'after_third["thirdDisplayedCount"]' in smoke
    assert "elapsedMs" in smoke
    assert "including pre-existing caches" in smoke
    assert 'smoke_controller_layouts.sh" "$run_dir/fixtures.json"' in run_all
    assert "if ((no_launch)); then" in run_all
