import asyncio
import types

import main


def make_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


def test_refresh_steam_activity_for_app_returns_none_for_unknown_metadata(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)

    def fail_fetch(*_args, **_kwargs):
        raise AssertionError("unknown metadata should not fetch steam news")

    monkeypatch.setattr(plugin, "_metadata_with_steam_news_sync", fail_fetch)

    result = asyncio.run(plugin.refresh_steam_activity_for_app(999))

    assert result is None


def test_refresh_steam_activity_for_app_skips_while_batch_refresh_running(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._activity_refresh_task = types.SimpleNamespace(done=lambda: False)
    plugin._data["metadata"]["101"] = {"title": "Existing", "steam_news": []}

    def fail_fetch(*_args, **_kwargs):
        raise AssertionError("batch refresh in progress should not fetch steam news")

    monkeypatch.setattr(plugin, "_metadata_with_steam_news_sync", fail_fetch)

    result = asyncio.run(plugin.refresh_steam_activity_for_app(101))

    assert result is None


def test_refresh_steam_activity_for_app_returns_and_persists_matched_news(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._data["metadata"]["101"] = {
        "title": "Space Marine",
        "source": "Manual",
        "steam_news": [],
    }
    calls = []

    def fake_fetch(metadata, title, limit=6, *, include_details=True):
        calls.append(
            {
                "metadata": metadata,
                "title": title,
                "limit": limit,
                "include_details": include_details,
            }
        )
        refreshed = dict(metadata)
        refreshed["steam_news"] = [
            {
                "id": "n1",
                "gid": "123456789",
                "title": "Update",
                "url": "https://store.steampowered.com/news/app/123/view/123456789",
                "date": 123,
                "summary": "Fresh news",
            }
        ]
        refreshed["steam_news_enriched_at"] = 456
        return refreshed

    monkeypatch.setattr(plugin, "_metadata_with_steam_news_sync", fake_fetch)

    result = asyncio.run(plugin.refresh_steam_activity_for_app(101))

    assert calls == [
        {
            "metadata": {
                "title": "Space Marine",
                "source": "Manual",
                "steam_news": [],
            },
            "title": "Space Marine",
            "limit": 10,
            "include_details": False,
        }
    ]
    assert result is not None
    assert result["steam_news"][0]["title"] == "Update"
    assert plugin._data["metadata"]["101"]["steam_news"][0]["title"] == "Update"

    plugin._data = plugin._default_data()
    plugin._load_data()
    assert plugin._data["metadata"]["101"]["steam_news"][0]["title"] == "Update"


def test_refresh_steam_activity_for_app_persists_miss_with_metadata(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._data["metadata"]["202"] = {
        "title": "No News Game",
        "source": "Manual",
        "steam_news": [
            {
                "id": "old",
                "title": "Old",
                "url": "https://store.steampowered.com/news/app/456/view/456789123",
                "date": 1,
            }
        ],
    }

    def fake_fetch(metadata, title, limit=6, *, include_details=True):
        assert title == "No News Game"
        assert limit == 10
        assert include_details is False
        refreshed = dict(metadata)
        refreshed["steam_appid"] = 456
        refreshed["steam_news"] = []
        return refreshed

    monkeypatch.setattr(plugin, "_metadata_with_steam_news_sync", fake_fetch)

    result = asyncio.run(plugin.refresh_steam_activity_for_app(202))

    assert result is None
    assert plugin._data["metadata"]["202"]["steam_appid"] == 456
    assert plugin._data["metadata"]["202"]["steam_news"] == []

    plugin._data = plugin._default_data()
    plugin._load_data()
    assert plugin._data["metadata"]["202"]["steam_appid"] == 456
    assert plugin._data["metadata"]["202"]["steam_news"] == []
