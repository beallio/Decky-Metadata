from __future__ import annotations

import asyncio
import logging

import main
from tests._plugin import make_plugin


class BrokenRepr:
    def __repr__(self) -> str:
        raise RuntimeError("repr failed")


def test_redact_masks_api_and_authorization_secrets() -> None:
    text = (
        "https://example.invalid/API?z=user&y=api-secret "
        "X-Authorization: x-secret Authorization: Bearer bearer-secret "
        "apikey=query-secret"
    )

    redacted = main._redact(text)

    assert "api-secret" not in redacted
    assert "x-secret" not in redacted
    assert "bearer-secret" not in redacted
    assert "query-secret" not in redacted
    assert "y=***" in redacted
    assert "Authorization: ***" in redacted


def test_plog_never_raises_and_respects_logger_level(caplog) -> None:
    logger = main.decky.logger
    original_level = logger.level
    caplog.set_level(logging.DEBUG, logger=logger.name)
    logger.setLevel(logging.INFO)
    try:
        main._plog("load", "hidden debug", level=logging.DEBUG)
        main._plog("load", "visible info", level=logging.INFO)
        main._plog("load", "broken field", bad=BrokenRepr())
    finally:
        logger.setLevel(original_level)

    messages = [record.getMessage() for record in caplog.records]
    assert not any("hidden debug" in message for message in messages)
    assert any("[decky:load] visible info" in message for message in messages)


def test_set_debug_logging_flips_decky_logger_level() -> None:
    saved = []
    plugin = make_plugin(_data={"settings": {}}, _load_data=lambda: None)
    plugin._save_data = lambda: saved.append(plugin._data.copy())  # type: ignore[method-assign]

    assert asyncio.run(plugin.set_debug_logging(True)) is True
    assert main.decky.logger.level == logging.DEBUG
    assert plugin._data["settings"]["debug_logging"] is True

    assert asyncio.run(plugin.set_debug_logging(False)) is False
    assert main.decky.logger.level == logging.INFO
    assert plugin._data["settings"]["debug_logging"] is False
    assert len(saved) == 2


def test_plog_exc_respects_caller_level(caplog) -> None:
    logger = main.decky.logger
    caplog.set_level(logging.DEBUG, logger=logger.name)

    try:
        raise ValueError("boom-warning")
    except ValueError:
        main._plog("steam", "deck compat fetch failed", level=logging.WARNING, exc=True)

    try:
        raise ValueError("boom-error")
    except ValueError:
        main._plog("load", "backend startup failed", level=logging.ERROR, exc=True)

    warning_records = [r for r in caplog.records if "deck compat fetch failed" in r.getMessage()]
    assert len(warning_records) == 1
    assert warning_records[0].levelno == logging.WARNING
    assert warning_records[0].exc_info is not None  # traceback still attached

    error_records = [r for r in caplog.records if "backend startup failed" in r.getMessage()]
    assert len(error_records) == 1
    assert error_records[0].levelno == logging.ERROR
    assert error_records[0].exc_info is not None
