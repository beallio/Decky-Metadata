from __future__ import annotations

import asyncio
import json

import pytest

import main
from backend import storage


DEFAULTS = {"enabled": False, "audioEnabled": False, "quality": "auto"}


def make_plugin(tmp_path, monkeypatch) -> main.Plugin:
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


def test_legacy_settings_load_trailer_defaults_without_rewriting_other_data(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._settings_dir.mkdir(parents=True, exist_ok=True)
    original = json.dumps({
        "settings": {"debug_logging": True},
        "metadata": {"123": {"title": "Keep", "steam_store_state": "unknown"}},
    })
    plugin._data_file.write_text(original, encoding="utf-8")

    assert asyncio.run(plugin.get_trailer_settings()) == DEFAULTS
    assert plugin._data["settings"]["debug_logging"] is True
    assert plugin._data_file.read_text(encoding="utf-8") == original
    assert plugin._data["metadata"]["123"]["title"] == "Keep"


@pytest.mark.parametrize(
    ("saved", "expected"),
    [
        ({"enabled": True, "audioEnabled": True, "quality": 1080},
         {"enabled": True, "audioEnabled": True, "quality": 1080}),
        ({"enabled": "true", "audioEnabled": False, "quality": "1080"}, DEFAULTS),
        ({"enabled": True, "audioEnabled": 1, "quality": 2160},
         {"enabled": True, "audioEnabled": False, "quality": 2160}),
        ({"enabled": False, "audioEnabled": True, "quality": 720.0},
         {"enabled": False, "audioEnabled": True, "quality": "auto"}),
        (None, DEFAULTS),
    ],
)
def test_saved_fields_are_normalized_independently(saved, expected) -> None:
    assert storage.normalize_trailer_settings(saved) == expected


def test_trailer_settings_round_trip_and_invalid_write_does_not_mutate(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    value = {"enabled": True, "audioEnabled": False, "quality": 1440}

    assert asyncio.run(plugin.set_trailer_settings(value)) == value
    with pytest.raises(ValueError, match="invalid trailer settings"):
        asyncio.run(plugin.set_trailer_settings({**value, "quality": "1440"}))
    assert asyncio.run(plugin.get_trailer_settings()) == value
    persisted = json.loads(plugin._data_file.read_text(encoding="utf-8"))
    assert persisted["settings"]["game_trailers"] == value


def test_failed_trailer_settings_save_restores_previous_value(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    previous = {"enabled": True, "audioEnabled": True, "quality": 720}
    asyncio.run(plugin.set_trailer_settings(previous))
    original_save = plugin._save_data

    def fail_save() -> None:
        raise OSError("simulated write failure")

    monkeypatch.setattr(plugin, "_save_data", fail_save)
    with pytest.raises(OSError, match="simulated write failure"):
        asyncio.run(plugin.set_trailer_settings(DEFAULTS))
    monkeypatch.setattr(plugin, "_save_data", original_save)

    assert plugin._data["settings"]["game_trailers"] == previous
