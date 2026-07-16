from __future__ import annotations

import asyncio
import io
import os
from pathlib import Path

import main
from tests._plugin import make_plugin


def test_read_bounded_log_tail_returns_empty_for_missing_file(tmp_path) -> None:
    assert main._read_bounded_log_tail(tmp_path / "missing.log", max_bytes=32) == ""


def test_read_bounded_log_tail_returns_normal_short_file(tmp_path) -> None:
    log_path = tmp_path / "plugin.log"
    log_path.write_bytes(b"first\nsecond\n")

    assert main._read_bounded_log_tail(log_path, max_bytes=64) == "first\nsecond\n"


def test_read_bounded_log_tail_discards_initial_partial_line(tmp_path) -> None:
    log_path = tmp_path / "plugin.log"
    log_path.write_bytes(b"discard-this-partial-line\nkeep-one\nkeep-two\n")

    assert main._read_bounded_log_tail(log_path, max_bytes=24) == "keep-one\nkeep-two\n"


def test_read_bounded_log_tail_never_exceeds_cap(tmp_path) -> None:
    log_path = tmp_path / "plugin.log"
    log_path.write_bytes(b"header\n" + (b"x" * 40) + b"\nlast\n")

    result = main._read_bounded_log_tail(log_path, max_bytes=16)

    assert len(result.encode("utf-8")) <= 16
    assert result.endswith("last\n")


def test_read_bounded_log_tail_keeps_cap_sized_partial_line_without_newline(tmp_path) -> None:
    log_path = tmp_path / "plugin.log"
    log_path.write_bytes(b"x" * 64)

    assert main._read_bounded_log_tail(log_path, max_bytes=16) == "x" * 16


def test_read_bounded_log_tail_replaces_invalid_utf8(tmp_path) -> None:
    log_path = tmp_path / "plugin.log"
    log_path.write_bytes(b"valid\xfftail\n")

    assert main._read_bounded_log_tail(log_path, max_bytes=64) == "valid\ufffdtail\n"


class _TruncatedLog(io.BytesIO):
    def seek(self, offset: int, whence: int = os.SEEK_SET) -> int:
        if whence == os.SEEK_END:
            super().seek(0, os.SEEK_END)
            return 256
        if whence == os.SEEK_SET and offset > 0:
            super().seek(0, os.SEEK_END)
            return self.tell()
        return super().seek(offset, whence)

    def tell(self) -> int:
        position = super().tell()
        return 256 if position else position

    def __enter__(self) -> "_TruncatedLog":
        return self

    def __exit__(self, *args: object) -> None:
        self.close()


def test_read_bounded_log_tail_tolerates_rotation_or_truncation(monkeypatch) -> None:
    def open_truncated(_path: Path, _mode: str) -> _TruncatedLog:
        return _TruncatedLog(b"")

    monkeypatch.setattr(Path, "open", open_truncated)

    assert main._read_bounded_log_tail(Path("rotated.log"), max_bytes=32) == ""


class _BufferedHandler:
    def __init__(self, path: Path) -> None:
        self.baseFilename = str(path)
        self.path = path
        self.flushed = False

    def flush(self) -> None:
        self.flushed = True
        self.path.write_text("flushed line\n", encoding="utf-8")


def test_get_plugin_logs_flushes_installed_handler_before_reading(tmp_path, monkeypatch) -> None:
    log_path = tmp_path / "decky-metadata.log"
    handler = _BufferedHandler(log_path)
    monkeypatch.setattr(main, "_LOG_FILE_HANDLER", handler)

    result = asyncio.run(make_plugin().get_plugin_logs())

    assert handler.flushed is True
    assert result == "flushed line\n"


def test_get_plugin_logs_installs_existing_logging_contract(tmp_path, monkeypatch) -> None:
    log_path = tmp_path / "decky-metadata.log"
    log_path.write_text("installed line\n", encoding="utf-8")
    handler = _BufferedHandler(log_path)

    def install_logging() -> str:
        main._LOG_FILE_HANDLER = handler
        return str(log_path)

    monkeypatch.setattr(main, "_LOG_FILE_HANDLER", None)
    monkeypatch.setattr(main, "_install_file_logging", install_logging)

    assert asyncio.run(make_plugin().get_plugin_logs()) == "flushed line\n"


def test_get_plugin_logs_returns_empty_when_logging_is_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(main, "_LOG_FILE_HANDLER", None)
    monkeypatch.setattr(main, "_install_file_logging", lambda: "")

    assert asyncio.run(make_plugin().get_plugin_logs()) == ""
