from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import Any

import pytest

import main
from tests._plugin import make_plugin


def test_is_steamos_matches_os_release_id(monkeypatch: pytest.MonkeyPatch) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(sys, "platform", "linux")
    monkeypatch.setattr(
        Path,
        "read_text",
        lambda self, *_args, **_kwargs: "NAME=SteamOS\nID=steamos\n"
        if str(self) == "/etc/os-release"
        else "",
    )
    monkeypatch.setattr(Path, "exists", lambda self: False)

    assert plugin._is_steamos() is True


def test_is_steamos_matches_os_release_id_like(monkeypatch: pytest.MonkeyPatch) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(sys, "platform", "linux")
    monkeypatch.setattr(
        Path,
        "read_text",
        lambda self, *_args, **_kwargs: 'ID=arch\nID_LIKE="arch steamos"\n'
        if str(self) == "/etc/os-release"
        else "",
    )
    monkeypatch.setattr(Path, "exists", lambda self: False)

    assert plugin._is_steamos() is True


def test_is_steamos_false_when_release_files_absent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(sys, "platform", "linux")

    def missing_release(self: Path, *_args: Any, **_kwargs: Any) -> str:
        if str(self) == "/etc/os-release":
            raise FileNotFoundError
        return ""

    monkeypatch.setattr(Path, "read_text", missing_release)
    monkeypatch.setattr(Path, "exists", lambda self: False)

    assert plugin._is_steamos() is False


def test_is_steamos_false_on_non_linux(monkeypatch: pytest.MonkeyPatch) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(sys, "platform", "win32")

    assert plugin._is_steamos() is False


def test_detect_steam_roots_keeps_existing_unique_roots(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    plugin = make_plugin()
    home = tmp_path / "home"
    compat = tmp_path / "compat-steam"
    local = home / ".local" / "share" / "Steam"
    dot_root = home / ".steam" / "root"
    flatpak = home / ".var" / "app" / "com.valvesoftware.Steam" / ".local" / "share" / "Steam"
    for path in (compat, local, dot_root, flatpak):
        path.mkdir(parents=True)

    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("STEAM_COMPAT_CLIENT_INSTALL_PATH", str(compat))
    monkeypatch.setattr(Path, "home", lambda: home)
    monkeypatch.setattr(plugin, "_read_windows_steam_path", lambda: compat)

    roots = plugin._detect_steam_roots()

    assert roots == [compat.resolve(), local.resolve(), dot_root.resolve(), flatpak.resolve()]
    assert plugin._detect_steam_root() == compat.resolve()


def test_get_platform_capabilities_returns_required_keys_and_types(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    plugin = make_plugin(_image_proxy_port=0)
    steam_root = Path("/tmp/playhub-test-steam")
    monkeypatch.setattr(plugin, "_is_steamos", lambda: False)
    monkeypatch.setattr(plugin, "_detect_steam_roots", lambda: [steam_root])
    monkeypatch.setattr(plugin, "_can_use_loopback_icons", lambda: True)

    capabilities = asyncio.run(plugin.get_platform_capabilities())

    expected_keys = {
        "platform",
        "os_name",
        "is_linux",
        "is_windows",
        "is_steamos",
        "steam_root",
        "steam_roots",
        "has_pillow",
        "supports_metadata",
        "supports_steam_activity",
        "supports_retroachievements",
        "supports_retroachievements_auto",
        "supports_xbox_manual",
        "supports_xbox_uwphook_auto",
        "supports_xbox_app_scan",
        "supports_loopback_icons",
        "supports_localhost_icon_proxy",
    }
    assert set(capabilities) == expected_keys
    assert isinstance(capabilities["platform"], str)
    assert isinstance(capabilities["os_name"], str)
    assert isinstance(capabilities["steam_root"], str)
    assert isinstance(capabilities["steam_roots"], list)
    assert all(isinstance(item, str) for item in capabilities["steam_roots"])
    for key in expected_keys - {"platform", "os_name", "steam_root", "steam_roots"}:
        assert isinstance(capabilities[key], bool)
    assert capabilities["steam_root"] == str(steam_root)
    assert capabilities["steam_roots"] == [str(steam_root)]
    assert capabilities["supports_xbox_uwphook_auto"] == (os.name == "nt")
    assert capabilities["supports_xbox_app_scan"] == (os.name == "nt")
    assert capabilities["supports_localhost_icon_proxy"] is False
