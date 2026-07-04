from __future__ import annotations

import json
import zlib
from pathlib import Path
from typing import Any

import pytest

from backend import shortcuts_vdf
from tests._plugin import make_plugin


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "shortcuts"


def _cstring(value: str) -> bytes:
    return value.encode("utf-8") + b"\x00"


def _field(key: str, value: Any) -> bytes:
    if isinstance(value, int):
        return b"\x02" + _cstring(key) + value.to_bytes(4, "little", signed=False)
    return b"\x01" + _cstring(key) + str(value).encode("utf-8") + b"\x00"


def _object(key: str, fields: bytes) -> bytes:
    return b"\x00" + _cstring(key) + fields + b"\x08"


def _shortcut_vdf(entries: list[dict[str, Any]]) -> bytes:
    shortcut_entries = b"".join(
        _object(str(index), b"".join(_field(key, value) for key, value in entry.items()))
        for index, entry in enumerate(entries)
    )
    return _object("shortcuts", shortcut_entries) + b"\x08"


def _write_fixture(tmp_path: Path, name: str, steam_user_id: str = "12345") -> Path:
    entries = json.loads((FIXTURE_DIR / f"{name}.json").read_text(encoding="utf-8"))
    path = tmp_path / "Steam" / "userdata" / steam_user_id / "config" / "shortcuts.vdf"
    path.parent.mkdir(parents=True)
    path.write_bytes(_shortcut_vdf(entries))
    return path


@pytest.mark.parametrize(
    ("fixture_name", "expected_name", "expected_exe"),
    [
        ("windows", "Windows Shortcut", r"C:\Games\Windows Game\Game.exe"),
        ("steamos_srm", "SteamOS SRM Shortcut", "/home/deck/Emulation/tools/launchers/game.sh"),
    ],
)
def test_shortcuts_vdf_normalizes_additive_fields(
    tmp_path: Path, fixture_name: str, expected_name: str, expected_exe: str
) -> None:
    plugin = make_plugin()
    shortcut_file = _write_fixture(tmp_path, fixture_name)

    shortcuts = plugin._extract_shortcuts_from_vdf(shortcut_file)

    assert shortcuts
    shortcut = shortcuts[0]
    assert shortcut["name"] == expected_name
    assert shortcut["exe"] == expected_exe
    assert shortcut["exe_raw"].startswith('"')
    assert isinstance(shortcut["app_id"], int)
    assert shortcut["app_id"] > 0
    assert shortcut["source"] == "steam_shortcuts_vdf"
    assert shortcut["shortcut_path"] == ""
    assert shortcut["shortcut_file"] == str(shortcut_file)


def test_read_steam_shortcuts_adds_user_id_and_dedupes(tmp_path: Path) -> None:
    plugin = make_plugin()
    shortcut_file = _write_fixture(tmp_path, "steamos_srm", steam_user_id="76561198000000000")
    root = shortcut_file.parents[3]
    plugin._detect_steam_roots = lambda: [root]  # type: ignore[method-assign]

    shortcuts = plugin._read_steam_shortcuts()

    assert len(shortcuts) == 1
    shortcut = shortcuts[0]
    assert shortcut["name"] == "SteamOS SRM Shortcut"
    assert shortcut["steam_user_id"] == "76561198000000000"
    assert shortcut["source"] == "steam_shortcuts_vdf"
    assert shortcut["shortcut_file"] == str(shortcut_file)
    assert shortcut["appid"] == shortcut["app_id"] == 3483760051


def test_corrupt_shortcuts_vdf_returns_empty(tmp_path: Path) -> None:
    plugin = make_plugin()
    shortcut_file = tmp_path / "shortcuts.vdf"
    shortcut_file.write_bytes(b"\x00shortcuts\x00\x00unterminated")

    assert plugin._extract_shortcuts_from_vdf(shortcut_file) == []


def test_missing_appid_uses_deterministic_steam_shortcut_id(tmp_path: Path) -> None:
    plugin = make_plugin()
    shortcut_file = tmp_path / "shortcuts.vdf"
    shortcut_file.write_bytes(
        _shortcut_vdf(
            [
                {
                    "appname": "Generated ID",
                    "exe": '"/home/deck/game.sh"',
                    "launchoptions": "",
                }
            ]
        )
    )

    shortcut = plugin._extract_shortcuts_from_vdf(shortcut_file)[0]
    expected = zlib.crc32(("/home/deck/game.sh" + "Generated ID").encode("utf-8")) | 0x80000000
    assert shortcut["app_id"] == expected & 0xFFFFFFFF


def test_oversized_shortcuts_vdf_is_ignored(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    plugin = make_plugin()
    shortcut_file = tmp_path / "shortcuts.vdf"
    shortcut_file.write_bytes(b"0123456789")
    monkeypatch.setattr(shortcuts_vdf, "MAX_SHORTCUTS_VDF_BYTES", 4)

    assert plugin._extract_shortcuts_from_vdf(shortcut_file) == []
