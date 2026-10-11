from __future__ import annotations

import asyncio
import json

import pytest

import main
from backend import storage


DEFAULTS = {
    "enabled": False,
    "detailEnabled": True,
    "homeEnabled": False,
    "audioEnabled": False,
    "quality": "auto",
    "hideLogoDuringTrailer": False,
    "detailFadeInDelaySeconds": 3,
    "homeFadeInDelaySeconds": 3,
}

def make_plugin(tmp_path, monkeypatch) -> main.Plugin:
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


def test_legacy_trailer_settings_default_without_rewriting_saved_bytes(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._settings_dir.mkdir(parents=True, exist_ok=True)
    legacy_value = {"enabled": True, "audioEnabled": True, "quality": 1080, "fadeInDelaySeconds": 7}
    payload = {
        "release_date_format": "date-only-v1",
        "settings": {"debug_logging": True, "game_trailers": legacy_value},
        "metadata": {"123": {"title": "Keep", "steam_store_state": "unknown"}},
        "update_settings": {"preserve": [1, 2, 3]},
    }
    original = json.dumps(payload, separators=(",", ":"))
    plugin._data_file.write_text(original, encoding="utf-8")

    expected = {**DEFAULTS, "enabled": True, "audioEnabled": True, "quality": 1080, "detailFadeInDelaySeconds": 7}
    assert asyncio.run(plugin.get_trailer_settings()) == expected
    assert plugin._data_file.read_text(encoding="utf-8") == original
    assert plugin._data["settings"]["debug_logging"] is True
    assert plugin._data["metadata"]["123"]["title"] == "Keep"

    saved = {**expected, "hideLogoDuringTrailer": True, "detailFadeInDelaySeconds": 0, "homeEnabled": True}
    assert asyncio.run(plugin.set_trailer_settings(saved)) == saved
    persisted = json.loads(plugin._data_file.read_text(encoding="utf-8"))
    assert persisted["settings"]["game_trailers"] == saved
    assert persisted["update_settings"] == payload["update_settings"]


@pytest.mark.parametrize(
    ("saved", "expected"),
    [
        (
            {"enabled": True, "audioEnabled": True, "quality": 1080, "hideLogoDuringTrailer": True, "fadeInDelaySeconds": 10},
            {**DEFAULTS, "enabled": True, "audioEnabled": True, "quality": 1080, "hideLogoDuringTrailer": True, "detailFadeInDelaySeconds": 10},
        ),
        (
            {"enabled": "true", "audioEnabled": False, "quality": "1080", "hideLogoDuringTrailer": "true"},
            DEFAULTS,
        ),
        (
            {"enabled": True, "audioEnabled": 1, "quality": 2160, "hideLogoDuringTrailer": 1},
            {**DEFAULTS, "enabled": True, "quality": 2160},
        ),
        (
            {"enabled": False, "audioEnabled": True, "quality": 720.0, "hideLogoDuringTrailer": False},
            {**DEFAULTS, "audioEnabled": True},
        ),
        (None, DEFAULTS),
    ],
)
def test_saved_fields_are_normalized_independently(saved, expected) -> None:
    assert storage.normalize_trailer_settings(saved) == expected


def test_trailer_settings_round_trip(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    value = {
        **DEFAULTS,
        "enabled": False,
        "detailEnabled": False,
        "homeEnabled": True,
        "quality": 1440,
        "hideLogoDuringTrailer": True,
        "detailFadeInDelaySeconds": 7,
        "homeFadeInDelaySeconds": 0,
    }

    assert asyncio.run(plugin.set_trailer_settings(value)) == value
    assert asyncio.run(plugin.get_trailer_settings()) == value
    persisted = json.loads(plugin._data_file.read_text(encoding="utf-8"))
    assert persisted["settings"]["game_trailers"] == value
    reloaded = make_plugin(tmp_path, monkeypatch)
    assert asyncio.run(reloaded.get_trailer_settings()) == value


@pytest.mark.parametrize(
    "invalid",
    [
        *[
            {**DEFAULTS, key: invalid}
            for key in ("detailFadeInDelaySeconds", "homeFadeInDelaySeconds")
            for invalid in (-1, 11, 2.5, True)
        ],
        *[
            {**DEFAULTS, key: invalid}
            for key in ("enabled", "detailEnabled", "homeEnabled", "audioEnabled", "hideLogoDuringTrailer")
            for invalid in ("true", 1)
        ],
        *[{key: value for key, value in DEFAULTS.items() if key != omitted} for omitted in DEFAULTS],
        {**DEFAULTS, "fadeInDelaySeconds": 3},
        {**DEFAULTS, "unexpected": True},
    ],
)
def test_invalid_trailer_settings_write_does_not_mutate_saved_value(tmp_path, monkeypatch, invalid) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    previous = {**DEFAULTS, "enabled": True, "homeEnabled": True, "audioEnabled": True, "quality": 720}
    asyncio.run(plugin.set_trailer_settings(previous))
    original_bytes = plugin._data_file.read_bytes()

    with pytest.raises(ValueError, match="invalid trailer settings"):
        asyncio.run(plugin.set_trailer_settings(invalid))

    assert asyncio.run(plugin.get_trailer_settings()) == previous
    assert plugin._data_file.read_bytes() == original_bytes


def test_failed_trailer_settings_save_restores_previous_value(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    previous = {**DEFAULTS, "enabled": True, "detailEnabled": False, "homeEnabled": True, "quality": 720}
    asyncio.run(plugin.set_trailer_settings(previous))
    original_save = plugin._save_data

    def fail_save() -> None:
        raise OSError("simulated write failure")

    monkeypatch.setattr(plugin, "_save_data", fail_save)
    with pytest.raises(OSError, match="simulated write failure"):
        asyncio.run(plugin.set_trailer_settings(DEFAULTS))
    monkeypatch.setattr(plugin, "_save_data", original_save)

    assert plugin._data["settings"]["game_trailers"] == previous


@pytest.mark.parametrize(
    ("saved", "detail_delay", "home_delay"),
    [
        ({"fadeInDelaySeconds": 0}, 0, 3),
        ({"fadeInDelaySeconds": 10}, 10, 3),
        ({"fadeInDelaySeconds": True}, 3, 3),
        ({"fadeInDelaySeconds": 9, "detailFadeInDelaySeconds": 1, "homeFadeInDelaySeconds": 8}, 1, 8),
        ({"fadeInDelaySeconds": 9, "detailFadeInDelaySeconds": False, "homeFadeInDelaySeconds": 0}, 3, 0),
    ],
)
def test_delay_migration_preserves_explicit_view_preferences(saved, detail_delay, home_delay) -> None:
    settings = storage.normalize_trailer_settings(
        {**saved, "enabled": False, "detailEnabled": False, "homeEnabled": True}
    )
    assert settings["enabled"] is False
    assert settings["detailEnabled"] is False
    assert settings["homeEnabled"] is True
    assert settings["detailFadeInDelaySeconds"] == detail_delay
    assert settings["homeFadeInDelaySeconds"] == home_delay
    assert "fadeInDelaySeconds" not in settings
