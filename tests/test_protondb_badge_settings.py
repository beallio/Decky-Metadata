from __future__ import annotations

import asyncio
import json

import pytest

import main


SETTINGS = {
    "enabled": True,
    "home": True,
    "library": False,
    "gameView": True,
    "store": False,
    "focusOnly": True,
    "coverPosition": "top-right",
}


def make_plugin(tmp_path, monkeypatch) -> main.Plugin:
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


def test_legacy_data_stays_unchanged_until_badges_are_enabled(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._settings_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "release_date_format": "date-only-v1",
        "metadata": {"123": {"title": "Keep", "steam_appid": 620, "steam_store_state": "available"}},
        "settings": {"debug_logging": False, "unrelated": {"keep": True}},
        "update_settings": {"update_channel": "development"},
    }
    original = json.dumps(payload, separators=(",", ":"))
    plugin._data_file.write_text(original, encoding="utf-8")

    assert asyncio.run(plugin.get_protondb_badge_settings())["enabled"] is False
    assert plugin._data_file.read_text(encoding="utf-8") == original
    asyncio.run(plugin.set_debug_logging(True))
    saved = json.loads(plugin._data_file.read_text(encoding="utf-8"))
    assert "protondb_badges" not in saved["settings"]
    assert saved["settings"]["unrelated"] == payload["settings"]["unrelated"]
    assert saved["metadata"] == payload["metadata"]
    assert saved["update_settings"] == payload["update_settings"]


def test_preferences_survive_new_plugin_instance_without_changing_metadata(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._settings_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "metadata": {"456": {"title": "Saved shortcut", "steam_appid": 1145360, "steam_store_state": "available"}},
        "settings": {"game_trailers": {"enabled": True}, "mini_achievements_enabled": True},
    }
    plugin._data_file.write_text(json.dumps(payload), encoding="utf-8")
    asyncio.run(plugin.set_protondb_badge_settings(SETTINGS))

    reopened = make_plugin(tmp_path, monkeypatch)
    assert asyncio.run(reopened.get_protondb_badge_settings()) == SETTINGS
    saved = json.loads(plugin._data_file.read_text(encoding="utf-8"))
    assert saved["metadata"] == payload["metadata"]
    assert saved["settings"]["game_trailers"]["enabled"] is True
    assert saved["settings"]["mini_achievements_enabled"] is True


@pytest.mark.parametrize("field,value", [
    ("enabled", "true"),
    ("home", 1),
    ("library", None),
    ("gameView", []),
    ("store", {}),
    ("focusOnly", "false"),
    ("coverPosition", "bottom-right"),
    ("coverPosition", None),
])
def test_invalid_preferences_cannot_replace_saved_choices(tmp_path, monkeypatch, field, value) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    asyncio.run(plugin.set_protondb_badge_settings(SETTINGS))
    original = plugin._data_file.read_bytes()
    invalid = {**SETTINGS, field: value}

    with pytest.raises(ValueError, match="invalid ProtonDB badge settings"):
        asyncio.run(plugin.set_protondb_badge_settings(invalid))
    assert asyncio.run(plugin.get_protondb_badge_settings()) == SETTINGS
    assert plugin._data_file.read_bytes() == original


@pytest.mark.parametrize("payload", [None, [], {"enabled": True}, {**SETTINGS, "unknown": True}])
def test_incomplete_or_unknown_preference_schema_is_rejected(tmp_path, monkeypatch, payload) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    with pytest.raises(ValueError, match="invalid ProtonDB badge settings"):
        asyncio.run(plugin.set_protondb_badge_settings(payload))


def test_bad_saved_values_do_not_enable_network_features_or_rewrite_file(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._settings_dir.mkdir(parents=True, exist_ok=True)
    original = json.dumps({"release_date_format": "date-only-v1", "settings": {"protondb_badges": {
        "enabled": "true", "library": False, "focusOnly": True, "coverPosition": "top-left",
    }}}, separators=(",", ":"))
    plugin._data_file.write_text(original, encoding="utf-8")

    loaded = asyncio.run(plugin.get_protondb_badge_settings())
    assert loaded["enabled"] is False
    assert loaded["library"] is False
    assert loaded["focusOnly"] is True
    assert loaded["coverPosition"] == "top-left"
    assert plugin._data_file.read_text(encoding="utf-8") == original


def test_failed_save_retains_previous_confirmed_preferences(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    asyncio.run(plugin.set_protondb_badge_settings(SETTINGS))
    original = plugin._data_file.read_bytes()

    def fail_save() -> None:
        raise OSError("storage unavailable")

    monkeypatch.setattr(plugin, "_save_data", fail_save)
    with pytest.raises(OSError, match="storage unavailable"):
        asyncio.run(plugin.set_protondb_badge_settings({**SETTINGS, "enabled": False}))
    assert plugin._data["settings"]["protondb_badges"] == SETTINGS
    assert plugin._data_file.read_bytes() == original


def test_unreadable_settings_remain_an_explicit_failure(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    monkeypatch.setattr(plugin, "_load_data", lambda: False)
    with pytest.raises(RuntimeError, match="ProtonDB badge settings could not be loaded"):
        asyncio.run(plugin.get_protondb_badge_settings())
    with pytest.raises(RuntimeError, match="ProtonDB badge settings could not be loaded"):
        asyncio.run(plugin.set_protondb_badge_settings(SETTINGS))
