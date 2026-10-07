from __future__ import annotations

import asyncio
import copy
import json
import os
import subprocess
import sys

import pytest

import main
from backend import storage
from backend.providers import ign


def test_migration_preserves_raw_fields_and_does_not_repeat_in_another_zone(tmp_path):
    data_file = tmp_path / "decky_metadata.json"
    original = {
        "metadata": {
            "utc": {"release_date": 1710028800, "description": "Retained prose", "steam_appid": 42, "updated_at": 123, "unknown": {"keep": True}},
            "local": {"release_date": "1710057600"},
            "canonical": {"release_date": "2024-02-29"},
            "null": {"release_date": None},
            "zero": {"release_date": 0},
            "invalid": {"release_date": "soon"},
            "bool": {"release_date": True},
            "infinite": {"release_date": "99999999999999999999999999999999999"},
            "missing": {"title": "No date"},
        },
        "settings": {"debug_logging": False, "unknown": [1, 2]},
        "shortcut_names": {"utc": {"original_name": "Exact name"}},
        "update_settings": {"channel": "development"},
        "update_check_cache": {"checked_at": 123},
        "unknown_root": {"token": "keep"},
    }
    data_file.write_text(json.dumps(original), encoding="utf-8")
    script = "from pathlib import Path; from backend import storage; import sys; storage.load_data(Path(sys.argv[1]), None, None, lambda *a, **k: None)"
    def load_in(zone):
        subprocess.run([sys.executable, "-c", script, str(data_file)], env={**os.environ, "TZ": zone}, check=True, capture_output=True, text=True)
    load_in("America/Los_Angeles")
    migrated_bytes = data_file.read_bytes()
    migrated = json.loads(migrated_bytes)
    expected = copy.deepcopy(original)
    for key, value in {"utc": "2024-03-09", "local": "2024-03-10", "null": None, "zero": None, "invalid": None, "bool": None, "infinite": None}.items():
        expected["metadata"][key]["release_date"] = value
    expected["release_date_format"] = "date-only-v1"
    assert migrated == expected
    for zone in ("Asia/Tokyo", "UTC", "Pacific/Kiritimati"):
        load_in(zone)
        assert data_file.read_bytes() == migrated_bytes


def test_failed_atomic_migration_cannot_publish_dates_through_rpc(tmp_path, monkeypatch):
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    plugin = main.Plugin()
    original = b'{"metadata":{"1":{"release_date":1710057600}},"settings":{},"unknown":"keep"}'
    plugin._data_file.write_bytes(original)
    before_data = copy.deepcopy(plugin._data)
    before_cache = plugin._data_cache
    real_replace = storage.os.replace
    def fail_replace(*args):
        raise OSError("migration replacement denied")
    monkeypatch.setattr(storage.os, "replace", fail_replace)
    with pytest.raises(OSError, match="migration replacement denied"):
        asyncio.run(plugin.get_all_metadata())
    assert plugin._data_file.read_bytes() == original
    assert plugin._data == before_data
    assert plugin._data_cache is before_cache
    assert plugin._data_cache_mtime_ns is None
    monkeypatch.setattr(storage.os, "replace", real_replace)
    result = asyncio.run(plugin.get_all_metadata())
    assert isinstance(result["1"]["release_date"], str)
    assert plugin._data_cache["release_date_format"] == "date-only-v1"
    assert plugin._data_cache_mtime_ns == plugin._data_file.stat().st_mtime_ns
    plugin._data["settings"]["debug_logging"] = True
    plugin._save_data()
    persisted = json.loads(plugin._data_file.read_text())
    assert persisted["unknown"] == "keep"
    assert persisted["release_date_format"] == "date-only-v1"
    assert persisted["metadata"] == result


def test_marked_external_date_change_is_reloaded_without_conversion(tmp_path):
    path = tmp_path / "dates.json"
    payload = {"release_date_format": "date-only-v1", "metadata": {"1": {"release_date": "2024-03-10"}}}
    storage.save_data(path, payload)
    loaded, cache, mtime = storage.load_data(path, None, None, lambda *a, **k: None)
    payload["metadata"]["1"]["release_date"] = "2024-11-03"
    storage.save_data(path, payload)
    os.utime(path, ns=(mtime + 1_000_000_000, mtime + 1_000_000_000))
    refreshed, _, _ = storage.load_data(path, cache, mtime, lambda *a, **k: None)
    assert loaded["metadata"]["1"]["release_date"] == "2024-03-10"
    assert refreshed["metadata"]["1"]["release_date"] == "2024-11-03"


@pytest.mark.parametrize("value", [1710057600, "1710057600", "Mar 10, 2024", "2024-03-10T00:00:00Z", "2024-02-30", True])
def test_normal_metadata_saves_do_not_accept_legacy_or_provider_date_formats(value):
    with pytest.raises(ValueError, match="release_date must be"):
        main.Plugin()._sanitize_metadata({"release_date": value})


def test_normal_metadata_saves_preserve_canonical_null_and_omission():
    plugin = main.Plugin()
    assert plugin._sanitize_metadata({"release_date": "2024-03-10"})["release_date"] == "2024-03-10"
    assert plugin._sanitize_metadata({"release_date": None})["release_date"] is None
    assert "release_date" not in plugin._sanitize_metadata({"title": "No date"})


def test_ign_keeps_earliest_usable_supplied_day_without_shifting_iso_instants():
    regions = [{"releases": [{"date": "unknown"}, {"date": "2024-03-11T00:00:00+14:00"}]}, {"releases": [{"date": "2024-03-10T23:00:00-12:00"}, {"date": "2024-02-30"}]}]
    assert ign.first_release_date(regions) == "2024-03-10"
    assert ign.first_release_date([{"releases": [{"date": "2024"}, {"date": "TBA"}]}]) is None
