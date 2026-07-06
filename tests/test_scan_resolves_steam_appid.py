import asyncio

import main


def make_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


def test_scan_missing_enriches_fallback_metadata_with_steam_appid(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    calls = []

    monkeypatch.setattr(
        plugin,
        "_auto_fetch_metadata_sync",
        lambda title: {"title": title, "source": "IGDB", "description": "Fetched"},
    )

    def enrich(metadata, title, limit=6):
        calls.append((metadata, title, limit))
        enriched = dict(metadata)
        if enriched.get("source") != "Manual":
            enriched["steam_appid"] = 32500
            enriched["steam_store_url"] = "https://store.steampowered.com/app/32500"
        return enriched

    monkeypatch.setattr(plugin, "_metadata_with_steam_news_sync", enrich)

    asyncio.run(plugin._scan_missing([{"appid": 101, "name": "The Force Unleashed II"}]))

    assert calls == [
        (
            {"title": "The Force Unleashed II", "source": "Manual", "id": "The Force Unleashed II"},
            "The Force Unleashed II",
            10,
        ),
        (
            {
                "title": "The Force Unleashed II",
                "source": "IGDB",
                "description": "Fetched",
            },
            "The Force Unleashed II",
            10,
        ),
    ]
    assert plugin._data["metadata"]["101"]["steam_appid"] == 32500
    assert plugin._scan_progress["assigned"] == 1
    assert plugin._scan_progress["failed"] == 0


def test_scan_missing_continues_after_per_game_enrichment_failure(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    enriched_titles = []

    monkeypatch.setattr(
        plugin,
        "_auto_fetch_metadata_sync",
        lambda title: {"title": title, "source": "IGDB", "description": "Fetched"},
    )

    def enrich(metadata, title, limit=6):
        enriched_titles.append(title)
        if title == "Broken Game":
            raise RuntimeError("steam lookup failed")
        enriched = dict(metadata)
        enriched["steam_appid"] = 1211020
        return enriched

    monkeypatch.setattr(plugin, "_metadata_with_steam_news_sync", enrich)

    asyncio.run(
        plugin._scan_missing(
            [
                {"appid": 101, "name": "Broken Game"},
                {"appid": 202, "name": "Wobbly Life"},
            ]
        )
    )

    assert enriched_titles == ["Broken Game", "Wobbly Life", "Wobbly Life"]
    assert "101" not in plugin._data["metadata"]
    assert plugin._data["metadata"]["202"]["steam_appid"] == 1211020
    assert plugin._scan_progress["completed"] == 2
    assert plugin._scan_progress["assigned"] == 1
    assert plugin._scan_progress["failed"] == 1
