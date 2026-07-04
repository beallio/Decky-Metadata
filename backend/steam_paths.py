from __future__ import annotations

import logging
import os
import sys
from pathlib import Path
from typing import Callable

PlogFn = Callable[..., None]


class SteamInstall:
    def __init__(
        self,
        root: Path,
        userdata_dirs: list[Path],
        shortcut_files: list[Path],
        libraryfolders_files: list[Path],
        appmanifest_dirs: list[Path],
    ) -> None:
        self.root = root
        self.userdata_dirs = userdata_dirs
        self.shortcut_files = shortcut_files
        self.libraryfolders_files = libraryfolders_files
        self.appmanifest_dirs = appmanifest_dirs


def is_steamos() -> bool:
    if not sys.platform.startswith("linux"):
        return False
    try:
        if Path("/etc/steamos-release").exists():
            return True
    except Exception:
        return False
    try:
        fields: dict[str, str] = {}
        for raw_line in Path("/etc/os-release").read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            fields[key.strip()] = value.strip().strip("'\"")
        if fields.get("ID", "").casefold() == "steamos":
            return True
        return "steamos" in fields.get("ID_LIKE", "").casefold().split()
    except Exception:
        return False


def detect_steam_roots(plog: PlogFn) -> list[Path]:
    candidates: list[Path] = []
    try:
        compat_path = os.environ.get("STEAM_COMPAT_CLIENT_INSTALL_PATH")
        if compat_path:
            candidates.append(Path(compat_path))
        candidates.extend(
            [
                Path.home() / ".local" / "share" / "Steam",
                Path.home() / ".steam" / "steam",
                Path.home() / ".steam" / "root",
                Path.home()
                / ".var"
                / "app"
                / "com.valvesoftware.Steam"
                / ".local"
                / "share"
                / "Steam",
            ]
        )
        try:
            candidates.extend(Path("/run/media").glob("*/SteamLibrary"))
            candidates.extend(path.parent for path in Path("/run/media").glob("*/steamapps"))
        except Exception:
            pass
    except Exception:
        return []

    roots: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
            key = str(resolved)
            plog("discovery", "steam root candidate", level=logging.DEBUG, path=resolved, exists=resolved.exists())
            if key in seen or not resolved.exists():
                continue
            roots.append(resolved)
            seen.add(key)
        except Exception as error:
            plog("discovery", "steam root candidate unreadable", level=logging.DEBUG, path=candidate, error=error)
            continue
    plog("discovery", "steam roots detected", roots=[str(root) for root in roots])
    return roots


def detect_steam_installs(roots: list[Path], plog: PlogFn) -> list[SteamInstall]:
    installs: list[SteamInstall] = []
    for root in roots:
        try:
            resolved_root = root.resolve()
        except Exception as error:
            plog("discovery", "skipping unreadable Steam root", level=logging.DEBUG, root=root, error=error)
            continue

        userdata_dirs: list[Path] = []
        shortcut_files: list[Path] = []
        userdata_root = resolved_root / "userdata"
        try:
            if userdata_root.is_dir():
                for user_dir in userdata_root.iterdir():
                    try:
                        if not user_dir.is_dir():
                            continue
                        resolved_user_dir = user_dir.resolve()
                        userdata_dirs.append(resolved_user_dir)
                        shortcut_file = resolved_user_dir / "config" / "shortcuts.vdf"
                        if shortcut_file.is_file():
                            shortcut_files.append(shortcut_file.resolve())
                    except Exception as error:
                        plog("discovery", "skipping unreadable Steam userdata", level=logging.DEBUG, user_dir=user_dir, error=error)
            else:
                plog("discovery", "Steam userdata root not found", level=logging.DEBUG, userdata_root=userdata_root)
        except Exception as error:
            plog("discovery", "skipping unreadable Steam userdata root", level=logging.DEBUG, userdata_root=userdata_root, error=error)

        libraryfolders_files: list[Path] = []
        for libraryfolders_file in (
            resolved_root / "config" / "libraryfolders.vdf",
            resolved_root / "steamapps" / "libraryfolders.vdf",
        ):
            try:
                if libraryfolders_file.is_file():
                    libraryfolders_files.append(libraryfolders_file.resolve())
            except Exception as error:
                plog("discovery", "skipping unreadable Steam library file", level=logging.DEBUG, libraryfolders_file=libraryfolders_file, error=error)

        appmanifest_dirs: list[Path] = []
        steamapps_dir = resolved_root / "steamapps"
        try:
            if steamapps_dir.is_dir():
                appmanifest_dirs.append(steamapps_dir.resolve())
        except Exception as error:
            plog("discovery", "skipping unreadable Steam appmanifest dir", level=logging.DEBUG, steamapps_dir=steamapps_dir, error=error)

        installs.append(
            SteamInstall(
                root=resolved_root,
                userdata_dirs=userdata_dirs,
                shortcut_files=shortcut_files,
                libraryfolders_files=libraryfolders_files,
                appmanifest_dirs=appmanifest_dirs,
            )
        )
        plog(
            "discovery",
            "steam install detected",
            root=resolved_root,
            userdata_dirs=len(userdata_dirs),
            shortcut_files=len(shortcut_files),
            libraryfolders_files=len(libraryfolders_files),
            appmanifest_dirs=len(appmanifest_dirs),
        )
    plog("discovery", "steam installs detected", count=len(installs))
    return installs


def userdata_roots_from_candidates(roots: list[Path], plog: PlogFn) -> list[Path]:
    candidates = [root / "userdata" for root in roots]

    resolved_roots: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
            key = str(resolved)
            if key in seen or not resolved.is_dir():
                continue
            resolved_roots.append(resolved)
            seen.add(key)
        except Exception as error:
            plog("shortcuts", "skipping unreadable Steam userdata root", level=logging.DEBUG, candidate=candidate, error=error)
    return resolved_roots
