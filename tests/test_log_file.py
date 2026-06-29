from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler

import main


def _reset_file_logging() -> None:
    handler = getattr(main, "_LOG_FILE_HANDLER", None)
    if handler is not None:
        main.decky.logger.removeHandler(handler)
        handler.close()
        main._LOG_FILE_HANDLER = None
    for existing in list(main.decky.logger.handlers):
        if isinstance(existing, RotatingFileHandler):
            main.decky.logger.removeHandler(existing)
            existing.close()


def _rotating_handlers() -> list[RotatingFileHandler]:
    return [
        handler
        for handler in main.decky.logger.handlers
        if isinstance(handler, RotatingFileHandler)
    ]


def test_install_file_logging_writes_to_decky_log_dir(tmp_path, monkeypatch) -> None:
    _reset_file_logging()
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_LOG_DIR", str(tmp_path), raising=False)
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_RUNTIME_DIR", None, raising=False)
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", None, raising=False)
    original_level = main.decky.logger.level
    main.decky.logger.setLevel(logging.DEBUG)
    try:
        log_path = main._install_file_logging()
        main.decky.logger.info("file logging smoke")
        for handler in _rotating_handlers():
            handler.flush()
    finally:
        main.decky.logger.setLevel(original_level)
        _reset_file_logging()

    assert log_path == str(tmp_path / "playhub-metadata.log")
    assert (tmp_path / "playhub-metadata.log").read_text(encoding="utf-8").find(
        "file logging smoke"
    ) >= 0


def test_install_file_logging_is_idempotent(tmp_path, monkeypatch) -> None:
    _reset_file_logging()
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_LOG_DIR", str(tmp_path), raising=False)
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_RUNTIME_DIR", None, raising=False)
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", None, raising=False)
    try:
        first_path = main._install_file_logging()
        first_count = len(_rotating_handlers())
        second_path = main._install_file_logging()
        second_count = len(_rotating_handlers())
    finally:
        _reset_file_logging()

    assert first_path == str(tmp_path / "playhub-metadata.log")
    assert second_path == first_path
    assert first_count == 1
    assert second_count == 1


def test_install_file_logging_returns_empty_without_log_dir(monkeypatch) -> None:
    _reset_file_logging()
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_LOG_DIR", None, raising=False)
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_RUNTIME_DIR", None, raising=False)
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", None, raising=False)
    try:
        assert main._install_file_logging() == ""
        assert _rotating_handlers() == []
    finally:
        _reset_file_logging()


def test_install_file_logging_returns_empty_when_directory_unusable(tmp_path, monkeypatch) -> None:
    _reset_file_logging()
    blocked_path = tmp_path / "not-a-directory"
    blocked_path.write_text("occupied", encoding="utf-8")
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_LOG_DIR", str(blocked_path), raising=False)
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_RUNTIME_DIR", None, raising=False)
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", None, raising=False)
    try:
        assert main._install_file_logging() == ""
        assert _rotating_handlers() == []
    finally:
        _reset_file_logging()
