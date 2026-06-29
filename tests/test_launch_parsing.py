from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from tests._plugin import make_plugin


FIXTURE_DIR = Path(__file__).parent / "fixtures" / "launch"


def load_commands(name: str) -> list[dict[str, str]]:
    return json.loads((FIXTURE_DIR / name).read_text(encoding="utf-8"))


@pytest.mark.parametrize(
    "command",
    load_commands("emu_deck_commands.json")
    + load_commands("flatpak_commands.json")
    + load_commands("proton_commands.json"),
    ids=lambda command: command["name"],
)
def test_extract_candidate_game_paths_prefers_rom_from_launch_command(
    command: dict[str, str],
) -> None:
    plugin = make_plugin()

    candidates = plugin.extract_candidate_game_paths(
        command["exe"], command["launch_options"], ""
    )

    assert candidates
    assert candidates[0]["path"] == command["expected"]
    assert candidates[0]["suffix"] == Path(command["expected"]).suffix.lower()
    assert candidates[0]["source"] in {"launch_options", "shell_command"}
    assert not candidates[0]["exists"]


def test_extract_candidate_game_paths_marks_existing_rom(tmp_path: Path) -> None:
    rom = tmp_path / "Mega Man X.sfc"
    rom.write_bytes(b"rom")
    plugin = make_plugin()

    candidates = plugin.extract_candidate_game_paths(
        "/usr/bin/retroarch", f'-L snes9x_libretro.so "{rom}"', ""
    )

    assert candidates[0]["path"] == str(rom)
    assert candidates[0]["exists"] is True
    assert candidates[0]["score"] > 1.0


def test_extract_candidate_game_paths_returns_empty_without_plausible_rom() -> None:
    plugin = make_plugin()

    assert plugin.extract_candidate_game_paths("/usr/bin/flatpak", "run org.example.App", "") == []


def test_resolve_retroachievements_skips_network_without_candidate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plugin = make_plugin(
        _data={
            "settings": {"retroachievements": {"username": "user", "api_key": "key"}},
            "ra_game_ids": {},
            "metadata": {},
        },
        _hash_library={},
    )
    monkeypatch.setattr(plugin, "_load_data", lambda: None)
    monkeypatch.setattr(
        plugin,
        "_load_hash_library",
        lambda: (_ for _ in ()).throw(AssertionError("hash library was loaded")),
    )
    monkeypatch.setattr(
        plugin,
        "_resolve_ra_game_id_by_title",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("RA API was called")),
    )

    result = plugin._resolve_retroachievements_from_path_sync(
        123, "/usr/bin/flatpak run org.example.App", "Example"
    )

    assert result == {
        "provider": "retroachievements",
        "reason": "no_candidate_path",
        "candidate": None,
    }


def test_resolve_retroachievements_preserves_existing_manual_mapping(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    rom = tmp_path / "Manual Game.gba"
    rom.write_bytes(b"rom")
    plugin = make_plugin(
        _data={
            "settings": {"retroachievements": {"username": "user", "api_key": "key"}},
            "ra_game_ids": {"123": 777},
            "metadata": {},
        },
        _hash_library={},
    )
    monkeypatch.setattr(plugin, "_load_data", lambda: None)
    monkeypatch.setattr(plugin, "_save_data", lambda: None)
    monkeypatch.setattr(
        plugin,
        "_fetch_ra_achievements_sync",
        lambda app_id: {
            "provider": "retroachievements",
            "game_id": plugin._data["ra_game_ids"][str(app_id)],
            "steam": {"nAchieved": 0, "nTotal": 1},
        },
    )

    result = plugin._resolve_retroachievements_from_path_sync(
        123, f'/usr/bin/retroarch "{rom}"', "Manual Game"
    )

    assert plugin._data["ra_game_ids"]["123"] == 777
    assert result is not None
    assert result["game_id"] == 777
    assert result["reason"] == "manual_mapping_exists"
