import asyncio

import main


def make_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


def test_clear_metadata_cache_clears_only_metadata_and_persists(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._data["metadata"] = {
        "101": {"title": "Space Marine", "steam_appid": 123},
        "202": {"title": "Valhalla", "steam_appid": 456},
    }
    plugin._data["settings"]["debug_logging"] = True

    result = asyncio.run(plugin.clear_metadata_cache())

    assert result == {"ok": True, "cleared": 2}
    assert plugin._data["metadata"] == {}
    assert plugin._data["settings"]["debug_logging"] is True

    plugin._data = plugin._default_data()
    plugin._load_data()
    assert plugin._data["metadata"] == {}
    assert plugin._data["settings"]["debug_logging"] is True


def test_clear_metadata_cache_empty_cache_is_safe(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._data["settings"]["debug_logging"] = True

    result = asyncio.run(plugin.clear_metadata_cache())

    assert result == {"ok": True, "cleared": 0}
    assert plugin._data["metadata"] == {}
    assert plugin._data["settings"]["debug_logging"] is True
