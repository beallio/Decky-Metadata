import asyncio

import main


def make_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


def test_scan_missing_steam_match_skips_ign(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    ign_calls = []

    def steam_match(metadata, title, limit=10):
        assert metadata == {
            "title": "Assassin's Creed: Director's Cut",
            "source": "Manual",
            "id": "Assassin's Creed: Director's Cut",
        }
        assert title == "Assassin's Creed: Director's Cut"
        assert limit == 10
        return {
            "title": title,
            "steam_appid": 15100,
            "source": "Steam",
            "description": "d",
        }

    def fail_ign(title):
        ign_calls.append(title)
        raise AssertionError("IGN should not be fetched when Steam matches")

    monkeypatch.setattr(plugin, "_metadata_with_steam_news_sync", steam_match)
    monkeypatch.setattr(plugin, "_auto_fetch_metadata_sync", fail_ign)

    asyncio.run(
        plugin._scan_missing(
            [{"appid": 1, "name": "Assassin's Creed: Director's Cut"}]
        )
    )

    assert plugin._data["metadata"]["1"]["steam_appid"] == 15100
    assert plugin._scan_progress["assigned"] == 1
    assert plugin._scan_progress["failed"] == 0
    assert ign_calls == []


def test_scan_missing_steam_miss_falls_back_to_ign(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    ign_calls = []

    def steam_miss(metadata, title, limit=10):
        return dict(metadata)

    def ign_match(title):
        ign_calls.append(title)
        return {"title": title, "source": "IGN", "description": "d"}

    monkeypatch.setattr(plugin, "_metadata_with_steam_news_sync", steam_miss)
    monkeypatch.setattr(plugin, "_auto_fetch_metadata_sync", ign_match)

    asyncio.run(plugin._scan_missing([{"appid": 1, "name": "Mario"}]))

    assert plugin._data["metadata"]["1"]["source"] == "IGN"
    assert plugin._data["metadata"]["1"]["description"] == "d"
    assert plugin._scan_progress["assigned"] == 1
    assert plugin._scan_progress["failed"] == 0
    assert ign_calls == ["Mario"]


def test_scan_missing_steam_and_ign_miss_saves_nothing(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)

    def steam_miss(metadata, title, limit=10):
        return dict(metadata)

    monkeypatch.setattr(plugin, "_metadata_with_steam_news_sync", steam_miss)
    monkeypatch.setattr(plugin, "_auto_fetch_metadata_sync", lambda title: None)

    asyncio.run(plugin._scan_missing([{"appid": 1, "name": "Unknown Game"}]))

    assert "1" not in plugin._data["metadata"]
    assert plugin._scan_progress["failed"] == 1
    assert plugin._scan_progress["assigned"] == 0
