from __future__ import annotations

import os
from pathlib import Path

import pytest

from tests._plugin import make_plugin


def test_steam_userdata_roots_follow_detected_linux_roots(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    plugin = make_plugin()
    roots = [
        tmp_path / "compat-steam",
        tmp_path / "home" / ".var" / "app" / "com.valvesoftware.Steam" / ".local" / "share" / "Steam",
        tmp_path / "sdcard" / "SteamLibrary",
    ]
    for root in roots:
        (root / "userdata").mkdir(parents=True)
    plugin._detect_steam_roots = lambda: roots  # type: ignore[method-assign]
    monkeypatch.setattr(os, "name", "posix")

    assert plugin._steam_userdata_roots() == [root / "userdata" for root in roots]


def test_detect_steam_roots_includes_steamos_locations(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    plugin = make_plugin()
    home = tmp_path / "home"
    compat = tmp_path / "compat-steam"
    local = home / ".local" / "share" / "Steam"
    dot_root = home / ".steam" / "root"
    flatpak = home / ".var" / "app" / "com.valvesoftware.Steam" / ".local" / "share" / "Steam"
    sd_library = tmp_path / "run-media" / "card" / "SteamLibrary"
    sd_steamapps_root = tmp_path / "run-media" / "other-card"
    for path in (compat, local, dot_root, flatpak, sd_library, sd_steamapps_root / "steamapps"):
        path.mkdir(parents=True)

    real_glob = Path.glob

    def fake_glob(self: Path, pattern: str):
        if str(self) == "/run/media":
            return (tmp_path / "run-media").glob(pattern)
        return real_glob(self, pattern)

    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("STEAM_COMPAT_CLIENT_INSTALL_PATH", str(compat))
    monkeypatch.setattr(Path, "home", lambda: home)
    monkeypatch.setattr(Path, "glob", fake_glob)

    roots = plugin._detect_steam_roots()

    assert roots == [
        compat.resolve(),
        local.resolve(),
        dot_root.resolve(),
        flatpak.resolve(),
        sd_library.resolve(),
        sd_steamapps_root.resolve(),
    ]


def test_detect_steam_installs_collects_existing_files(tmp_path: Path) -> None:
    plugin = make_plugin()
    root = tmp_path / "Steam"
    userdata = root / "userdata" / "123"
    shortcuts = userdata / "config" / "shortcuts.vdf"
    config_libraryfolders = root / "config" / "libraryfolders.vdf"
    steamapps_libraryfolders = root / "steamapps" / "libraryfolders.vdf"
    appmanifest_dir = root / "steamapps"
    for path in (shortcuts, config_libraryfolders, steamapps_libraryfolders):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"")
    plugin._detect_steam_roots = lambda: [root]  # type: ignore[method-assign]

    installs = plugin._detect_steam_installs()

    assert len(installs) == 1
    install = installs[0]
    assert install.root == root.resolve()
    assert install.userdata_dirs == [userdata.resolve()]
    assert install.shortcut_files == [shortcuts.resolve()]
    assert install.libraryfolders_files == [
        config_libraryfolders.resolve(),
        steamapps_libraryfolders.resolve(),
    ]
    assert install.appmanifest_dirs == [appmanifest_dir.resolve()]
