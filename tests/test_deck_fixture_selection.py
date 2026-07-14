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
    assert 'feature["support"]' in smoke
    assert "quickLinkOrder" in probe
    assert "pointsShop" in probe
    assert "support" in probe
    assert "detailsMetadata" in probe
    assert 'matched["developerInfo"] or matched["detailsMetadata"]' in smoke
    assert 'never["developerInfo"] or never["detailsMetadata"]' in smoke
