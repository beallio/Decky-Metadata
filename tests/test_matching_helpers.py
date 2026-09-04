import pytest

from backend import matching


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Prototype", "prototype"),
        ("Prototype 2", "prototype 2"),
        ("Prototype Demo", "prototype demo"),
        ("1942 [USA]", "1942"),
        ("The Last of Us Part I Remastered", "last of us part i"),
        ("Warhammer 40,000: Space Marine Demo", "warhammer 40 000 space marine"),
        ("1942 USA", "1942 usa"),
    ],
)
def test_normalise_match_title_preserves_load_bearing_marker_words(title, expected) -> None:
    assert matching.normalise_match_title(title) == expected


@pytest.mark.parametrize(
    ("candidate", "query"),
    [
        ("Prototype", "Prototype"),
        ("Test Drive Unlimited", "Test Drive Unlimited"),
        ("Worms Armageddon Pack", "Worms Armageddon Pack"),
        ("Server Simulator", "Server Simulator"),
        ("Space Marine Demo", "Space Marine Demo"),
    ],
)
def test_non_primary_steam_title_ignores_markers_present_in_query(candidate, query) -> None:
    assert matching.is_non_primary_steam_title(candidate, query) is False


@pytest.mark.parametrize(
    ("candidate", "query"),
    [
        ("Prototype Demo", "Prototype"),
        ("Warhammer 40,000: Space Marine Demo", "Warhammer 40,000: Space Marine"),
        ("Sonic Mega Pack", "Sonic"),
        ("Rust Dedicated Server", "Rust"),
        ("Test Drive Unlimited", "Drive Unlimited"),
    ],
)
def test_non_primary_steam_title_keeps_candidate_only_markers(candidate, query) -> None:
    assert matching.is_non_primary_steam_title(candidate, query) is True


def test_non_primary_steam_title_keeps_single_argument_behavior() -> None:
    assert matching.is_non_primary_steam_title("Prototype") is True


def test_ign_title_acceptable_keeps_distinctive_numeric_token_requirement() -> None:
    assert matching.ign_title_acceptable("Prototype 2", "Prototype") is False
