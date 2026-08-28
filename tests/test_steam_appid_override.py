import asyncio
from contextlib import nullcontext

import main
from tests._plugin import make_plugin


def test_enrich_steam_app_respects_pinned_appid(monkeypatch) -> None:
    plugin = make_plugin()
    plugin._data = {
        "metadata": {
            "123": {
                "title": "Transformers Devastation",
                "source": "Manual",
                "steam_appid": 338930,
                "steam_store_url": "",
                "deck_compat_override": 0,
            }
        }
    }
    plugin._load_data = lambda: None
    plugin._save_data = lambda: None
    called: dict[str, list[int]] = {"news": [], "deck": [], "details": []}

    def fail_resolve(title, metadata):
        raise AssertionError("title resolver should not run for pinned steam_appid")

    def fake_news(appid, title, limit=6):
        called["news"].append(appid)
        return [
            {
                "id": "n1",
                "title": "News",
                "url": "https://store.steampowered.com/news/app/338930/view/1",
                "date": 1,
                "summary": "Steam news",
            }
        ]

    def fake_deck(appid):
        called["deck"].append(appid)
        return 2

    def fake_details(appid):
        called["details"].append(appid)
        return {
            "description": "Steam description",
        }

    monkeypatch.setattr(main, "now", lambda: 1234567890)
    monkeypatch.setattr(plugin, "_resolve_steam_appid_for_title", fail_resolve)
    monkeypatch.setattr(plugin, "_steam_news_for_appid", fake_news)
    monkeypatch.setattr(plugin, "_steam_deck_compat_for_appid", fake_deck)
    monkeypatch.setattr(plugin, "_steam_appdetails_for_appid", fake_details)

    saved = asyncio.run(plugin.enrich_steam_app(123))

    assert saved is not None
    assert called == {"news": [338930], "deck": [338930], "details": [338930]}
    assert saved["steam_appid"] == 338930
    assert saved["steam_store_url"] == "https://store.steampowered.com/app/338930/"
    assert saved["deck_compat_category"] == 2
    assert saved["deck_compat_override"] == 0
    assert saved["description"] == "Steam description"
    assert plugin._data["metadata"]["123"]["steam_appid"] == 338930


def test_enrich_steam_app_returns_none_for_unknown_app() -> None:
    plugin = make_plugin()
    plugin._data = {"metadata": {}}
    plugin._load_data = lambda: None

    def fail_save():
        raise AssertionError("unknown app should not save metadata")

    plugin._save_data = fail_save

    assert asyncio.run(plugin.enrich_steam_app(999)) is None
    assert plugin._data == {"metadata": {}}


def test_fetched_metadata_merge_keeps_manual_compatibility_override_with_or_without_pin() -> None:
    fetched = {"title": "Fetched", "deck_compat_category": 3}

    unpinned = main.Plugin._merge_fetched_metadata(
        {"title": "Manual", "deck_compat_override": 0},
        fetched,
    )
    pinned = main.Plugin._merge_fetched_metadata(
        {"title": "Manual", "steam_appid": 55150, "deck_compat_override": 2},
        fetched,
    )

    assert unpinned["deck_compat_override"] == 0
    assert pinned["deck_compat_override"] == 2


def test_manual_save_and_scan_preserve_existing_compatibility_override() -> None:
    plugin = make_plugin()
    plugin._data = {
        "metadata": {
            "123": {
                "title": "Manual shortcut",
                "description": "",
                "store_categories": [],
                "deck_compat_override": 0,
            }
        }
    }
    plugin._data_guard = lambda: nullcontext()
    plugin._load_data = lambda: None
    plugin._save_data = lambda: None

    manually_saved = asyncio.run(
        plugin.save_metadata(
            123,
            {"title": "Manual shortcut", "description": "", "store_categories": []},
        )
    )
    assert manually_saved["deck_compat_override"] == 0

    asyncio.run(
        plugin._save_scan_pipeline_metadata(
            123,
            {
                "title": "Scanned shortcut",
                "description": "Fetched",
                "store_categories": [],
                "deck_compat_category": 3,
            },
        )
    )
    assert plugin._data["metadata"]["123"]["deck_compat_override"] == 0
