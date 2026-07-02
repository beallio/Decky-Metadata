import asyncio
import logging

import main


def make_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


def test_frontend_log_returns_true_and_logs_fields(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    calls = []
    monkeypatch.setattr(main, "_plog", lambda area, message, **fields: calls.append((area, message, fields)))

    result = asyncio.run(plugin.frontend_log("nav", "x", {"a": 1}))

    assert result is True
    assert calls == [("nav", "x", {"a": 1, "level": logging.DEBUG})]


def test_frontend_log_is_safe_with_missing_or_invalid_fields(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)

    assert asyncio.run(plugin.frontend_log("nav", "x", None)) is True
    assert asyncio.run(plugin.frontend_log("nav", "x", "not-a-dict")) is True
