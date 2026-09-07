from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

import main
from backend import storage


APP_ID = 2312439508
RAW_APP_ID = APP_ID - (1 << 32)


def make_plugin(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> main.Plugin:
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    plugin = main.Plugin()
    plugin._read_steam_shortcuts = lambda: [  # type: ignore[method-assign]
        {
            "appid": APP_ID,
            "app_id": APP_ID,
            "appid_raw": RAW_APP_ID,
            "name": "Fixture",
            "exe": "/sensitive/path",
            "shortcut_file": "/sensitive/shortcuts.vdf",
            "steam_user_id": "sensitive-user",
        }
    ]
    return plugin


def metadata(steam_appid: int = 15100, steam_store_name: str = "Steam Name") -> dict[str, object]:
    return {"steam_appid": steam_appid, "steam_store_name": steam_store_name}


def test_legacy_settings_load_adds_an_empty_shortcut_name_map(tmp_path: Path) -> None:
    data_file = tmp_path / "decky_metadata.json"
    data_file.write_text(
        json.dumps({"metadata": {"1": {"title": "Old"}}, "settings": {"debug_logging": True}}),
        encoding="utf-8",
    )

    loaded = storage.load_data(data_file, None, None, lambda *_args, **_kwargs: None)

    assert loaded is not None
    assert loaded[0]["metadata"] == {"1": {"title": "Old"}}
    assert loaded[0]["settings"]["debug_logging"] is True
    assert loaded[0]["shortcut_names"] == {}


def test_invalid_loaded_shortcut_name_map_is_ignored_without_losing_metadata(tmp_path: Path) -> None:
    data_file = tmp_path / "decky_metadata.json"
    data_file.write_text(
        json.dumps({"metadata": {"1": {"title": "Old"}}, "shortcut_names": ["bad"]}),
        encoding="utf-8",
    )

    loaded = storage.load_data(data_file, None, None, lambda *_args, **_kwargs: None)

    assert loaded is not None
    assert loaded[0]["metadata"] == {"1": {"title": "Old"}}
    assert loaded[0]["shortcut_names"] == {}


def test_management_uses_explicit_unsigned_vdf_id_and_hides_sensitive_fields(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)

    management = asyncio.run(plugin.get_shortcut_name_management(APP_ID))

    assert management == {"eligible": True, "reason": "ready", "state": None}
    assert "shortcut_file" not in management
    assert "steam_user_id" not in management
    assert "exe" not in management


@pytest.mark.parametrize(
    ("shortcuts", "reason"),
    [([], "shortcut_not_found"), ([{"appid": APP_ID, "appid_raw": None}], "derived_shortcut_id")],
)
def test_management_rejects_missing_or_derived_shortcuts(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, shortcuts: list[dict[str, object]], reason: str
) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._read_steam_shortcuts = lambda: shortcuts  # type: ignore[method-assign]

    assert asyncio.run(plugin.get_shortcut_name_management(APP_ID)) == {
        "eligible": False,
        "reason": reason,
        "state": None,
    }


def test_state_is_atomic_preserves_original_and_survives_metadata_removal(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._data["metadata"][str(APP_ID)] = metadata()

    first = asyncio.run(plugin.save_shortcut_name_state(APP_ID, "Original™", "Steam Name", 15100))
    assert first["original_name"] == "Original™"
    asyncio.run(plugin.save_metadata(APP_ID, metadata(15200, "New Steam Name")))
    second = asyncio.run(plugin.save_shortcut_name_state(APP_ID, "Wrong replacement", "New Steam Name", 15200))
    assert second["original_name"] == "Original™"
    assert second["applied_name"] == "New Steam Name"
    assert second["steam_appid"] == 15200

    asyncio.run(plugin.remove_metadata(APP_ID))
    asyncio.run(plugin.clear_metadata_cache())
    assert plugin._data["shortcut_names"][str(APP_ID)]["original_name"] == "Original™"

    plugin._data = plugin._default_data()
    assert plugin._load_data()
    assert plugin._data["shortcut_names"][str(APP_ID)]["applied_name"] == "New Steam Name"
    assert asyncio.run(plugin.clear_shortcut_name_state(APP_ID)) == {"ok": True}
    assert asyncio.run(plugin.clear_shortcut_name_state(APP_ID)) == {"ok": True}


@pytest.mark.parametrize(
    ("original", "applied", "steam_appid"),
    [
        ("", "Steam Name", 15100),
        ("Original", "", 15100),
        ("Original", "bad\x00name", 15100),
        ("Original", "x" * 513, 15100),
        ("Original", "Steam Name", 0),
    ],
)
def test_state_rejects_invalid_or_mismatched_requests_without_mutation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    original: str,
    applied: str,
    steam_appid: int,
) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._data["metadata"][str(APP_ID)] = metadata()

    with pytest.raises(ValueError):
        asyncio.run(plugin.save_shortcut_name_state(APP_ID, original, applied, steam_appid))
    assert plugin._data["shortcut_names"] == {}


def test_state_rejects_metadata_mismatch_without_mutation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._data["metadata"][str(APP_ID)] = metadata(15100, "Different name")

    with pytest.raises(ValueError):
        asyncio.run(plugin.save_shortcut_name_state(APP_ID, "Original", "Steam Name", 15100))
    assert plugin._data["shortcut_names"] == {}
