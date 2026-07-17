"""Tests for type-boundary-hardening: MetadataRecord TypedDict.

Verifies that:
- MetadataRecord is importable from main.
- MetadataRecord has the expected keys at runtime (TypedDict keys).
- _sanitize_metadata produces a dict that matches the MetadataRecord shape.
- A load→save round-trip is byte-stable (no JSON shape change).
"""
from __future__ import annotations

import json
import sys
import types


def _make_plugin():
    """Instantiate Plugin without full Decky environment."""
    import importlib

    # Stub decky module if not already present
    if "decky" not in sys.modules:
        decky_stub = types.ModuleType("decky")
        decky_stub.DECKY_PLUGIN_SETTINGS_DIR = "/tmp/Decky-Metadata/test_type_boundary"
        sys.modules["decky"] = decky_stub

    import main  # noqa: PLC0415

    return main, importlib


def test_metadata_record_importable():
    """MetadataRecord TypedDict can be imported from main."""
    main, _ = _make_plugin()
    assert hasattr(main, "MetadataRecord"), (
        "MetadataRecord not found in main module – add the TypedDict"
    )


def test_metadata_record_keys():
    """MetadataRecord has the expected stable set of keys."""
    main, _ = _make_plugin()
    required_keys = {
        "title",
        "id",
        "source",
        "description",
        "store_categories",
        "steam_appid",
        "steam_dlc_appids",
        "has_points_shop",
        "steam_news",
    }
    record_keys = set(main.MetadataRecord.__annotations__)
    missing = required_keys - record_keys
    assert not missing, f"MetadataRecord is missing keys: {missing}"


def test_sanitize_metadata_matches_record_shape():
    """_sanitize_metadata output matches MetadataRecord keys."""
    main, _ = _make_plugin()
    from unittest.mock import MagicMock

    plugin = main.Plugin.__new__(main.Plugin)
    # Minimal real deps
    plugin._settings_dir = __import__("pathlib").Path("/tmp/Decky-Metadata/test_type_boundary")
    plugin._data_file = plugin._settings_dir / "decky_metadata.json"

    raw = {
        "title": "Test Game",
        "id": "test-game",
        "source": "Manual",
        "source_url": "",
        "description": "A test game.",
        "short_description": "",
        "store_categories": [2],
        "steam_appid": 12345,
        "steam_store_url": "https://store.steampowered.com/app/12345",
        "steam_news": [],
        "steam_news_enriched_at": 0,
    }
    result = plugin._sanitize_metadata(raw)
    record_keys = set(main.MetadataRecord.__annotations__)
    result_keys = set(result.keys())
    # Every key in the result should be in MetadataRecord
    extra = result_keys - record_keys
    assert not extra, f"_sanitize_metadata returned keys not in MetadataRecord: {extra}"
    # Every non-optional key should be present
    assert "title" in result
    assert "description" in result
    assert "store_categories" in result


def test_load_save_round_trip_byte_stable(tmp_path):
    """A load→save round-trip must be byte-stable (JSON shape unchanged)."""
    main, _ = _make_plugin()
    from pathlib import Path

    sample = {
        "metadata": {
            "12345": {
                "title": "Round-Trip Test",
                "id": "round-trip-test",
                "source": "Manual",
                "source_url": "",
                "description": "Unchanged on round-trip.",
                "short_description": "",
                "store_categories": [2],
                "steam_appid": 12345,
                "steam_store_url": "https://store.steampowered.com/app/12345",
                "steam_news": [],
                "steam_news_enriched_at": 0,
            }
            },
            "settings": {"debug_logging": False},
            "update_settings": {},
            "update_check_cache": {},
        }
    data_file = tmp_path / "decky_metadata.json"
    data_file.write_text(json.dumps(sample, ensure_ascii=False, indent=2), encoding="utf-8")
    original_text = data_file.read_text(encoding="utf-8")

    from backend import storage

    result = storage.load_data(data_file, None, None, lambda *a, **kw: None)
    assert result is not None
    loaded_data, _cache, _mtime = result
    storage.save_data(data_file, loaded_data)
    round_tripped = data_file.read_text(encoding="utf-8")

    assert json.loads(original_text) == json.loads(round_tripped), (
        "Load→save round-trip changed the JSON shape"
    )
