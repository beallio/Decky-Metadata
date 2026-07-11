import asyncio
import logging

import pytest

import main


def make_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


@pytest.mark.parametrize(
    ("level", "expected"),
    [
        ("debug", logging.DEBUG),
        ("info", logging.INFO),
        ("warning", logging.WARNING),
        ("error", logging.ERROR),
    ],
)
def test_frontend_log_forwards_named_level(tmp_path, monkeypatch, level, expected):
    plugin = make_plugin(tmp_path, monkeypatch)
    calls = []
    monkeypatch.setattr(main, "_plog", lambda area, message, **fields: calls.append(fields))

    result = asyncio.run(plugin.frontend_log("nav", "message", {"key": "value"}, level))

    assert result is True
    assert calls == [{"key": "value", "level": expected}]


def test_frontend_log_defaults_to_debug(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    calls = []
    monkeypatch.setattr(main, "_plog", lambda area, message, **fields: calls.append(fields))

    result = asyncio.run(plugin.frontend_log("nav", "message", {"key": "value"}))

    assert result is True
    assert calls == [{"key": "value", "level": logging.DEBUG}]


@pytest.mark.parametrize(
    ("level", "expected"),
    [(" INFO ", logging.INFO), ("warn", logging.WARNING)],
)
def test_frontend_log_normalizes_level(tmp_path, monkeypatch, level, expected):
    plugin = make_plugin(tmp_path, monkeypatch)
    calls = []
    monkeypatch.setattr(main, "_plog", lambda area, message, **fields: calls.append(fields))

    result = asyncio.run(plugin.frontend_log("nav", "message", None, level))

    assert result is True
    assert calls == [{"level": expected}]


@pytest.mark.parametrize("level", ["bogus", "", None, object()])
def test_frontend_log_unknown_level_falls_back_to_debug(tmp_path, monkeypatch, level):
    plugin = make_plugin(tmp_path, monkeypatch)
    calls = []
    monkeypatch.setattr(main, "_plog", lambda area, message, **fields: calls.append(fields))

    result = asyncio.run(plugin.frontend_log("nav", "message", None, level))

    assert result is True
    assert calls == [{"level": logging.DEBUG}]


def test_frontend_log_info_visible_when_debug_logging_is_off(tmp_path, monkeypatch, caplog):
    plugin = make_plugin(tmp_path, monkeypatch)
    logger = main.decky.logger
    original_level = logger.level
    caplog.set_level(logging.DEBUG, logger=logger.name)
    logger.setLevel(logging.INFO)
    try:
        assert asyncio.run(plugin.frontend_log("ui", "visible info", None, "info")) is True
        assert asyncio.run(plugin.frontend_log("ui", "hidden debug")) is True
    finally:
        logger.setLevel(original_level)

    records = [record for record in caplog.records if "[decky:ui]" in record.getMessage()]
    assert any(record.levelno == logging.INFO and "visible info" in record.getMessage() for record in records)
    assert not any("hidden debug" in record.getMessage() for record in records)
