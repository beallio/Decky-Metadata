from __future__ import annotations

import os
from pathlib import Path

import main


def make_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


def write_data_file(plugin: main.Plugin, metadata_title: str) -> None:
    plugin._settings_dir.mkdir(parents=True, exist_ok=True)
    plugin._data_file.write_text(
        (
            '{"metadata":{"101":{"title":"%s"}}'
            ',"settings":{"debug_logging":true}}'
        )
        % metadata_title,
        encoding="utf-8",
    )


def test_load_data_reuses_cache_when_file_mtime_is_unchanged(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    write_data_file(plugin, "Cached")
    original_read_text = Path.read_text
    read_count = 0

    def counting_read_text(self: Path, *args, **kwargs):
        nonlocal read_count
        if self == plugin._data_file:
            read_count += 1
        return original_read_text(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", counting_read_text)

    plugin._load_data()
    plugin._load_data()

    assert read_count == 1
    assert plugin._data["metadata"]["101"]["title"] == "Cached"
    assert plugin._data["settings"]["debug_logging"] is True


def test_load_data_reloads_after_external_mtime_bump(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    write_data_file(plugin, "Before")
    plugin._load_data()

    write_data_file(plugin, "After")
    stat = plugin._data_file.stat()
    os.utime(plugin._data_file, ns=(stat.st_atime_ns + 1_000_000_000, stat.st_mtime_ns + 1_000_000_000))

    plugin._load_data()

    assert plugin._data["metadata"]["101"]["title"] == "After"


def test_save_data_refreshes_load_data_cache(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    write_data_file(plugin, "Before")
    plugin._load_data()

    plugin._data["metadata"]["101"]["title"] = "Saved"
    plugin._save_data()
    plugin._data = plugin._default_data()

    plugin._load_data()

    assert plugin._data["metadata"]["101"]["title"] == "Saved"
