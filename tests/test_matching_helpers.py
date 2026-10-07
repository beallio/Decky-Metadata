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


def test_provider_description_preserves_blocks_and_decodes_once():
    assert matching.description_html_to_text("<h2>Flight</h2><div>Fly &lt;pilot&gt;</div><ul><li>First</li><li>Second</li></ul>") == "Flight\n\nFly <pilot>\n\n- First\n- Second"


def test_provider_description_lists_only_mark_items_with_text():
    assert matching.description_html_to_text("<ul><li></li><li><img src='cover.png'></li><li>&nbsp;</li></ul>") == ""
    assert matching.description_html_to_text("<ul><li><ul><li><img src='cover.png'></li></ul></li></ul>") == ""
    assert matching.description_html_to_text("<ul><li><p>First</p><ul><li></li><li>Nested</li></ul></li><li>Last</li></ul>") == "- First\n\n- Nested\n\n- Last"
    assert matching.description_html_to_text("<ul><li><ul><li>Nested</li></ul></li></ul>") == "- Nested"


@pytest.mark.parametrize(("markup", "expected"), [
    ("<ul><li></ul>", ""),
    ("<ul><li><img src='cover.png'></ul>", ""),
    ("<ul><li><img src='cover.png'><li>&nbsp;</ul>", ""),
    ("<ul><li><img src='cover.png'><li>Real<li></ul>", "- Real"),
    ("<ul><li><ul><li>Nested</ul></ul>", "- Nested"),
    ("<ul><li>Parent<ul><li><img src='cover.png'><li>Nested</ul><li>Last</ul>", "- Parent\n\n- Nested\n\n- Last"),
])
def test_provider_description_implicit_list_item_endings(markup, expected):
    assert matching.description_html_to_text(markup) == expected


@pytest.mark.parametrize("value", ["Apr 18, 2011", "18 Apr, 2011", "April 18, 2011", "18 April, 2011"])
def test_english_dates_normalize_to_calendar_strings(value):
    assert matching.normalize_release_date(value) == "2011-04-18"


@pytest.mark.parametrize("zone", ["UTC", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Etc/GMT+12", "Pacific/Kiritimati"])
def test_provider_dates_are_calendar_strings_in_every_timezone(zone):
    import json
    import os
    import subprocess
    import sys
    script = "from backend.matching import normalize_release_date; import json; print(json.dumps([normalize_release_date(d) for d in ['Mar 10, 2024', '11 March, 2024', '2024-11-03T17:00:00Z', '2024-11-04']]))"
    result = subprocess.run([sys.executable, "-c", script], env={**os.environ, "TZ": zone}, capture_output=True, text=True, check=True)
    assert json.loads(result.stdout) == ["2024-03-10", "2024-03-11", "2024-11-03", "2024-11-04"]


@pytest.mark.parametrize("value", ["2024-02-30", "2023-02-29", "Apr 2011", "2011", "Coming soon", "", None, 1710057600, True])
def test_invalid_or_incomplete_dates_remain_absent(value):
    assert matching.normalize_release_date(value) is None


def test_provider_dates_keep_the_supplied_calendar_day_and_accept_leap_days():
    assert matching.normalize_release_date("2024-03-10T00:00:00+14:00") == "2024-03-10"
    assert matching.normalize_release_date("2024-02-29") == "2024-02-29"
