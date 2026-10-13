from __future__ import annotations

import asyncio
import copy

import main


def make_plugin() -> main.Plugin:
    plugin = main.Plugin.__new__(main.Plugin)
    plugin._data = {"metadata": {"100": {"title": "My shortcut", "steam_appid": 400}}}
    return plugin


def test_interactive_search_keeps_nonfirst_choices_without_changing_saved_matches(monkeypatch) -> None:
    plugin = make_plugin()
    before = copy.deepcopy(plugin._data)
    capsule = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/620/capsule_231x87.jpg"
    monkeypatch.setattr(plugin, "_http_json", lambda *_args, **_kwargs: {"items": [
        {"type": "bundle", "id": 99, "name": "Portal bundle"},
        {"type": "app", "id": 620, "name": "Portal 2", "tiny_image": capsule},
        {"type": "app", "id": 400, "name": "Portal"},
        {"type": "app", "id": 1113550, "name": "Bridge Constructor Portal - Portal Proficiency"},
    ]})

    result = asyncio.run(plugin.search_steam_matches("Portal", 2))

    assert result["error"] is None
    assert [item["steam_appid"] for item in result["items"]] == [620, 400]
    assert result["items"][0]["cover_url"] == capsule
    assert result["items"][1]["title"] == "Portal"
    assert plugin._data == before


def test_preview_preserves_partial_dates_without_changing_saved_metadata(monkeypatch) -> None:
    plugin = make_plugin()
    before = copy.deepcopy(plugin._data)
    header = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/400/header.jpg"
    monkeypatch.setattr(plugin, "_http_json", lambda *_args, **_kwargs: {"400": {
        "success": True,
        "data": {"steam_appid": 400, "name": "Portal", "type": "game", "header_image": header,
                 "developers": ["Valve"], "release_date": {"date": "2007"}},
    }})

    result = asyncio.run(plugin.get_steam_match_preview(400))

    assert result["error"] is None
    assert result["preview"] == {
        "steam_appid": 400, "title": "Portal", "cover_url": header,
        "developers": ["Valve"], "release_date_label": "2007", "app_type": "game",
    }
    assert plugin._data == before


def test_search_distinguishes_no_matches_from_a_provider_failure(monkeypatch) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(plugin, "_http_json", lambda *_args, **_kwargs: {"items": []})
    empty = asyncio.run(plugin.search_steam_matches("No such game", 8))
    assert empty == {"items": [], "error": None}

    def unavailable(*_args, **_kwargs):
        raise TimeoutError("Steam did not respond")

    monkeypatch.setattr(plugin, "_http_json", unavailable)
    failed = asyncio.run(plugin.search_steam_matches("Portal", 8))
    assert failed["items"] == []
    assert failed["error"] is not None


def test_malformed_optional_art_does_not_hide_a_valid_search_result(monkeypatch) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(plugin, "_http_json", lambda *_args, **_kwargs: {"items": [
        {"type": "app", "id": 400, "name": "Portal", "tiny_image": "https://["},
    ]})

    result = asyncio.run(plugin.search_steam_matches("Portal", 8))

    assert result == {"items": [{"steam_appid": 400, "title": "Portal", "cover_url": None}], "error": None}


def test_preview_uses_available_capsule_when_header_is_malformed_and_keeps_unknown_fields_unknown(monkeypatch) -> None:
    plugin = make_plugin()
    capsule = "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/400/capsule_231x87.jpg"
    monkeypatch.setattr(plugin, "_http_json", lambda *_args, **_kwargs: {"400": {
        "success": True,
        "data": {"name": "Portal", "header_image": "https://[", "capsule_image": capsule,
                 "developers": None, "release_date": None},
    }})

    result = asyncio.run(plugin.get_steam_match_preview(400))

    assert result["error"] is None
    assert result["preview"] == {
        "steam_appid": 400, "title": "Portal", "cover_url": capsule,
        "developers": [], "release_date_label": None, "app_type": None,
    }
