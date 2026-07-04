import asyncio

import main


def make_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


def test_activity_refresh_updates_news_without_detail_fanout(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._data["metadata"]["7"] = {
        "title": "Portal",
        "source": "Steam",
        "description": "Existing",
        "steam_appid": 400,
        "steam_news": [],
    }
    plugin._save_data()
    fanout_calls = []

    monkeypatch.setattr(
        plugin,
        "_steam_news_for_metadata",
        lambda metadata, title, limit=10: (
            400,
            "https://store.steampowered.com/app/400",
            [
                {
                    "id": "event-1",
                    "gid": "event-1",
                    "title": "Portal Update",
                    "url": "https://store.steampowered.com/news/app/400/view/event-1",
                    "summary": "Patch notes",
                    "body": "Patch notes",
                    "image": "https://cdn.example.com/portal.jpg",
                    "image_sources": ["https://cdn.example.com/portal.jpg"],
                    "date": 1000,
                }
            ],
        ),
    )

    def fail_detail_fanout(appid):
        fanout_calls.append(appid)
        raise AssertionError("activity refresh should not fetch appdetails/deck compatibility")

    monkeypatch.setattr(plugin, "_steam_deck_compat_for_appid", fail_detail_fanout)
    monkeypatch.setattr(plugin, "_steam_appdetails_for_appid", fail_detail_fanout)

    asyncio.run(plugin._refresh_steam_activities([{"appid": 7, "name": "Portal"}]))

    metadata = plugin._data["metadata"]["7"]
    assert metadata["steam_news"][0]["title"] == "Portal Update"
    assert metadata["steam_news_enriched_at"] > 0
    assert plugin._activity_refresh_progress["assigned"] == 1
    assert plugin._activity_refresh_progress["failed"] == 0
    assert fanout_calls == []


def test_sanitize_steam_news_uses_collected_image_sources_without_extraction(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)

    def fail_image_extraction(contents, steam_appid=0):
        raise AssertionError("sanitizing should not extract or score images")

    monkeypatch.setattr(plugin, "_steam_news_image_candidates", fail_image_extraction)

    rows = plugin._sanitize_steam_news(
        [
            {
                "id": "event-1",
                "gid": "event-1",
                "title": "Roadmap",
                "url": "https://store.steampowered.com/news/app/400/view/event-1",
                "summary": "New roadmap",
                "body": "New roadmap",
                "image": "https://cdn.example.com/roadmap.jpg",
                "image_sources": ["https://cdn.example.com/roadmap.jpg"],
                "date": 1000,
            }
        ]
    )

    assert rows[0]["image"] == "https://cdn.example.com/roadmap.jpg"
    assert rows[0]["image_sources"] == ["https://cdn.example.com/roadmap.jpg"]
