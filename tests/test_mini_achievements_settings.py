from __future__ import annotations

import asyncio
import json

import pytest

import main


def make_plugin(tmp_path, monkeypatch) -> main.Plugin:
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


def test_legacy_setting_defaults_off_without_rewrite_or_unrelated_save_insertion(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._settings_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "metadata": {"123": {"title": "Keep", "steam_store_state": "available"}},
        "settings": {"debug_logging": False, "unrelated": "preserved"},
        "update_settings": {"preserve": True},
    }
    original = json.dumps(payload, separators=(",", ":"))
    plugin._data_file.write_text(original, encoding="utf-8")

    assert asyncio.run(plugin.get_mini_achievements_enabled()) is False
    assert plugin._data_file.read_text(encoding="utf-8") == original
    assert asyncio.run(plugin.set_debug_logging(True)) is True
    persisted = json.loads(plugin._data_file.read_text(encoding="utf-8"))
    assert "mini_achievements_enabled" not in persisted["settings"]
    assert persisted["settings"]["unrelated"] == "preserved"
    assert persisted["metadata"]["123"]["title"] == "Keep"
    assert persisted["update_settings"] == payload["update_settings"]


@pytest.mark.parametrize("enabled", [True, False])
def test_mini_achievements_setting_round_trip_preserves_other_settings(tmp_path, monkeypatch, enabled) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._settings_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "metadata": {"7": {"title": "Other", "steam_store_state": "available"}},
        "settings": {"unrelated": {"value": 1}},
        "update_settings": {"update_channel": "development"},
    }
    plugin._data_file.write_text(json.dumps(payload), encoding="utf-8")

    assert asyncio.run(plugin.set_mini_achievements_enabled(enabled)) is enabled
    assert asyncio.run(plugin.get_mini_achievements_enabled()) is enabled
    persisted = json.loads(plugin._data_file.read_text(encoding="utf-8"))
    assert persisted["settings"]["mini_achievements_enabled"] is enabled
    assert persisted["settings"]["unrelated"] == payload["settings"]["unrelated"]
    assert persisted["metadata"] == payload["metadata"]
    assert persisted["update_settings"] == payload["update_settings"]


@pytest.mark.parametrize("stored", [None, 0, 1, "true", [], {}])
def test_malformed_persisted_setting_defaults_off_without_rewrite(tmp_path, monkeypatch, stored) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._settings_dir.mkdir(parents=True, exist_ok=True)
    original = json.dumps({"settings": {"mini_achievements_enabled": stored}}, separators=(",", ":"))
    plugin._data_file.write_text(original, encoding="utf-8")

    assert asyncio.run(plugin.get_mini_achievements_enabled()) is False
    assert plugin._data["settings"]["mini_achievements_enabled"] is False
    assert plugin._data_file.read_text(encoding="utf-8") == original


@pytest.mark.parametrize("invalid", [None, 0, 1, "true", [], {}])
def test_invalid_setting_inputs_are_rejected_without_mutation(tmp_path, monkeypatch, invalid) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._settings_dir.mkdir(parents=True, exist_ok=True)
    original = json.dumps({"settings": {"mini_achievements_enabled": True}}, separators=(",", ":"))
    plugin._data_file.write_text(original, encoding="utf-8")

    with pytest.raises(ValueError, match="invalid mini achievements setting"):
        asyncio.run(plugin.set_mini_achievements_enabled(invalid))

    assert asyncio.run(plugin.get_mini_achievements_enabled()) is True
    assert plugin._data_file.read_text(encoding="utf-8") == original


def test_getter_and_setter_fail_when_data_cannot_load(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    monkeypatch.setattr(plugin, "_load_data", lambda: False)

    with pytest.raises(RuntimeError, match="mini achievements settings could not be loaded"):
        asyncio.run(plugin.get_mini_achievements_enabled())
    with pytest.raises(RuntimeError, match="mini achievements settings could not be loaded"):
        asyncio.run(plugin.set_mini_achievements_enabled(True))


@pytest.mark.parametrize("saved_key", [True, False, None])
def test_failed_save_restores_prior_key_state(tmp_path, monkeypatch, saved_key) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._settings_dir.mkdir(parents=True, exist_ok=True)
    settings = {"unrelated": "preserved"}
    if saved_key is not None:
        settings["mini_achievements_enabled"] = saved_key
    plugin._data_file.write_text(json.dumps({"settings": settings}), encoding="utf-8")
    assert plugin._load_data()
    before = plugin._data["settings"].copy()

    def fail_save() -> None:
        raise OSError("simulated write failure")

    monkeypatch.setattr(plugin, "_save_data", fail_save)
    with pytest.raises(OSError, match="simulated write failure"):
        asyncio.run(plugin.set_mini_achievements_enabled(True))

    assert plugin._data["settings"] == before
    if saved_key is None:
        assert "mini_achievements_enabled" not in plugin._data["settings"]
    assert plugin._data_file.read_text(encoding="utf-8") == json.dumps({"settings": settings})
