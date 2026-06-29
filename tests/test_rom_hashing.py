from __future__ import annotations

import hashlib
import io
from pathlib import Path
from typing import Any

import main


def test_md5_file_streams_to_same_digest(tmp_path: Path) -> None:
    payload = (b"playhub-rom-data" * 8192) + b"tail"
    rom_path = tmp_path / "game.sfc"
    rom_path.write_bytes(payload)

    assert main.Plugin._md5_file(rom_path) == hashlib.md5(payload).hexdigest()


def test_rom_hash_max_bytes_is_four_gibibytes() -> None:
    assert main.MAX_ROM_HASH_BYTES == 4 * 1024 * 1024 * 1024


def test_zip_hash_candidates_skip_oversized_entries(
    monkeypatch: Any, tmp_path: Path
) -> None:
    plugin = main.Plugin.__new__(main.Plugin)
    container_path = tmp_path / "archive.zip"
    container_path.write_bytes(b"not-a-real-zip")
    small_payload = b"small-rom"
    opened_names: list[str] = []

    class FakeEntry:
        def __init__(self, filename: str, file_size: int) -> None:
            self.filename = filename
            self.file_size = file_size

        def is_dir(self) -> bool:
            return False

    oversized = FakeEntry("huge.sfc", main.MAX_ROM_HASH_BYTES + 1)
    small = FakeEntry("small.sfc", len(small_payload))

    class FakeArchive:
        def __init__(self, path: Path) -> None:
            assert path == container_path

        def __enter__(self) -> "FakeArchive":
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def infolist(self) -> list[FakeEntry]:
            return [oversized, small]

        def open(self, entry: FakeEntry) -> io.BytesIO:
            opened_names.append(entry.filename)
            if entry is oversized:
                raise AssertionError("oversized entry should not be opened")
            return io.BytesIO(small_payload)

    monkeypatch.setattr(main.zipfile, "ZipFile", FakeArchive)

    assert plugin._zip_hash_candidates(container_path) == [
        hashlib.md5(small_payload).hexdigest()
    ]
    assert opened_names == ["small.sfc"]
