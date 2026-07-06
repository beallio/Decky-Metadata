from __future__ import annotations

import json

import pytest

from backend import storage


def test_save_data_round_trip(tmp_path):
    data_file = tmp_path / "decky_metadata.json"
    data = {"metadata": {"101": {"title": "Foo"}}, "settings": {"debug_logging": True}}

    returned, mtime_ns = storage.save_data(data_file, data)

    assert json.loads(data_file.read_text(encoding="utf-8")) == data
    assert returned == data
    assert returned is not data
    assert mtime_ns == data_file.stat().st_mtime_ns


def test_save_data_leaves_no_temp_file(tmp_path):
    data_file = tmp_path / "decky_metadata.json"
    data = {"metadata": {}, "settings": {"debug_logging": False}}

    storage.save_data(data_file, data)

    assert list(data_file.parent.glob("*.tmp")) == []


def test_save_data_does_not_truncate_file_on_replace_failure(tmp_path, monkeypatch):
    data_file = tmp_path / "decky_metadata.json"
    known_content = '{"metadata": {"1": {"title": "Known"}}, "settings": {"debug_logging": false}}'
    data_file.write_text(known_content, encoding="utf-8")

    def failing_replace(*args, **kwargs):
        raise OSError("simulated replace failure")

    monkeypatch.setattr("backend.storage.os.replace", failing_replace)

    with pytest.raises(OSError):
        storage.save_data(data_file, {"metadata": {"2": {"title": "New"}}, "settings": {}})

    assert json.loads(data_file.read_text(encoding="utf-8")) == json.loads(known_content)
