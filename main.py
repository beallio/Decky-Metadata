from __future__ import annotations

import asyncio
import functools
import io
import difflib
import hashlib
import html
import json
import logging
import os
import re
import shlex
import shutil
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from pathlib import Path
from typing import Any

import decky

MAX_SHORTCUTS_VDF_BYTES = 2 * 1024 * 1024
MAX_SHORTCUTS_VDF_DEPTH = 32
MAX_SHORTCUTS_VDF_ENTRIES = 2048
_LOG_FILE_HANDLER: logging.Handler | None = None


def _redact(text: Any) -> str:
    value = str(text or "")
    value = re.sub(r"([?&]y=)[^&#\s]+", r"\1***", value, flags=re.IGNORECASE)
    value = re.sub(r"(\bapi[_-]?key=)[^&#\s]+", r"\1***", value, flags=re.IGNORECASE)
    value = re.sub(
        r"((?:['\"])?\bAuthorization(?:['\"])?\s*[:=]\s*(?:['\"])?)(Bearer\s+)?[^'\"\s,}]+",
        r"\1***",
        value,
        flags=re.IGNORECASE,
    )
    value = re.sub(
        r"((?:['\"])?\bX-Authorization(?:['\"])?\s*[:=]\s*(?:['\"])?)[^'\"\s,}]+",
        r"\1***",
        value,
        flags=re.IGNORECASE,
    )
    return value


def _plog(area: str, message: str, *, level: int = logging.INFO, exc: bool = False, **fields: Any) -> None:
    try:
        detail = "".join(f" {key}={_redact(value)!r}" for key, value in fields.items())
        text = f"[decky:{area}] {message}{detail}"
        if exc:
            decky.logger.error(text, exc_info=True)
        else:
            decky.logger.log(level, text)
    except Exception:
        pass


def _resolve_log_dir() -> Path | None:
    for attr in (
        "DECKY_PLUGIN_LOG_DIR",
        "DECKY_PLUGIN_RUNTIME_DIR",
        "DECKY_PLUGIN_SETTINGS_DIR",
    ):
        value = getattr(decky, attr, None)
        if value:
            return Path(str(value))
    return None


def _install_file_logging() -> str:
    global _LOG_FILE_HANDLER
    try:
        if _LOG_FILE_HANDLER is not None:
            return str(getattr(_LOG_FILE_HANDLER, "baseFilename", ""))

        log_dir = _resolve_log_dir()
        if log_dir is None:
            return ""
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / "decky-metadata.log"

        from logging.handlers import RotatingFileHandler

        for handler in decky.logger.handlers:
            if (
                isinstance(handler, RotatingFileHandler)
                and Path(str(getattr(handler, "baseFilename", ""))) == log_path
            ):
                _LOG_FILE_HANDLER = handler
                return str(log_path)

        handler = RotatingFileHandler(
            log_path,
            maxBytes=2 * 1024 * 1024,
            backupCount=3,
            encoding="utf-8",
        )
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        handler.setLevel(logging.DEBUG)
        decky.logger.addHandler(handler)
        _LOG_FILE_HANDLER = handler
        return str(log_path)
    except Exception:
        return ""


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


@functools.lru_cache(maxsize=1)
def _build_https_context() -> ssl.SSLContext:
    try:
        import certifi

        context = ssl.create_default_context(cafile=certifi.where())
    except Exception:
        context = ssl.create_default_context()
    context.check_hostname = True
    context.verify_mode = ssl.CERT_REQUIRED
    return context


def _is_tls_verification_error(error: BaseException) -> bool:
    if isinstance(error, ssl.SSLCertVerificationError):
        return True
    reason = getattr(error, "reason", None)
    return isinstance(reason, ssl.SSLCertVerificationError)


def _tls_log_target(request_or_url: Any) -> str:
    url = getattr(request_or_url, "full_url", request_or_url)
    parsed = urllib.parse.urlsplit(str(url or ""))
    if parsed.scheme and parsed.netloc:
        path = parsed.path or "/"
        return f"{parsed.scheme}://{parsed.netloc}{path}"
    return str(url or "<unknown>")


def _log_tls_verification_failure(request_or_url: Any, error: BaseException) -> None:
    if _is_tls_verification_error(error):
        _plog(
            "http",
            "TLS certificate verification failed",
            level=logging.ERROR,
            target=_tls_log_target(request_or_url),
            error=error,
        )

IGN_GRAPHQL_URL = "https://mollusk.apis.ign.com/graphql"
IGN_BASE_URL = "https://www.ign.com"
RAWG_BASE_URL = "https://rawg.io"
YOUTUBE_SEARCH_URL = "https://www.youtube.com/results"
STEAM_STORE_SEARCH_URL = "https://store.steampowered.com/api/storesearch/"
STEAM_APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails"
STEAM_NEWS_URL = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/"
STEAM_EVENTS_URL = "https://store.steampowered.com/events/ajaxgetpartnereventspageable/"
STEAM_DECK_COMPAT_URL = "https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport"
STEAM_STORE_APP_URL = "https://store.steampowered.com/app/{appid}/"
STEAM_TRACKER_DELISTED_URL = "https://steam-tracker.com/apps/delisted"
DELISTED_INDEX_TTL_SECONDS = 7 * 24 * 3600
DELISTED_INDEX_MAX_BYTES = 30 * 1024 * 1024
DELISTED_INDEX_FILENAME = "delisted_index.json"
NON_PRIMARY_STEAM_TITLE_PATTERNS = (
    r"\bdemo\b",
    r"\bbeta\b",
    r"\bplaytest\b",
    r"\bprototype\b",
    r"\bsoundtrack\b",
    r"\bost\b",
    r"\bseason\s+pass\b",
    r"\bdlc\b",
    r"\bpack\b",
    r"\bbundle\b",
    r"\bartbook\b",
    r"\bart\s+book\b",
    r"\btrailer\b",
    r"\bdedicated\s+server\b",
    r"\bserver\b",
    r"\btest\b",
)
STEAM_ACTIVITY_EVENT_TYPES = {12, 13, 14, 15, 23, 24, 25, 28, 35}
STORE_CATEGORY = {
    "multiplayer": 1,
    "single_player": 2,
    "co_op": 9,
    "mmo": 20,
    "achievements": 22,
    "split_screen": 24,
    "full_controller": 28,
    "online_multiplayer": 36,
    "local_multiplayer": 37,
    "online_co_op": 38,
    "local_co_op": 392,
}
ROM_EXTENSIONS = {
    ".zip",
    ".7z",
    ".iso",
    ".bin",
    ".chd",
    ".cue",
    ".img",
    ".a26",
    ".lnx",
    ".ngp",
    ".ngc",
    ".elf",
    ".n64",
    ".ndd",
    ".u1",
    ".v64",
    ".z64",
    ".nds",
    ".dmg",
    ".gbc",
    ".gba",
    ".gb",
    ".ciso",
    ".cso",
    ".rom",
    ".nes",
    ".fds",
    ".unif",
    ".unf",
    ".32x",
    ".cdi",
    ".gdi",
    ".m3u",
    ".gg",
    ".gen",
    ".smd",
    ".sms",
    ".ecm",
    ".mds",
    ".pbp",
    ".dump",
    ".gz",
    ".mdf",
    ".mrg",
    ".prx",
    ".bs",
    ".fig",
    ".sfc",
    ".smc",
    ".swx",
    ".pc2",
    ".wsc",
    ".ws",
    ".md",
    ".gcm",
    ".gcz",
    ".rvz",
    ".wad",
    ".wia",
    ".wbfs",
    ".3ds",
    ".3dsx",
    ".app",
    ".axf",
    ".cci",
    ".cxi",
    ".dol",
    ".nkit.iso",
    ".nca",
    ".nro",
    ".nso",
    ".nsp",
    ".wua",
    ".wud",
    ".wux",
    ".xci",
    ".rpx",
}


def now() -> int:
    return int(time.time())


class Plugin:
    def __init__(self) -> None:
        self._settings_dir = Path(decky.DECKY_PLUGIN_SETTINGS_DIR)
        self._data_file = self._settings_dir / "decky_metadata.json"
        self._scan_task: asyncio.Task[Any] | None = None
        self._scan_progress = self._new_scan_progress("idle")
        self._activity_refresh_task: asyncio.Task[Any] | None = None
        self._activity_refresh_progress = self._new_scan_progress("idle")
        self._data = self._default_data()
        self._delisted_index: dict[str, Any] | None = None

    async def _main(self) -> None:
        log_path = _install_file_logging()
        _plog("load", "file logging enabled", path=log_path or "unavailable")
        _plog("load", "backend startup begin")
        step = "settings_dir"
        try:
            self._settings_dir.mkdir(parents=True, exist_ok=True)
            step = "load_data"
            self._load_data()
            self._apply_debug_logging()
            step = "platform_capabilities"
            capabilities = await self.get_platform_capabilities()
            _plog("platform", "capabilities loaded", **capabilities)
            _plog("load", "backend ready")
        except Exception:
            _plog("load", "backend startup failed", level=logging.ERROR, exc=True, step=step)
            raise

    async def _unload(self) -> None:
        _plog("load", "backend unload begin")
        if self._scan_task and not self._scan_task.done():
            self._scan_task.cancel()
        if self._activity_refresh_task and not self._activity_refresh_task.done():
            self._activity_refresh_task.cancel()
        _plog("load", "backend unloaded")

    @staticmethod
    def _windows_powershell_executable() -> str:
        if os.name != "nt":
            return ""
        for exe in ("powershell.exe", "powershell", "pwsh.exe", "pwsh"):
            resolved = shutil.which(exe)
            if resolved:
                return resolved
        system_root = os.environ.get("SystemRoot") or r"C:\Windows"
        fallback = Path(system_root) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
        return str(fallback) if fallback.exists() else ""

    @staticmethod
    def _hidden_subprocess_kwargs() -> dict[str, Any]:
        if os.name != "nt":
            return {}
        kwargs: dict[str, Any] = {}
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        if creationflags:
            kwargs["creationflags"] = creationflags
        try:
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0
            kwargs["startupinfo"] = startupinfo
        except Exception:
            pass
        return kwargs

    def _is_steamos(self) -> bool:
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

    def _detect_steam_roots(self) -> list[Path]:
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
            if os.name == "nt":
                steam_path = self._read_windows_steam_path()
                if steam_path:
                    candidates.append(steam_path)
                for env_name in ("PROGRAMFILES(X86)", "PROGRAMFILES"):
                    value = os.environ.get(env_name)
                    if value:
                        candidates.append(Path(value) / "Steam")
        except Exception:
            return []

        roots: list[Path] = []
        seen: set[str] = set()
        for candidate in candidates:
            try:
                resolved = candidate.resolve()
                key = str(resolved).casefold() if os.name == "nt" else str(resolved)
                _plog("discovery", "steam root candidate", level=logging.DEBUG, path=resolved, exists=resolved.exists())
                if key in seen or not resolved.exists():
                    continue
                roots.append(resolved)
                seen.add(key)
            except Exception as error:
                _plog("discovery", "steam root candidate unreadable", level=logging.DEBUG, path=candidate, error=error)
                continue
        _plog("discovery", "steam roots detected", roots=[str(root) for root in roots])
        return roots

    def _detect_steam_installs(self) -> list[SteamInstall]:
        installs: list[SteamInstall] = []
        for root in self._detect_steam_roots():
            try:
                resolved_root = root.resolve()
            except Exception as error:
                _plog("discovery", "skipping unreadable Steam root", level=logging.DEBUG, root=root, error=error)
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
                            _plog("discovery", "skipping unreadable Steam userdata", level=logging.DEBUG, user_dir=user_dir, error=error)
                else:
                    _plog("discovery", "Steam userdata root not found", level=logging.DEBUG, userdata_root=userdata_root)
            except Exception as error:
                _plog("discovery", "skipping unreadable Steam userdata root", level=logging.DEBUG, userdata_root=userdata_root, error=error)

            libraryfolders_files: list[Path] = []
            for libraryfolders_file in (
                resolved_root / "config" / "libraryfolders.vdf",
                resolved_root / "steamapps" / "libraryfolders.vdf",
            ):
                try:
                    if libraryfolders_file.is_file():
                        libraryfolders_files.append(libraryfolders_file.resolve())
                except Exception as error:
                    _plog("discovery", "skipping unreadable Steam library file", level=logging.DEBUG, libraryfolders_file=libraryfolders_file, error=error)

            appmanifest_dirs: list[Path] = []
            steamapps_dir = resolved_root / "steamapps"
            try:
                if steamapps_dir.is_dir():
                    appmanifest_dirs.append(steamapps_dir.resolve())
            except Exception as error:
                _plog("discovery", "skipping unreadable Steam appmanifest dir", level=logging.DEBUG, steamapps_dir=steamapps_dir, error=error)

            installs.append(
                SteamInstall(
                    root=resolved_root,
                    userdata_dirs=userdata_dirs,
                    shortcut_files=shortcut_files,
                    libraryfolders_files=libraryfolders_files,
                    appmanifest_dirs=appmanifest_dirs,
                )
            )
            _plog(
                "discovery",
                "steam install detected",
                root=resolved_root,
                userdata_dirs=len(userdata_dirs),
                shortcut_files=len(shortcut_files),
                libraryfolders_files=len(libraryfolders_files),
                appmanifest_dirs=len(appmanifest_dirs),
            )
        _plog("discovery", "steam installs detected", count=len(installs))
        return installs

    def _detect_steam_root(self) -> Path | None:
        roots = self._detect_steam_roots()
        return roots[0] if roots else None

    async def _migration(self) -> None:
        self._settings_dir.mkdir(parents=True, exist_ok=True)

    async def get_platform_capabilities(self) -> dict[str, Any]:
        capabilities: dict[str, Any] = {
            "platform": str(sys.platform),
            "os_name": str(os.name),
            "is_linux": sys.platform.startswith("linux"),
            "is_windows": os.name == "nt",
            "is_steamos": False,
            "steam_root": "",
            "steam_roots": [],
            "supports_metadata": True,
            "supports_steam_activity": True,
        }
        try:
            capabilities["is_steamos"] = bool(self._is_steamos())
        except Exception:
            pass
        try:
            steam_roots = self._detect_steam_roots()
            capabilities["steam_roots"] = [str(root) for root in steam_roots]
            capabilities["steam_root"] = str(steam_roots[0]) if steam_roots else ""
        except Exception:
            pass
        return capabilities

    async def get_state(self) -> dict[str, Any]:
        self._load_data()
        return self._data

    def _apply_debug_logging(self) -> bool:
        enabled = bool((self._data.get("settings") or {}).get("debug_logging", False))
        decky.logger.setLevel(logging.DEBUG if enabled else logging.INFO)
        _plog("load", "debug logging level applied", level=logging.DEBUG, enabled=enabled)
        return enabled

    async def get_debug_logging(self) -> bool:
        self._load_data()
        return self._apply_debug_logging()

    async def set_debug_logging(self, enabled: bool) -> bool:
        self._load_data()
        value = bool(enabled)
        self._data.setdefault("settings", {})["debug_logging"] = value
        self._save_data()
        decky.logger.setLevel(logging.DEBUG if value else logging.INFO)
        _plog("load", "debug logging updated", level=logging.INFO, enabled=value)
        return value

    async def get_metadata(self, app_id: int) -> dict[str, Any] | None:
        self._load_data()
        return self._data["metadata"].get(str(app_id))

    async def get_all_metadata(self) -> dict[str, Any]:
        self._load_data()
        return self._data["metadata"]

    async def save_metadata(
        self, app_id: int, metadata: dict[str, Any]
    ) -> dict[str, Any]:
        self._load_data()
        cleaned = self._sanitize_metadata(metadata)
        cleaned["updated_at"] = now()
        self._data["metadata"][str(app_id)] = cleaned
        self._save_data()
        return cleaned

    async def remove_metadata(self, app_id: int) -> dict[str, Any]:
        self._load_data()
        self._data["metadata"].pop(str(app_id), None)
        self._save_data()
        return self._data["metadata"]

    async def clear_metadata_cache(self) -> dict[str, Any]:
        self._load_data()
        cleared = len(self._data.get("metadata") or {})
        self._data["metadata"] = {}
        self._save_data()
        _plog("cache", "metadata cache cleared", count=cleared)
        return {"ok": True, "cleared": cleared}

    async def frontend_log(
        self, area: str = "ui", message: str = "", fields: dict[str, Any] | None = None
    ) -> bool:
        try:
            clean_fields = fields if isinstance(fields, dict) else {}
            _plog(str(area or "ui"), str(message or ""), **clean_fields, level=logging.DEBUG)
        except Exception:
            pass
        return True

    async def search_metadata(self, query: str, limit: int = 8) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._search_metadata_sync, query, limit)

    async def fetch_metadata(self, slug_or_url: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._fetch_metadata_sync, slug_or_url)

    async def auto_fetch_metadata(
        self, app_id: int, title: str
    ) -> dict[str, Any] | None:
        metadata = await asyncio.to_thread(self._auto_fetch_metadata_sync, title)
        if metadata:
            await self.save_metadata(app_id, metadata)
        return metadata

    async def enrich_steam_app(self, app_id: int) -> dict[str, Any] | None:
        self._load_data()
        key = str(app_id)
        metadata = self._data["metadata"].get(key)
        if not isinstance(metadata, dict):
            return None
        title = str(metadata.get("title") or "")
        enriched = await asyncio.to_thread(
            self._metadata_with_steam_news_sync, metadata, title
        )
        return await self.save_metadata(app_id, enriched)

    async def refresh_delisted_index(self) -> dict[str, Any]:
        index = await asyncio.to_thread(self._ensure_delisted_index_sync, True)
        return {
            "ok": index is not None,
            "count": len(index.get("apps", [])) if isinstance(index, dict) else 0,
            "fetched_at": index.get("fetched_at", 0) if isinstance(index, dict) else 0,
        }

    async def get_delisted_index_status(self) -> dict[str, Any]:
        index = getattr(self, "_delisted_index", None)
        if not isinstance(index, dict):
            index = await asyncio.to_thread(self._load_delisted_index_sync)
            if isinstance(index, dict):
                self._delisted_index = index
        return {
            "count": len(index.get("apps", [])) if isinstance(index, dict) else 0,
            "fetched_at": index.get("fetched_at", 0) if isinstance(index, dict) else 0,
        }

    async def start_scan_missing(self, games: list[dict[str, Any]]) -> dict[str, Any]:
        if self._scan_task and not self._scan_task.done():
            return self._scan_progress
        self._scan_progress = self._new_scan_progress("running")
        self._scan_task = asyncio.create_task(self._scan_missing(games or []))
        return self._scan_progress

    async def get_scan_progress(self) -> dict[str, Any]:
        return self._scan_progress

    async def start_refresh_steam_activities(self, games: list[dict[str, Any]]) -> dict[str, Any]:
        if self._activity_refresh_task and not self._activity_refresh_task.done():
            return self._activity_refresh_progress
        self._activity_refresh_progress = self._new_scan_progress("running")
        self._activity_refresh_task = asyncio.create_task(self._refresh_steam_activities(games or []))
        return self._activity_refresh_progress

    async def get_activity_refresh_progress(self) -> dict[str, Any]:
        return self._activity_refresh_progress

    async def get_local_shortcuts(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._read_steam_shortcuts)

    def _default_data(self) -> dict[str, Any]:
        return {
            "metadata": {},
            "settings": {
                "debug_logging": False,
            },
        }

    def _load_data(self) -> None:
        if not self._data_file.exists():
            self._save_data()
            return
        try:
            payload = json.loads(self._data_file.read_text(encoding="utf-8"))
        except Exception as error:
            _plog("load", "failed reading metadata settings", level=logging.ERROR, exc=True, path=self._data_file, error=error)
            return
        if not isinstance(payload, dict):
            return
        default = self._default_data()
        default["metadata"].update(payload.get("metadata") or {})
        default["settings"].update(payload.get("settings") or {})
        default["settings"]["debug_logging"] = bool(default["settings"].get("debug_logging", False))
        self._data = default

    def _save_data(self) -> None:
        self._settings_dir.mkdir(parents=True, exist_ok=True)
        self._data_file.write_text(
            json.dumps(self._data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _new_scan_progress(self, status: str) -> dict[str, Any]:
        return {
            "running": status == "running",
            "status": status,
            "total": 0,
            "completed": 0,
            "assigned": 0,
            "failed": 0,
            "current": "",
            "message": "",
            "error": "",
        }

    def _metadata_needs_scan(self, app_id: int) -> bool:
        metadata = self._data["metadata"].get(str(app_id))
        if not isinstance(metadata, dict):
            return True
        # Treat empty/manual shells as missing so the metadata scan can repair them,
        # but do not use missing Steam Activity/news as a reason to scan metadata.
        title = self._clean_game_title(str(metadata.get("title") or ""))
        source = str(metadata.get("source") or "").strip().casefold()
        has_description = bool(self._clean_html_text(str(metadata.get("description") or metadata.get("short_description") or "")))
        return not title or (source in {"", "manual"} and not has_description)

    async def _scan_missing(self, games: list[dict[str, Any]]) -> None:
        self._load_data()
        missing = [
            game
            for game in games
            if isinstance(game, dict)
            and str(game.get("appid", "")).strip()
            and self._metadata_needs_scan(int(game.get("appid")))
        ]
        self._scan_progress.update({"total": len(missing), "completed": 0})
        if missing:
            await asyncio.to_thread(self._ensure_delisted_index_sync, False)
        for game in missing:
            app_id = int(game.get("appid"))
            title = self._clean_game_title(str(game.get("name") or ""))
            self._scan_progress["current"] = f"{self._scan_progress['completed'] + 1}/{len(missing)} - {title}" if title else f"{self._scan_progress['completed'] + 1}/{len(missing)}"
            try:
                self._scan_progress["message"] = f"Matching Steam for {title}"
                steam_shell = {"title": title, "source": "Manual", "id": title}
                steam_record = await asyncio.to_thread(
                    self._metadata_with_steam_news_sync,
                    steam_shell,
                    title,
                    10,
                )
                matched_steam = bool(self._safe_int(steam_record.get("steam_appid")))
                if matched_steam:
                    await self.save_metadata(app_id, steam_record)
                    self._scan_progress["assigned"] += 1
                    self._scan_progress["message"] = f"Matched Steam for {title}"
                else:
                    delisted_appid = await asyncio.to_thread(
                        self._resolve_delisted_appid_for_title,
                        title,
                    )
                    if delisted_appid:
                        pinned = {
                            "title": title,
                            "source": "Manual",
                            "id": title,
                            "steam_appid": delisted_appid,
                        }
                        steam_record = await asyncio.to_thread(
                            self._metadata_with_steam_news_sync,
                            pinned,
                            title,
                            10,
                        )
                        if self._safe_int(steam_record.get("steam_appid")):
                            await self.save_metadata(app_id, steam_record)
                            self._scan_progress["assigned"] += 1
                            self._scan_progress["message"] = f"Matched delisted Steam app for {title}"
                            continue
                    self._scan_progress["message"] = f"Fetching metadata for {title}"
                    metadata = await asyncio.to_thread(self._auto_fetch_metadata_sync, title)
                    if metadata:
                        metadata = await asyncio.to_thread(
                            self._metadata_with_steam_news_sync,
                            metadata,
                            title,
                            10,
                        )
                        await self.save_metadata(app_id, metadata)
                        self._scan_progress["assigned"] += 1
                        self._scan_progress["message"] = f"Saved metadata for {title}"
                    else:
                        self._scan_progress["failed"] += 1
                        self._scan_progress["message"] = f"No metadata match for {title}"
            except Exception as error:
                self._scan_progress["failed"] += 1
                self._scan_progress["message"] = f"Failed: {title}"
                self._scan_progress["error"] = str(error)
                _plog("load", "metadata scan failed", level=logging.ERROR, exc=True, title=title, app_id=app_id, error=error)
            finally:
                self._scan_progress["completed"] += 1
        self._scan_progress["running"] = False
        self._scan_progress["status"] = "completed"
        self._scan_progress["current"] = ""

    async def _refresh_steam_activities(self, games: list[dict[str, Any]]) -> None:
        self._load_data()
        targets: list[dict[str, Any]] = []
        for game in games:
            if not isinstance(game, dict) or not str(game.get("appid", "")).strip():
                continue
            metadata = self._data["metadata"].get(str(int(game.get("appid"))))
            if isinstance(metadata, dict):
                targets.append(game)
        self._activity_refresh_progress.update({"total": len(targets), "completed": 0})
        for game in targets:
            app_id = int(game.get("appid"))
            metadata = self._data["metadata"].get(str(app_id))
            title = self._clean_game_title(str(game.get("name") or (metadata or {}).get("title") or ""))
            current = f"{self._activity_refresh_progress['completed'] + 1}/{len(targets)} - {title}" if title else f"{self._activity_refresh_progress['completed'] + 1}/{len(targets)}"
            self._activity_refresh_progress["current"] = current
            self._activity_refresh_progress["message"] = f"Refreshing Steam Activity for {title}"
            try:
                refreshed = await asyncio.to_thread(
                    self._metadata_with_steam_news_sync,
                    dict(metadata or {}),
                    title,
                    10,
                )
                if refreshed and self._sanitize_steam_news(refreshed.get("steam_news")):
                    self._data["metadata"][str(app_id)] = refreshed
                    self._save_data()
                    self._activity_refresh_progress["assigned"] += 1
                    self._activity_refresh_progress["message"] = f"Updated Steam Activity for {title}"
                else:
                    if refreshed:
                        self._data["metadata"][str(app_id)] = refreshed
                        self._save_data()
                    self._activity_refresh_progress["failed"] += 1
                    self._activity_refresh_progress["message"] = f"No Steam Activity found for {title}"
            except Exception as error:
                self._activity_refresh_progress["failed"] += 1
                self._activity_refresh_progress["message"] = f"Failed: {title}"
                self._activity_refresh_progress["error"] = str(error)
                _plog("load", "Steam Activity refresh failed", level=logging.ERROR, exc=True, title=title, app_id=app_id, error=error)
            finally:
                self._activity_refresh_progress["completed"] += 1
        self._activity_refresh_progress["running"] = False
        self._activity_refresh_progress["status"] = "completed"
        self._activity_refresh_progress["current"] = ""

    def _search_metadata_sync(self, query: str, limit: int = 8) -> list[dict[str, Any]]:
        cleaned = self._clean_game_title(query)
        if not cleaned:
            return []
        variables = {"name": cleaned, "count": max(1, min(int(limit or 8), 12)), "type": "Game"}
        gql = """
        query SearchObjectsByName($name: String!, $count: Int!, $type: ObjectType!) {
          searchObjectsByName(name: $name, count: $count, type: $type) {
            edges {
              node {
                id
                slug
                url
                type
                metadata {
                  names { name short }
                  descriptions { short }
                }
                primaryReview { score }
              }
            }
          }
        }
        """
        payload = self._graphql(gql, variables)
        edges = (
            payload.get("data", {})
            .get("searchObjectsByName", {})
            .get("edges", [])
        )
        results: list[dict[str, Any]] = []
        for edge in edges:
            node = (edge or {}).get("node") or {}
            metadata = node.get("metadata") or {}
            names = metadata.get("names") or {}
            descriptions = metadata.get("descriptions") or {}
            title = names.get("name") or names.get("short") or node.get("slug")
            if not title:
                continue
            results.append(
                {
                    "id": node.get("id"),
                    "slug": node.get("slug"),
                    "url": self._absolute_ign_url(node.get("url") or node.get("slug")),
                    "title": title,
                    "description": self._clean_html_text(descriptions.get("short") or ""),
                    "rating": self._rating_to_percent(
                        ((node.get("primaryReview") or {}).get("score"))
                    ),
                }
            )
        return results

    def _auto_fetch_metadata_sync(self, title: str) -> dict[str, Any] | None:
        cleaned = self._clean_game_title(title)
        if not cleaned:
            return None

        for slug in self._slug_candidates(cleaned):
            try:
                metadata = self._fetch_metadata_sync(slug)
                if metadata and self._ign_title_acceptable(cleaned, metadata.get("title", "")):
                    return metadata
            except Exception:
                continue

        results = self._search_metadata_sync(cleaned, 5)
        if not results:
            return None
        best = results[0]
        if not self._ign_title_acceptable(cleaned, best.get("title", "")):
            return None
        return self._fetch_metadata_sync(best["slug"] or best["url"])

    def _ign_title_acceptable(self, query: str, candidate_title: str) -> bool:
        if not self._reasonable_match(query, candidate_title):
            return False
        query_norm = self._normalise_match_title(query)
        candidate_norm = self._normalise_match_title(candidate_title)
        return self._distinctive_tokens_present(query_norm, candidate_norm)

    def _fetch_metadata_sync(self, slug_or_url: str) -> dict[str, Any] | None:
        slug = self._slug_from_ign_value(slug_or_url)
        if not slug:
            return None
        variables = {"slug": slug, "objectType": "Game", "state": "Published"}
        gql = """
        query ObjectSelectByTypeAndSlug($objectType: ObjectType!, $slug: String!, $state: State) {
          objectSelectByTypeAndSlug(type: $objectType, slug: $slug, state: $state) {
            id
            slug
            url
            type
            metadata {
              names { name short alt }
              descriptions { short long }
            }
            producers { name slug }
            publishers { name slug }
            genres { name slug }
            features { name slug }
            primaryImage { id url caption state height width }
            images {
              edges {
                node { id url caption state height width }
              }
            }
            primaryReview { score scoreText scoreSummary }
            objectRegions {
              region
              releases {
                date
                platformAttributes { name slug }
              }
            }
          }
        }
        """
        payload = self._graphql(gql, variables)
        game = payload.get("data", {}).get("objectSelectByTypeAndSlug")
        if not isinstance(game, dict):
            return None
        return self._game_to_metadata(game)

    def _game_to_metadata(self, game: dict[str, Any]) -> dict[str, Any]:
        metadata = game.get("metadata") or {}
        names = metadata.get("names") or {}
        descriptions = metadata.get("descriptions") or {}
        title = names.get("name") or names.get("short") or game.get("slug") or ""
        long_desc = self._clean_html_text(
            descriptions.get("long") or descriptions.get("short") or ""
        )
        short_desc = self._clean_html_text(descriptions.get("short") or long_desc)
        producers = self._attributes_to_people(game.get("producers") or [])
        publishers = self._attributes_to_people(game.get("publishers") or [])
        genres = self._attributes_to_names(game.get("genres") or [])
        features = self._attributes_to_names(game.get("features") or [])
        rating = self._rating_to_percent((game.get("primaryReview") or {}).get("score"))
        release_date = self._first_release_date(game.get("objectRegions") or [])
        categories = self._infer_store_categories(
            " ".join([title, long_desc, " ".join(genres), " ".join(features)])
        )
        screenshots = self._ign_images_to_screenshots(game)
        return self._sanitize_metadata(
            {
                "title": title,
                "id": game.get("id") or game.get("slug") or title,
                "source": "IGN",
                "source_url": self._absolute_ign_url(game.get("url") or game.get("slug")),
                "description": long_desc or short_desc,
                "short_description": short_desc or long_desc,
                "developers": producers,
                "publishers": publishers,
                "release_date": release_date,
                "rating": rating,
                "store_categories": categories,
                "genres": genres,
                "features": features,
                "screenshots": screenshots,
            }
        )

    def _sanitize_metadata(self, metadata: dict[str, Any]) -> dict[str, Any]:
        def clean_people(values: Any) -> list[dict[str, str]]:
            people: list[dict[str, str]] = []
            if not isinstance(values, list):
                return people
            for item in values:
                if isinstance(item, str):
                    name = item.strip()
                    url = ""
                elif isinstance(item, dict):
                    name = str(item.get("name") or "").strip()
                    url = str(item.get("url") or "").strip()
                else:
                    continue
                if name:
                    people.append({"name": name, "url": url})
            return people

        categories: list[int] = []
        for value in metadata.get("store_categories") or []:
            try:
                category = int(value)
            except Exception:
                continue
            if category not in categories:
                categories.append(category)

        rating = metadata.get("rating")
        try:
            rating = int(round(float(rating))) if rating is not None else None
        except Exception:
            rating = None
        if rating is not None:
            rating = max(0, min(rating, 100))

        release_date = metadata.get("release_date")
        try:
            release_date = int(release_date) if release_date else None
        except Exception:
            release_date = None

        deck_compat_category = metadata.get("deck_compat_category")
        try:
            deck_compat_category = (
                int(deck_compat_category) if deck_compat_category is not None else None
            )
        except Exception:
            deck_compat_category = None
        if deck_compat_category not in {0, 1, 2, 3}:
            deck_compat_category = None

        title = self._clean_game_title(str(metadata.get("title") or ""))
        description = self._clean_html_text(str(metadata.get("description") or ""))
        short_description = self._clean_html_text(
            str(metadata.get("short_description") or "")
        )
        return {
            "title": title,
            "id": metadata.get("id") or title,
            "source": metadata.get("source") or "Manual",
            "source_url": str(metadata.get("source_url") or ""),
            "description": description,
            "short_description": short_description or description,
            "developers": clean_people(metadata.get("developers")),
            "publishers": clean_people(metadata.get("publishers")),
            "release_date": release_date,
            "rating": rating,
            "deck_compat_category": deck_compat_category,
            "store_categories": categories,
            "genres": [
                str(value).strip()
                for value in metadata.get("genres") or []
                if str(value).strip()
            ],
            "features": [
                str(value).strip()
                for value in metadata.get("features") or []
                if str(value).strip()
            ],
            "screenshots": self._sanitize_screenshots(metadata.get("screenshots")),
            "steam_appid": self._safe_int(metadata.get("steam_appid")),
            "steam_store_url": self._https_url(str(metadata.get("steam_store_url") or "")),
            "steam_news": self._sanitize_steam_news(metadata.get("steam_news")),
            "steam_news_enriched_at": int(
                self._as_number(metadata.get("steam_news_enriched_at"), 0)
            ),
        }

    def _metadata_with_steam_news_sync(
        self, metadata: dict[str, Any], title: str, limit: int = 6
    ) -> dict[str, Any]:
        if not isinstance(metadata, dict):
            return metadata
        clean_title = self._clean_game_title(title or str(metadata.get("title") or ""))
        if not clean_title:
            return self._sanitize_metadata(metadata)
        steam_appid, steam_store_url, steam_news = self._steam_news_for_metadata(
            metadata,
            clean_title,
            limit=limit,
        )
        next_metadata = dict(metadata)
        if steam_appid:
            next_metadata["steam_appid"] = steam_appid
            deck_compat_category = self._steam_deck_compat_for_appid(steam_appid)
            if deck_compat_category is not None:
                next_metadata["deck_compat_category"] = deck_compat_category
            steam_details = self._steam_appdetails_for_appid(steam_appid)
            if steam_details:
                for key, value in steam_details.items():
                    if value:
                        next_metadata[key] = value
                next_metadata["source"] = "Steam"
        if steam_store_url:
            next_metadata["steam_store_url"] = steam_store_url
        if steam_news:
            next_metadata["steam_news"] = steam_news
            next_metadata["steam_news_enriched_at"] = now()
        else:
            next_metadata["steam_news"] = self._sanitize_steam_news(next_metadata.get("steam_news"))
            next_metadata["steam_news_enriched_at"] = int(
                self._as_number(next_metadata.get("steam_news_enriched_at"), 0)
            )
        return self._sanitize_metadata(next_metadata)

    def _steam_news_for_metadata(
        self,
        metadata: dict[str, Any],
        title: str,
        limit: int = 6,
    ) -> tuple[int | None, str, list[dict[str, Any]]]:
        steam_appid = self._safe_int(metadata.get("steam_appid"))
        steam_store_url = self._https_url(str(metadata.get("steam_store_url") or ""))
        if not steam_appid:
            steam_appid, steam_store_url = self._resolve_steam_appid_for_title(title, metadata)
        if not steam_appid:
            return None, "", []
        news = self._steam_news_for_appid(steam_appid, title, limit=limit)
        return steam_appid, steam_store_url or STEAM_STORE_APP_URL.format(appid=steam_appid), news

    def _steam_event_json(self, value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            return value
        if not isinstance(value, str) or not value.strip():
            return {}
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    def _steam_localized_value(self, value: Any) -> str:
        if isinstance(value, list):
            for item in value:
                if isinstance(item, str) and item.strip():
                    return item.strip()
            return ""
        if isinstance(value, dict):
            for key in ("0", "english", "en", 0):
                item = value.get(key)
                if isinstance(item, str) and item.strip():
                    return item.strip()
            for item in value.values():
                if isinstance(item, str) and item.strip():
                    return item.strip()
            return ""
        return str(value or "").strip()

    def _steam_event_clan_id(self, event: dict[str, Any]) -> str:
        announcement = event.get("announcement_body") if isinstance(event.get("announcement_body"), dict) else {}
        for value in (
            announcement.get("clanid"),
            announcement.get("clan_id"),
            event.get("clanid"),
            event.get("clan_id"),
            event.get("clan_account_id"),
        ):
            digits = re.sub(r"[^0-9]", "", str(value or ""))
            if digits:
                return digits
        return ""

    def _steam_partner_asset_url(self, raw: str, clan_id: str = "") -> str:
        value = urllib.parse.unquote(html.unescape(str(raw or ""))).strip().strip('"\'')
        if not value:
            return ""
        value = value.replace("\\/", "/")
        value = re.sub(r"\[/img\].*$", "", value, flags=re.I).strip()
        value = re.sub(r"[\]\)>.,;]+$", "", value).strip()
        clan_match = re.match(r"\{STEAM_CLAN(?:_[A-Z]+)*_?IMAGE\}/(\d+)/([^\s<>\)\]\[]+)", value, re.I)
        if clan_match:
            return f"https://clan.cloudflare.steamstatic.com/images/{clan_match.group(1)}/{clan_match.group(2)}"
        if re.match(r"^(?:https?:)?//", value, re.I):
            return self._https_url(value)
        # Steam partner-event JSON often stores only the asset filename in
        # localized_*_image fields. Rebuild the CDN URL from the announcement clan id.
        if clan_id and re.search(r"\.(?:jpg|jpeg|png|webp|gif|avif)(?:[?#].*)?$", value, re.I):
            return f"https://clan.cloudflare.steamstatic.com/images/{clan_id}/{value.lstrip('/')}"
        return ""

    def _steam_news_image_candidates(self, contents: str, steam_appid: int = 0) -> list[str]:
        text = urllib.parse.unquote(html.unescape(str(contents or ""))).replace("\\/", "/")
        if not text:
            return []

        candidates: list[tuple[int, int, str]] = []

        def add(raw: str, position: int = 0, context: str = "", base_score: int = 0) -> None:
            url = self._steam_partner_asset_url(str(raw or "")) or self._https_url(str(raw or "").strip())
            if not url:
                return
            haystack = f"{url} {context}".casefold()
            score = base_score
            # Steam BBCode bodies often start with decorative bars, logos, or small
            # separators. The real Activity preview art is usually the content image
            # attached around headings such as roadmap/calendar/update/image below.
            positive_tokens = (
                "roadmap", "calendar", "schedule", "content", "update", "patch",
                "feature", "features", "event", "events", "challenge", "dlc",
                "preview", "screenshot", "image below", "new content", "release",
            )
            negative_tokens = (
                "divider", "separator", "spacer", "line", "border", "footer",
                "headerbar", "header_bar", "logo", "icon", "avatar", "button",
                "bullet", "store_capsule", "small_capsule", "capsule_sm", "discord",
            )
            for token in positive_tokens:
                if token in haystack:
                    score += 90
            for token in negative_tokens:
                if token in haystack:
                    score -= 120
            if re.search(r"(?:1920|1600|1280|1200|1080|800|720|roadmap|calendar|wide)", haystack, re.I):
                score += 20
            # If several body images are present, do not let the first tiny/decorative
            # asset always win. Real article artwork often appears after intro text.
            score += min(position // 500, 20)
            candidates.append((score, position, url))

        preview_youtube = re.search(r"\[previewyoutube=([A-Za-z0-9_-]{11})(?:;[^\]]*)?\]", text, re.I)
        if preview_youtube:
            add(f"https://i.ytimg.com/vi/{preview_youtube.group(1)}/hqdefault.jpg", preview_youtube.start(), "youtube preview", 45)

        patterns = [
            r"\{STEAM_CLAN(?:_[A-Z]+)*_?IMAGE\}/\d+/[^\s<>\)\]\[]+\.(?:jpg|jpeg|png|webp|gif|avif)(?:[?#][^\s<>\)\]\[]*)?",
            r'<img[^>]+src=["\']([^"\']+)["\']',
            r'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image|image)["\'][^>]+content=["\']([^"\']+)["\']',
            r"\[img\]([^\[]+)\[/img\]",
            r"((?:https?:)?//[^\s<>\)]+\.(?:jpg|jpeg|png|webp|gif|avif))(?:[?&][^\s<>\)]*)?",
        ]
        for pattern in patterns:
            for match in re.finditer(pattern, text, re.I | re.S):
                raw = match.group(1) if match.lastindex else match.group(0)
                context = text[max(0, match.start() - 260): min(len(text), match.end() + 260)]
                add(raw, match.start(), context, 50)

        ordered: list[str] = []
        seen: set[str] = set()
        for _score, _pos, url in sorted(candidates, key=lambda row: (-row[0], row[1])):
            if url not in seen:
                seen.add(url)
                ordered.append(url)
        return ordered

    def _steam_partner_event_images(self, event: dict[str, Any], steam_appid: int) -> list[str]:
        jsondata = self._steam_event_json(event.get("jsondata"))
        clan_id = self._steam_event_clan_id(event)
        announcement = event.get("announcement_body") if isinstance(event.get("announcement_body"), dict) else {}
        body = str((announcement or {}).get("body") or event.get("event_notes") or "")

        images: list[str] = []
        seen: set[str] = set()

        def add(raw: Any) -> None:
            raw_value = self._steam_localized_value(raw)
            if not raw_value:
                return
            # raw_value can be a complete body fragment, a Steam clan placeholder,
            # or a bare asset filename from localized_*_image.
            expanded = self._steam_news_image_candidates(str(raw_value), steam_appid)
            if not expanded:
                direct = self._steam_partner_asset_url(str(raw_value), clan_id) or self._https_url(str(raw_value).strip())
                expanded = [direct] if direct else []
            for url in expanded:
                if url and url not in seen:
                    seen.add(url)
                    images.append(url)

        # Prefer images embedded in the actual announcement body for Activity cards:
        # for many Steam events, localized_title/capsule assets are generic headers,
        # while the body [img] is the article artwork shown in the full native viewer.
        add(body)
        candidates = [
            jsondata.get("localized_capsule_image"),
            jsondata.get("localized_spotlight_image"),
            jsondata.get("localized_title_image"),
            jsondata.get("localized_header_image"),
            event.get("image"),
            event.get("capsule"),
            event.get("capsule_image"),
            event.get("header_image_url"),
            event.get("preview_image_url"),
        ]
        if announcement:
            candidates.extend([
                announcement.get("image"),
                announcement.get("capsule"),
                announcement.get("capsule_image"),
            ])
        for candidate in candidates:
            add(candidate)
        return images

    def _steam_partner_event_image(self, event: dict[str, Any], steam_appid: int) -> str:
        images = self._steam_partner_event_images(event, steam_appid)
        return images[0] if images else ""

    def _steam_deck_compat_for_appid(self, steam_appid: int) -> int | None:
        try:
            appid = int(steam_appid)
        except Exception:
            return None
        if appid <= 0:
            return None

        params = urllib.parse.urlencode({"nAppID": appid, "l": "english"})
        try:
            payload = self._http_json(f"{STEAM_DECK_COMPAT_URL}?{params}", timeout=12)
            if not isinstance(payload, dict):
                raise ValueError("unexpected deck compatibility payload")
            results = payload.get("results")
            if not isinstance(results, dict):
                raise ValueError("missing deck compatibility results")
            category = int(results.get("resolved_category"))
        except Exception:
            _plog(
                "steam",
                "deck compat fetch failed",
                level=logging.WARNING,
                exc=True,
                steam_appid=appid,
            )
            return None

        if category not in {0, 1, 2, 3}:
            return None
        _plog(
            "steam",
            "deck compat resolved",
            level=logging.DEBUG,
            steam_appid=appid,
            category=category,
        )
        return category

    def _steam_appdetails_for_appid(self, steam_appid: int) -> dict[str, Any] | None:
        try:
            appid = int(steam_appid)
        except Exception:
            return None
        if appid <= 0:
            return None

        try:
            params = urllib.parse.urlencode({"appids": appid, "l": "english"})
            payload = self._http_json(f"{STEAM_APP_DETAILS_URL}?{params}", timeout=12)
            app_payload = payload.get(str(appid)) if isinstance(payload, dict) else None
            if not isinstance(app_payload, dict) or not app_payload.get("success"):
                return None
            data = app_payload.get("data")
            if not isinstance(data, dict):
                return None

            details: dict[str, Any] = {}

            title = str(data.get("name") or "").strip()
            if title:
                details["title"] = title

            description = self._clean_html_text(
                str(
                    data.get("detailed_description")
                    or data.get("about_the_game")
                    or data.get("short_description")
                    or ""
                )
            )
            if description:
                details["description"] = description

            short_description = self._clean_html_text(
                str(data.get("short_description") or "")
            )
            if short_description:
                details["short_description"] = short_description

            developers = [
                {"name": str(name).strip(), "url": ""}
                for name in (data.get("developers") or [])
                if str(name).strip()
            ]
            if developers:
                details["developers"] = developers

            publishers = [
                {"name": str(name).strip(), "url": ""}
                for name in (data.get("publishers") or [])
                if str(name).strip()
            ]
            if publishers:
                details["publishers"] = publishers

            genres = [
                str(genre.get("description") or "").strip()
                for genre in (data.get("genres") or [])
                if isinstance(genre, dict) and str(genre.get("description") or "").strip()
            ]
            if genres:
                details["genres"] = genres

            release_date = data.get("release_date") or {}
            if isinstance(release_date, dict):
                release_epoch = self._date_to_epoch(release_date.get("date"))
                if release_epoch > 0:
                    details["release_date"] = release_epoch

            metacritic = data.get("metacritic") or {}
            if isinstance(metacritic, dict):
                rating = self._rating_to_percent(metacritic.get("score"))
                if rating is not None:
                    details["rating"] = rating

            store_categories = [
                category_id
                for category_id in (
                    self._safe_int(category.get("id"))
                    for category in (data.get("categories") or [])
                    if isinstance(category, dict)
                )
                if category_id
            ]
            if store_categories:
                details["store_categories"] = store_categories

            screenshots = self._sanitize_screenshots(
                [
                    {
                        "id": screenshot.get("id"),
                        "url": screenshot.get("path_full"),
                        "thumbnail": screenshot.get("path_thumbnail"),
                    }
                    for screenshot in (data.get("screenshots") or [])
                    if isinstance(screenshot, dict) and screenshot.get("path_full")
                ]
            )
            if screenshots:
                details["screenshots"] = screenshots

            _plog(
                "steam",
                "appdetails resolved",
                level=logging.DEBUG,
                steam_appid=appid,
                name=title,
            )
            return details or None
        except Exception:
            _plog(
                "steam",
                "appdetails fetch failed",
                level=logging.WARNING,
                exc=True,
                steam_appid=appid,
            )
            return None

    def _steam_partner_events_for_appid(self, steam_appid: int, limit: int = 10) -> list[dict[str, Any]]:
        params = urllib.parse.urlencode(
            {
                "appid": int(steam_appid),
                "offset": 0,
                "count": max(10, min(int(limit or 10) * 3, 50)),
                "l": "english",
                "origin": "https://store.steampowered.com",
            }
        )
        try:
            payload = self._http_json(f"{STEAM_EVENTS_URL}?{params}", timeout=12)
        except Exception as error:
            decky.logger.error(f"Failed Steam partner events fetch for {steam_appid}: {error}")
            return []
        events = payload.get("events") if isinstance(payload, dict) else []
        if not isinstance(events, list):
            return []
        rows: list[dict[str, Any]] = []
        for event in events:
            if not isinstance(event, dict):
                continue
            event_type = int(self._as_number(event.get("event_type") or event.get("type"), 0))
            if event_type not in STEAM_ACTIVITY_EVENT_TYPES:
                continue
            announcement = event.get("announcement_body") if isinstance(event.get("announcement_body"), dict) else {}
            event_gid = str(event.get("gid") or "").strip()
            announcement_gid = str((announcement or {}).get("gid") or "").strip()
            gid = event_gid or announcement_gid
            title_text = self._clean_html_text(str((announcement or {}).get("headline") or event.get("event_name") or ""))
            if not gid or not title_text:
                continue
            body = str((announcement or {}).get("body") or event.get("event_notes") or "")
            date = int(self._as_number((announcement or {}).get("posttime") or event.get("rtime32_start_time") or event.get("rtime_created"), 0))
            url = (
                f"https://steamcommunity.com/games/{int(steam_appid)}/announcements/detail/{announcement_gid}"
                if announcement_gid
                else f"https://store.steampowered.com/news/app/{int(steam_appid)}/view/{event_gid}"
            )
            image_sources = self._steam_partner_event_images(event, int(steam_appid))
            rows.append(
                {
                    "id": announcement_gid or event_gid,
                    "gid": announcement_gid or event_gid,
                    "event_gid": event_gid,
                    "news_id": announcement_gid or event_gid,
                    "announcement_gid": announcement_gid or event_gid,
                    "event_type": event_type,
                    "type": event_type,
                    "title": title_text,
                    "url": self._https_url(url),
                    "summary": self._steam_news_summary(body or title_text),
                    "body": self._clean_steam_news_text(body)[:4000],
                    "raw_body": body,
                    "image": image_sources[0] if image_sources else "",
                    "image_sources": image_sources,
                    "author": "Steam",
                    "feedLabel": self._clean_html_text(str(event.get("event_type_name") or "Steam")),
                    "date": date,
                }
            )
            if len(rows) >= max(1, min(int(limit or 10), 12)):
                break
        return self._sanitize_steam_news(rows)

    def _resolve_steam_appid_for_title(
        self,
        title: str,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[int | None, str]:
        metadata = metadata or {}
        for value in (metadata.get("source_url"), metadata.get("id")):
            match = re.search(r"store\.steampowered\.com/app/(\d+)", str(value or ""), re.I)
            if match:
                appid = self._safe_int(match.group(1))
                if appid:
                    return appid, STEAM_STORE_APP_URL.format(appid=appid)
        clean_title = self._clean_game_title(title)
        if not clean_title:
            return None, ""
        try:
            params = urllib.parse.urlencode({"term": clean_title, "cc": "US", "l": "english"})
            url = f"{STEAM_STORE_SEARCH_URL}?{params}"
            last_error: Exception | None = None
            for attempt in range(3):
                try:
                    payload = self._http_json(url, timeout=12)
                    break
                except Exception as error:
                    last_error = error
                    if attempt >= 2:
                        raise
                    time.sleep(0.2 * (attempt + 1))
            else:
                raise last_error or RuntimeError("Steam store search failed")
        except Exception as error:
            decky.logger.error(f"Failed Steam store search for {clean_title}: {error}")
            return None, ""
        items = payload.get("items") if isinstance(payload, dict) else []
        if not isinstance(items, list):
            return None, ""
        normalised_query = self._normalise_match_title(clean_title)
        best: tuple[int, int, str, str] | None = None
        for index, item in enumerate(items[:12]):
            if not isinstance(item, dict):
                continue
            appid = self._safe_int(item.get("id") or item.get("appid"))
            name = self._clean_game_title(str(item.get("name") or ""))
            if not appid or not name:
                continue
            score = 0
            normalised_name = self._normalise_match_title(name)
            if not normalised_name or not self._distinctive_tokens_present(normalised_query, normalised_name):
                continue
            if normalised_name == normalised_query:
                score += 1000
            else:
                ratio = difflib.SequenceMatcher(None, normalised_query, normalised_name).ratio()
                if ratio < 0.72:
                    continue
                score += int(ratio * 500)
            if self._is_non_primary_steam_title(name):
                score -= 800
            query_numbers = set(re.findall(r"\d+", normalised_query))
            candidate_numbers = set(re.findall(r"\d+", normalised_name))
            if candidate_numbers - query_numbers:
                score -= 120
            score -= index * 5
            url = STEAM_STORE_APP_URL.format(appid=appid)
            row = (score, appid, url, name)
            if not best or row[0] > best[0]:
                best = row
        if not best or best[0] < 300:
            return None, ""
        return best[1], best[2]

    def _parse_delisted_html(self, html_text: str) -> list[list[Any]]:
        pattern = re.compile(
            r"href='https://steam-tracker\.com/app/(\d+)/'[^>]*>\s*([^<]+?)\s*</a>",
            re.I,
        )
        rows: list[list[Any]] = []
        seen: set[int] = set()
        for match in pattern.finditer(str(html_text or "")):
            appid = self._safe_int(match.group(1))
            name = html.unescape(match.group(2)).strip()
            if not appid or not name or appid in seen:
                continue
            seen.add(appid)
            rows.append([appid, name])
        return rows

    def _delisted_index_path(self) -> str:
        settings_dir = Path(getattr(self, "_settings_dir", Path(decky.DECKY_PLUGIN_SETTINGS_DIR)))
        return str(settings_dir / DELISTED_INDEX_FILENAME)

    def _download_delisted_index_sync(self) -> dict[str, Any] | None:
        try:
            text = self._http_text(STEAM_TRACKER_DELISTED_URL, timeout=30)
            if len(text.encode("utf-8", errors="ignore")) > DELISTED_INDEX_MAX_BYTES:
                _plog(
                    "steam",
                    "delisted index download exceeded size cap",
                    level=logging.WARNING,
                    bytes=len(text),
                    max_bytes=DELISTED_INDEX_MAX_BYTES,
                )
                return None
            apps = self._parse_delisted_html(text)
            if len(apps) < 100:
                _plog(
                    "steam",
                    "delisted index parse returned implausible count",
                    level=logging.WARNING,
                    count=len(apps),
                )
                return None
            return {
                "fetched_at": now(),
                "source": STEAM_TRACKER_DELISTED_URL,
                "apps": apps,
            }
        except Exception as error:
            _plog("steam", "failed to download delisted index", level=logging.WARNING, error=error)
            return None

    def _save_delisted_index_sync(self, index: dict[str, Any]) -> None:
        path = Path(self._delisted_index_path())
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            temp_path = path.with_name(f"{path.name}.tmp")
            temp_path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
            os.replace(temp_path, path)
        except Exception as error:
            _plog("steam", "failed to save delisted index", level=logging.WARNING, path=path, error=error)

    def _load_delisted_index_sync(self) -> dict[str, Any] | None:
        path = Path(self._delisted_index_path())
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None
        if not isinstance(payload, dict):
            return None
        apps = payload.get("apps")
        if not isinstance(apps, list):
            return None
        cleaned_apps: list[list[Any]] = []
        for row in apps:
            if not isinstance(row, (list, tuple)) or len(row) < 2:
                continue
            appid = self._safe_int(row[0])
            name = self._clean_game_title(str(row[1] or ""))
            if appid and name:
                cleaned_apps.append([appid, name])
        if not cleaned_apps:
            return None
        return {
            "fetched_at": self._safe_int(payload.get("fetched_at")) or 0,
            "source": str(payload.get("source") or STEAM_TRACKER_DELISTED_URL),
            "apps": cleaned_apps,
        }

    def _delisted_index_is_fresh(self, index: dict[str, Any] | None) -> bool:
        if not isinstance(index, dict):
            return False
        fetched_at = self._safe_int(index.get("fetched_at")) or 0
        return bool(fetched_at and now() - fetched_at < DELISTED_INDEX_TTL_SECONDS)

    def _ensure_delisted_index_sync(self, force: bool = False) -> dict[str, Any] | None:
        memory_index = getattr(self, "_delisted_index", None)
        if isinstance(memory_index, dict) and not force and self._delisted_index_is_fresh(memory_index):
            return memory_index

        disk_index = self._load_delisted_index_sync()
        if isinstance(disk_index, dict) and not force and self._delisted_index_is_fresh(disk_index):
            self._delisted_index = disk_index
            return disk_index

        downloaded = self._download_delisted_index_sync()
        if isinstance(downloaded, dict):
            self._save_delisted_index_sync(downloaded)
            self._delisted_index = downloaded
            return downloaded

        fallback = disk_index if isinstance(disk_index, dict) else memory_index
        if isinstance(fallback, dict):
            self._delisted_index = fallback
            return fallback
        return None

    def _resolve_delisted_appid_for_title(self, title: str) -> int:
        index = self._ensure_delisted_index_sync(False)
        apps = index.get("apps") if isinstance(index, dict) else None
        if not isinstance(apps, list) or not apps:
            return 0
        clean = self._clean_game_title(title)
        if not clean:
            return 0
        query = self._normalise_match_title(clean)
        if not query:
            return 0
        best: tuple[int, int, str] | None = None
        query_numbers = set(re.findall(r"\d+", query))
        for row in apps:
            if not isinstance(row, (list, tuple)) or len(row) < 2:
                continue
            appid = self._safe_int(row[0])
            name = self._clean_game_title(str(row[1] or ""))
            if not appid or not name:
                continue
            candidate = self._normalise_match_title(name)
            if not candidate or not self._distinctive_tokens_present(query, candidate):
                continue
            if candidate == query:
                score = 1000
            else:
                ratio = difflib.SequenceMatcher(None, query, candidate).ratio()
                if ratio < 0.72:
                    continue
                score = int(ratio * 500)
            if self._is_non_primary_steam_title(name):
                score -= 800
            candidate_numbers = set(re.findall(r"\d+", candidate))
            if candidate_numbers - query_numbers:
                score -= 120
            row_score = (score, appid, name)
            if not best or row_score[0] > best[0]:
                best = row_score
        if not best or best[0] < 300:
            return 0
        return best[1]

    def _steam_news_for_appid(self, steam_appid: int, title: str = "", limit: int = 6) -> list[dict[str, Any]]:
        partner_events = self._steam_partner_events_for_appid(steam_appid, limit=max(limit or 6, 10))
        if partner_events:
            return partner_events
        params = urllib.parse.urlencode(
            {
                "appid": int(steam_appid),
                "count": max(1, min(int(limit or 6), 10)),
                "maxlength": 600,
                "format": "json",
                "feeds": "steam_community_announcements,steam_community_announcements_koreana,steam_community_announcements_japanese,steam_community_announcements_schinese,steam_community_announcements_tchinese,steam_community_announcements_french,steam_community_announcements_german,steam_community_announcements_spanish,steam_community_announcements_italian,steam_community_announcements_polish,steam_community_announcements_portuguese,steam_community_announcements_russian",
            }
        )
        try:
            payload = self._http_json(f"{STEAM_NEWS_URL}?{params}", timeout=12)
        except Exception as error:
            decky.logger.error(f"Failed Steam news fetch for {steam_appid}: {error}")
            return []
        newsitems = (((payload or {}).get("appnews") or {}).get("newsitems") or []) if isinstance(payload, dict) else []
        rows: list[dict[str, Any]] = []
        for item in newsitems:
            if not isinstance(item, dict):
                continue
            url = self._https_url(str(item.get("url") or ""))
            title_text = self._clean_html_text(str(item.get("title") or ""))
            if not url or not title_text:
                continue
            contents = str(item.get("contents") or "")
            image_sources = self._steam_news_image_candidates(contents, int(steam_appid))
            image_url = image_sources[0] if image_sources else ""
            if not image_url:
                image_url = self._steam_announcement_page_image(url)
                if image_url:
                    image_sources = [image_url]
            # Keep image empty when the news item has no real embedded artwork.
            # The frontend/native event model has its own explicit fallback image,
            # but storing the generic app header here makes every item look the same.
            gid = str(item.get("gid") or "").strip()
            rows.append(
                {
                    "id": gid or url,
                    "gid": gid,
                    "news_id": gid,
                    "announcement_gid": gid,
                    "event_type": 28,
                    "type": 28,
                    "title": title_text,
                    "url": url,
                    "summary": self._steam_news_summary(contents),
                    "body": self._clean_steam_news_text(contents)[:4000],
                    "raw_body": contents,
                    "image": image_url,
                    "image_sources": image_sources,
                    "author": self._clean_html_text(str(item.get("author") or "")),
                    "feedLabel": self._clean_html_text(str(item.get("feedlabel") or item.get("feedname") or "Steam News")),
                    "date": int(self._as_number(item.get("date"), 0)),
                }
            )
        return self._sanitize_steam_news(rows)

    def _steam_news_image(self, contents: str, steam_appid: int = 0) -> str:
        images = self._steam_news_image_candidates(contents, steam_appid)
        return images[0] if images else ""

    def _steam_announcement_page_image(self, url: str) -> str:
        url = self._https_url(str(url or ""))
        if not url:
            return ""
        try:
            text = self._http_text(url, timeout=7)
        except Exception:
            return ""
        text = urllib.parse.unquote(html.unescape(str(text or ""))).replace("\\/", "/")
        patterns = [
            r'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image|image)["\'][^>]+content=["\']([^"\']+)["\']',
            r'<link[^>]+rel=["\']image_src["\'][^>]+href=["\']([^"\']+)["\']',
            r'background-image\s*:\s*url\(["\']?([^"\')]+)["\']?\)',
            r'\{STEAM_CLAN(?:_[A-Z]+)*_?IMAGE\}/\d+/[^\s<>\)\]\[]+\.(?:jpg|jpeg|png|webp|gif|avif)(?:[?#][^\s<>\)\]\[]*)?',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.I | re.S)
            if not match:
                continue
            raw = match.group(1) if match.lastindex else match.group(0)
            raw = str(raw or "").strip().strip('"\'')
            raw = re.sub(r"\[/img\].*$", "", raw, flags=re.I).strip()
            raw = re.sub(r"[\]\)>.,;]+$", "", raw).strip()
            clan_match = re.match(r"\{STEAM_CLAN(?:_[A-Z]+)*_?IMAGE\}/(\d+)/([^\s<>\)\]\[]+)", raw, re.I)
            if clan_match:
                return f"https://clan.cloudflare.steamstatic.com/images/{clan_match.group(1)}/{clan_match.group(2)}"
            image = self._https_url(raw)
            if image:
                return image
        return ""

    def _clean_steam_news_text(self, value: str) -> str:
        text = urllib.parse.unquote(html.unescape(str(value or ""))).replace("\\/", "/")
        text = re.sub(r"\[previewyoutube=[A-Za-z0-9_-]{11}(?:;[^\]]*)?\]\s*\[/previewyoutube\]", " ", text, flags=re.I)
        text = re.sub(r"\[previewyoutube=[^\]]+\]", " ", text, flags=re.I)
        text = re.sub(
            r"\{STEAM_CLAN(?:_[A-Z]+)*_?IMAGE\}\/\d+\/[^\s<>\)\]\[]+",
            " ",
            text,
            flags=re.I,
        )
        text = re.sub(r"\[img\][\s\S]*?\[/img\]", " ", text, flags=re.I)
        text = re.sub(r"\[url=([^\]]+)\]([\s\S]*?)\[/url\]", r"\2", text, flags=re.I)
        text = re.sub(r"\[list\][\s\S]*?\[/list\]", lambda m: re.sub(r"\[/?(?:list|\*)[^\]]*\]", " ", m.group(0), flags=re.I), text, flags=re.I)
        text = re.sub(
            r"\[/?(?:p|br|hr|quote|spoiler|table|tr|td|th|img|url|h1|h2|h3|h4|b|i|u|s|strike|list|\*|code|noparse|previewyoutube|video|youtube|size|color|font|center|left|right)[^\]]*\]",
            " ",
            text,
            flags=re.I,
        )
        text = re.sub(r"<br\s*/?>", " ", text, flags=re.I)
        text = self._clean_html_text(text)
        return re.sub(r"\s+", " ", text).strip()

    def _steam_news_raw_body(self, value: str) -> str:
        text = urllib.parse.unquote(html.unescape(str(value or ""))).replace("\\/", "/").strip()
        # Steam's native event renderer understands Steam BBCode. Keep links,
        # images and previewyoutube blocks intact for the detail viewer, but
        # normalize paragraph-only noise and clamp to a sane size so metadata
        # files cannot grow without bound.
        text = re.sub(r"\s+", " ", text) if len(text) < 4000 else text
        return text[:16000].strip()

    def _steam_news_summary(self, contents: str) -> str:
        return self._clean_steam_news_text(contents)[:600]

    def _ign_images_to_screenshots(self, game: dict[str, Any]) -> list[dict[str, Any]]:
        images: list[dict[str, Any]] = []
        primary_id = str((game.get("primaryImage") or {}).get("id") or "")
        edges = ((game.get("images") or {}).get("edges") or [])[:30]
        for edge in edges:
            node = (edge or {}).get("node") or {}
            if not isinstance(node, dict):
                continue
            url = str(node.get("url") or "").strip()
            if not url:
                continue
            width = int(self._as_number(node.get("width"), 0))
            height = int(self._as_number(node.get("height"), 0))
            if node.get("state") and str(node.get("state")).casefold() != "published":
                continue
            # Prefer actual wide screenshots over box art/covers.
            if width and height and width < height:
                continue
            if primary_id and str(node.get("id") or "") == primary_id and width <= height:
                continue
            images.append(
                {
                    "id": str(node.get("id") or url),
                    "url": self._https_url(url),
                    "caption": self._clean_html_text(str(node.get("caption") or "")),
                    "width": width,
                    "height": height,
                }
            )
            if len(images) >= 30:
                break
        return self._sanitize_screenshots(images)

    def _sanitize_screenshots(self, values: Any) -> list[dict[str, Any]]:
        screenshots: list[dict[str, Any]] = []
        if not isinstance(values, list):
            return screenshots
        seen: set[str] = set()
        for item in values:
            if not isinstance(item, dict):
                continue
            url = self._https_url(str(item.get("url") or "").strip())
            if not url or url in seen:
                continue
            seen.add(url)
            row = {
                "id": str(item.get("id") or url),
                "url": url,
                "caption": self._clean_html_text(str(item.get("caption") or "")),
                "width": int(self._as_number(item.get("width"), 0)),
                "height": int(self._as_number(item.get("height"), 0)),
            }
            author = self._clean_html_text(str(item.get("author") or ""))
            if author:
                row["author"] = author
            link = self._https_url(str(item.get("link") or "").strip())
            if link:
                row["link"] = link
            screenshots.append(row)
            if len(screenshots) >= 30:
                break
        return screenshots

    def _sanitize_videos(self, values: Any) -> list[dict[str, Any]]:
        videos: list[dict[str, Any]] = []
        if not isinstance(values, list):
            return videos
        seen: set[str] = set()
        for item in values:
            if not isinstance(item, dict):
                continue
            video_id = str(item.get("id") or item.get("youtube_id") or "").strip()
            if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id) or video_id in seen:
                continue
            seen.add(video_id)
            videos.append(
                {
                    "id": video_id,
                    "title": self._clean_html_text(str(item.get("title") or "")),
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                    "thumbnail": self._https_url(
                        str(item.get("thumbnail") or "").strip()
                    )
                    or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                    "source": str(item.get("source") or "YouTube"),
                }
            )
            if len(videos) >= 10:
                break
        return videos

    def _sanitize_steam_news(self, values: Any) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        if not isinstance(values, list):
            return rows
        seen: set[str] = set()
        for item in values:
            if not isinstance(item, dict):
                continue
            raw_gid = str(item.get("gid") or item.get("news_id") or item.get("announcement_gid") or item.get("event_gid") or "").strip()
            raw_id = str(item.get("id") or raw_gid or item.get("url") or "").strip()
            title = self._clean_steam_news_text(str(item.get("title") or ""))
            url = self._https_url(str(item.get("url") or "").strip())
            if not title or not url:
                continue
            event_type = int(self._as_number(item.get("event_type") or item.get("type"), 28))
            raw_body_source = str(item.get("raw_body") or item.get("body") or item.get("description") or item.get("contents") or "")
            raw_body = self._steam_news_raw_body(raw_body_source)
            canonical_url = re.sub(r"[?#].*$", "", url).casefold()
            clean_summary = "" if event_type == 12 else self._clean_steam_news_text(str(item.get("summary") or item.get("contents") or raw_body_source or ""))
            summary_key = clean_summary[:180].casefold()
            title_key = title.casefold()
            date_key = str(int(self._as_number(item.get("date"), 0)) // 86400)
            key = f"{title_key}|{canonical_url or date_key}|{summary_key}"
            if key in seen:
                continue
            seen.add(key)
            raw_sources = item.get("image_sources") if isinstance(item.get("image_sources"), list) else []
            image_sources: list[str] = []
            for candidate in [*raw_sources, item.get("image"), item.get("image_url"), item.get("preview_image_url")]:
                for image in self._steam_news_image_candidates(str(candidate or ""), 0) or [self._https_url(str(candidate or "").strip())]:
                    if image and image not in image_sources:
                        image_sources.append(image)
            if not image_sources:
                image_sources = self._steam_news_image_candidates(raw_body_source, 0)
            rows.append(
                {
                    "id": raw_id or url,
                    "gid": raw_gid,
                    "news_id": raw_gid,
                    "announcement_gid": str(item.get("announcement_gid") or raw_gid).strip(),
                    "event_gid": str(item.get("event_gid") or raw_gid).strip(),
                    "event_type": event_type,
                    "type": event_type,
                    "title": title,
                    "url": url,
                    "summary": clean_summary[:900],
                    "body": self._clean_steam_news_text(raw_body_source or clean_summary)[:4000],
                    "raw_body": raw_body,
                    "image": image_sources[0] if image_sources else "",
                    "image_sources": image_sources,
                    "author": self._clean_html_text(str(item.get("author") or "")),
                    "feedLabel": self._clean_html_text(str(item.get("feedLabel") or item.get("feedlabel") or item.get("feedname") or "Steam News")),
                    "date": int(self._as_number(item.get("date"), 0)),
                }
            )
            if len(rows) >= 12:
                break
        return rows

    def _youtube_videos_for_title(
        self, title: str, limit: int = 10
    ) -> list[dict[str, Any]]:
        query = f"{self._clean_game_title(title)} game trailer gameplay"
        url = f"{YOUTUBE_SEARCH_URL}?{urllib.parse.urlencode({'search_query': query})}"
        try:
            text = self._http_text(url, timeout=20)
        except Exception as error:
            decky.logger.error(f"Failed loading YouTube videos for {title}: {error}")
            return []
        videos: list[dict[str, Any]] = []
        seen: set[str] = set()
        for match in re.finditer(r'"videoId":"([A-Za-z0-9_-]{11})"', text):
            video_id = match.group(1)
            if video_id in seen:
                continue
            seen.add(video_id)
            window = text[match.start() : match.start() + 1600]
            title_match = re.search(
                r'"title":\{"runs":\[\{"text":"([^"]+)"', window
            ) or re.search(r'"title":\{"simpleText":"([^"]+)"', window)
            video_title = self._jsonish_unescape(title_match.group(1)) if title_match else ""
            videos.append(
                {
                    "id": video_id,
                    "title": self._clean_html_text(video_title)
                    or f"{self._clean_game_title(title)} video",
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                    "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                    "source": "YouTube",
                }
            )
            if len(videos) >= max(1, min(limit, 10)):
                break
        return self._sanitize_videos(videos)

    def _rawg_images_for_title(
        self, title: str, source_url: str = "", limit: int = 10
    ) -> list[dict[str, Any]]:
        images: list[dict[str, Any]] = []
        for slug in self._rawg_slug_candidates(title, source_url):
            url = f"{RAWG_BASE_URL}/games/{slug}"
            try:
                text = self._http_text(url, timeout=20)
            except Exception:
                continue
            for raw in re.findall(
                r"https://media\.rawg\.io/media/(?:resize/[^\"'<>\s]+/-/)?screenshots/[^\"'<>\\\s]+?\.(?:jpg|png|webp)",
                text,
                flags=re.IGNORECASE,
            ):
                image_url = html.unescape(raw).split("&#x27;", 1)[0].split("&quot;", 1)[0]
                image_url = self._https_url(image_url)
                if not image_url:
                    continue
                images.append(
                    {
                        "id": image_url,
                        "url": image_url,
                        "caption": f"{self._clean_game_title(title)} screenshot",
                        "width": 1280,
                        "height": 720,
                    }
                )
                if len(self._sanitize_screenshots(images)) >= max(1, min(limit, 10)):
                    return self._sanitize_screenshots(images)[: max(1, min(limit, 10))]
        return self._sanitize_screenshots(images)[: max(1, min(limit, 10))]

    def _rawg_slug_candidates(self, title: str, source_url: str = "") -> list[str]:
        candidates: list[str] = []
        for value in self._slug_candidates(title):
            if value:
                candidates.append(value)
        ign_slug = self._slug_from_ign_value(source_url)
        if ign_slug:
            candidates.append(ign_slug)
        cleaned = self._clean_game_title(title)
        if cleaned.casefold().startswith("007"):
            candidates.append("james-bond-" + self._slug_candidates(cleaned)[0])
        return [candidate for candidate in dict.fromkeys(candidates) if candidate]

    def _http_text(self, url: str, timeout: int = 20) -> str:
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        context = _build_https_context()
        try:
            with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
                return response.read().decode("utf-8", errors="ignore")
        except Exception as error:
            _log_tls_verification_failure(request, error)
            raise

    @staticmethod
    def _jsonish_unescape(value: str) -> str:
        try:
            return json.loads(f'"{value}"')
        except Exception:
            return html.unescape(value.replace("\\u0026", "&"))

    @staticmethod
    def _https_url(value: str) -> str:
        text = str(value or "").strip()
        if text.startswith("//"):
            return "https:" + text
        if text.startswith("http://"):
            return "https://" + text[7:]
        return text

    def _graphql(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
        request = urllib.request.Request(
            IGN_GRAPHQL_URL,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Origin": IGN_BASE_URL,
                "Referer": f"{IGN_BASE_URL}/",
                "User-Agent": "DeckyMetadata/0.1 (+Decky Loader)",
            },
        )
        context = _build_https_context()
        try:
            with urllib.request.urlopen(request, timeout=20, context=context) as response:
                payload = json.loads(response.read().decode("utf-8", errors="ignore"))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"IGN request failed: {error.code} {detail}") from error
        except Exception as error:
            _log_tls_verification_failure(request, error)
            raise
        if payload.get("errors"):
            raise RuntimeError(f"IGN GraphQL error: {payload['errors']}")
        return payload

    @staticmethod
    def _field_is_empty(value: Any) -> bool:
        return value in (None, "", [], {})

    def _http_request_headers(self, include_auth: bool = False) -> dict[str, str]:
        headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,it;q=0.7",
            "Accept-Encoding": "identity",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Referer": "https://store.steampowered.com/",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        }
        return headers

    def _http_text_urllib(self, url: str, timeout: int = 18) -> str:
        request = urllib.request.Request(url, headers=self._http_request_headers())
        context = _build_https_context()
        _plog("http", "urllib request", level=logging.DEBUG, url=url, headers=self._http_request_headers())
        try:
            with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
                return response.read().decode("utf-8", errors="ignore")
        except Exception as error:
            _log_tls_verification_failure(request, error)
            _plog("http", "urllib request failed", level=logging.WARNING, url=url, error=error)
            raise

    def _http_text_curl(self, url: str, timeout: int = 18) -> str:
        headers = self._http_request_headers()
        command = [
            "curl",
            "-L",
            "--http1.1",
            "--compressed",
            "--silent",
            "--show-error",
            "--max-time",
            str(max(8, int(timeout or 18))),
            "--connect-timeout",
            str(max(5, min(int(timeout or 18), 12))),
            "-A",
            headers["User-Agent"],
        ]
        for key, value in headers.items():
            if key.casefold() == "user-agent":
                continue
            command.extend(["-H", f"{key}: {value}"])
        command.append(url)
        _plog("http", "curl request", level=logging.DEBUG, url=url, headers=headers)
        completed = subprocess.run(command, capture_output=True, timeout=max(10, int(timeout or 18) + 5))
        if completed.returncode != 0:
            stderr = completed.stderr.decode("utf-8", errors="ignore").strip()
            _plog("http", "curl request failed", level=logging.WARNING, url=url, returncode=completed.returncode, stderr=stderr)
            raise RuntimeError(stderr or f"curl exited {completed.returncode}")
        return completed.stdout.decode("utf-8", errors="ignore")

    def _http_text_powershell(self, url: str, timeout: int = 18) -> str:
        # Windows fallback for Decky-on-Windows. On Linux this simply fails fast
        # and the caller tries the next strategy.
        headers = self._http_request_headers()
        ps_headers = "@{" + ";".join(
            f"'{key}'='{str(value).replace(chr(39), chr(39)+chr(39))}'" for key, value in headers.items()
        ) + "}"
        script = (
            "$ProgressPreference='SilentlyContinue';"
            "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;"
            f"$headers={ps_headers};"
            f"(Invoke-WebRequest -UseBasicParsing -MaximumRedirection 5 -TimeoutSec {max(8, int(timeout or 18))} -Headers $headers -Uri '{str(url).replace(chr(39), chr(39)+chr(39))}').Content"
        )
        _plog("http", "PowerShell request", level=logging.DEBUG, url=url, headers=headers)
        completed = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True,
            timeout=max(12, int(timeout or 18) + 8),
        )
        if completed.returncode != 0:
            stderr = completed.stderr.decode("utf-8", errors="ignore").strip()
            _plog("http", "PowerShell request failed", level=logging.WARNING, url=url, returncode=completed.returncode, stderr=stderr)
            raise RuntimeError(stderr or f"PowerShell exited {completed.returncode}")
        return completed.stdout.decode("utf-8", errors="ignore")


    def _http_json(
        self,
        url: str,
        timeout: int = 20,
        method: str = "GET",
        body: Any | None = None,
        headers: dict[str, str] | None = None,
    ) -> Any:
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request_headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        }
        if headers:
            request_headers.update(headers)
        request = urllib.request.Request(
            url,
            data=data,
            method=str(method or "GET").upper(),
            headers=request_headers,
        )
        context = _build_https_context()
        _plog(
            "http",
            "json request",
            level=logging.DEBUG,
            method=request.get_method(),
            url=url,
            headers=request_headers,
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
                return json.loads(response.read().decode("utf-8", errors="ignore") or "null")
        except Exception as error:
            _log_tls_verification_failure(request, error)
            _plog("http", "json request failed", level=logging.WARNING, method=request.get_method(), url=url, error=error)
            raise

    def _shortcut_for_app(self, app_id: int) -> dict[str, Any] | None:
        target = int(app_id) & 0xFFFFFFFF
        for shortcut in self._read_steam_shortcuts():
            shortcut_id = int(shortcut.get("appid") or 0) & 0xFFFFFFFF
            if shortcut_id == target:
                return shortcut
        return None



    @staticmethod
    def _normalise_match_title(title: str) -> str:
        text = html.unescape(str(title or "")).casefold()
        text = re.sub(r"[\u2122\u00ae\u00a9]", "", text)
        text = re.sub(r"\[[^\]]+\]|\([^\)]*\)", " ", text)
        text = re.sub(r"\b(the|a|an)\b", " ", text)
        text = re.sub(r"\b(remaster(ed)?|hd|definitive|ultimate|complete|goty|edition)\b", " ", text)
        text = re.sub(
            r"\b(usa|europe|eur|japan|jp|world|rev|revision|beta|proto|prototype|demo|sample|en|fr|de|es|it|pt|br|v\d+(?:\.\d+)*)\b",
            " ",
            text,
        )
        text = re.sub(r"[^a-z0-9]+", " ", text)
        return re.sub(r"\s+", " ", text).strip()

    @staticmethod
    def _is_non_primary_steam_title(name: str) -> bool:
        text = html.unescape(str(name or "")).casefold()
        return any(re.search(pattern, text, re.I) for pattern in NON_PRIMARY_STEAM_TITLE_PATTERNS)

    @staticmethod
    def _distinctive_tokens_present(query_norm: str, candidate_norm: str) -> bool:
        query_tokens = set(str(query_norm or "").split())
        candidate_tokens = set(str(candidate_norm or "").split())
        distinctive = {
            token
            for token in query_tokens
            if len(token) >= 3 or re.fullmatch(r"\d+", token)
        }
        return distinctive.issubset(candidate_tokens)

    @staticmethod
    def _title_match_score(target: str, candidate: str) -> float:
        if target == candidate:
            return 1.0
        target_tokens = set(target.split())
        candidate_tokens = set(candidate.split())
        if not target_tokens or not candidate_tokens:
            return 0.0
        intersection = target_tokens.intersection(candidate_tokens)
        query_coverage = len(intersection) / len(target_tokens)
        candidate_coverage = len(intersection) / len(candidate_tokens)
        token_score = query_coverage * 0.72 + candidate_coverage * 0.28
        sequence_score = difflib.SequenceMatcher(None, target, candidate).ratio()
        score = max(sequence_score, token_score)
        target_numbers = set(re.findall(r"\d+", target))
        candidate_numbers = set(re.findall(r"\d+", candidate))
        if target_numbers and candidate_numbers and not target_numbers.intersection(candidate_numbers):
            score -= 0.2
        elif target_numbers and not candidate_numbers:
            score -= 0.08
        return max(0.0, min(score, 1.0))

    def _read_steam_shortcuts(self) -> list[dict[str, Any]]:
        shortcuts: list[dict[str, Any]] = []
        seen: set[tuple[int, str, str, str]] = set()
        for base in self._steam_userdata_roots():
            if not base.exists():
                _plog("shortcuts", "Steam userdata root not found", level=logging.DEBUG, base=base)
                continue
            try:
                for user_dir in base.iterdir():
                    if not user_dir.is_dir():
                        continue
                    shortcut_file = user_dir / "config" / "shortcuts.vdf"
                    if not shortcut_file.exists() or not shortcut_file.is_file():
                        _plog("shortcuts", "Steam shortcuts file not found", level=logging.DEBUG, path=shortcut_file)
                        continue
                    extracted = self._extract_shortcuts_from_vdf(shortcut_file)
                    _plog("shortcuts", "shortcuts.vdf parsed", path=shortcut_file, count=len(extracted))
                    for shortcut in extracted:
                        name = self._clean_game_title(str(shortcut.get("name") or ""))
                        exe = str(shortcut.get("exe") or "")
                        start_dir = str(shortcut.get("start_dir") or "")
                        launch_options = str(shortcut.get("launch_options") or "")
                        shortcut_path = str(shortcut.get("shortcut_path") or "")
                        icon = str(shortcut.get("icon") or "")
                        app_id = self._normalize_shortcut_app_id(
                            shortcut.get("app_id", shortcut.get("appid")),
                            exe,
                            name,
                        )
                        dedupe_key = (app_id, name, exe, launch_options)
                        if app_id > 0 and name and dedupe_key not in seen:
                            seen.add(dedupe_key)
                            item = dict(shortcut)
                            item.update(
                                {
                                    "appid": app_id,
                                    "app_id": app_id,
                                    "name": name,
                                    "exe": exe,
                                    "start_dir": start_dir,
                                    "launch_options": launch_options,
                                    "shortcut_path": shortcut_path,
                                    "icon": icon,
                                    "source": "steam_shortcuts_vdf",
                                    "steam_user_id": user_dir.name,
                                    "shortcut_file": str(shortcut_file),
                                    "isNonSteam": True,
                                }
                            )
                            shortcuts.append(item)
            except Exception as error:
                _plog("shortcuts", "failed reading Steam shortcuts", level=logging.ERROR, exc=True, base=base, error=error)
        _plog("shortcuts", "steam shortcuts returned", count=len(shortcuts))
        return shortcuts

    def _steam_userdata_roots(self) -> list[Path]:
        if os.name == "nt":
            windows_candidates: list[Path] = []
            for env_name in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA"):
                value = os.environ.get(env_name)
                if value:
                    windows_candidates.append(Path(value) / "Steam" / "userdata")
            steam_path = self._read_windows_steam_path()
            if steam_path:
                windows_candidates.append(steam_path / "userdata")
            candidates = windows_candidates + [
                Path.home() / ".local" / "share" / "Steam" / "userdata",
                Path.home() / ".steam" / "steam" / "userdata",
            ]
        else:
            candidates = [root / "userdata" for root in self._detect_steam_roots()]

        roots: list[Path] = []
        seen: set[str] = set()
        for candidate in candidates:
            try:
                resolved = candidate.resolve()
                key = str(resolved).casefold() if os.name == "nt" else str(resolved)
                if key in seen or not resolved.is_dir():
                    continue
                roots.append(resolved)
                seen.add(key)
            except Exception as error:
                _plog("shortcuts", "skipping unreadable Steam userdata root", level=logging.DEBUG, candidate=candidate, error=error)
        return roots

    def _read_windows_steam_path(self) -> Path | None:
        try:
            import winreg

            for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
                try:
                    with winreg.OpenKey(root, r"Software\Valve\Steam") as key:
                        value, _ = winreg.QueryValueEx(key, "SteamPath")
                        if value:
                            return Path(str(value))
                except OSError:
                    continue
        except Exception:
            return None
        return None

    def _extract_shortcuts_from_vdf(self, path: Path) -> list[dict[str, Any]]:
        try:
            try:
                size = path.stat().st_size
            except Exception as error:
                _plog("shortcuts", "failed stat for shortcuts.vdf", level=logging.WARNING, path=path, error=error)
                return []
            if size <= 0:
                _plog("shortcuts", "Steam shortcuts file is empty", level=logging.DEBUG, path=path)
                return []
            if size > MAX_SHORTCUTS_VDF_BYTES:
                _plog("shortcuts", "Steam shortcuts file too large", level=logging.WARNING, path=path, size=size, cap=MAX_SHORTCUTS_VDF_BYTES)
                return []
            data = path.read_bytes()
        except Exception as error:
            _plog("shortcuts", "failed reading shortcuts.vdf", level=logging.WARNING, path=path, exc=True, error=error)
            return []
        try:
            root, _pos = self._parse_binary_vdf_object(data, 0)
            container = root.get("shortcuts", root)
            if isinstance(container, dict):
                shortcuts: list[dict[str, Any]] = []
                for value in container.values():
                    if len(shortcuts) >= MAX_SHORTCUTS_VDF_ENTRIES:
                        _plog("shortcuts", "Steam shortcuts entry cap reached", level=logging.WARNING, path=path, cap=MAX_SHORTCUTS_VDF_ENTRIES)
                        break
                    if not isinstance(value, dict):
                        continue
                    name = str(
                        self._vdf_get(value, "appname", "AppName", "name") or ""
                    ).strip()
                    exe_raw = str(self._vdf_get(value, "exe", "Exe") or "").strip()
                    exe = self._strip_surrounding_quotes(exe_raw)
                    start_dir = str(
                        self._vdf_get(value, "startdir", "StartDir") or ""
                    ).strip()
                    launch_options = str(
                        self._vdf_get(value, "launchoptions", "LaunchOptions") or ""
                    ).strip()
                    shortcut_path = str(
                        self._vdf_get(value, "shortcutpath", "ShortcutPath") or ""
                    ).strip()
                    icon = str(self._vdf_get(value, "icon", "Icon") or "").strip()
                    if name:
                        appid_raw = self._vdf_get(value, "appid", "AppID")
                        app_id = self._normalize_shortcut_app_id(appid_raw, exe, name)
                        shortcuts.append(
                            {
                                "name": name,
                                "exe": exe,
                                "exe_raw": exe_raw,
                                "start_dir": start_dir,
                                "launch_options": launch_options,
                                "shortcut_path": shortcut_path,
                                "icon": icon,
                                "appid": appid_raw,
                                "appid_raw": appid_raw,
                                "app_id": app_id,
                                "source": "steam_shortcuts_vdf",
                                "steam_user_id": self._steam_user_id_from_shortcut_path(path),
                                "shortcut_file": str(path),
                            }
                        )
                _plog("shortcuts", "binary shortcuts.vdf parsed", level=logging.DEBUG, path=path, count=len(shortcuts))
                return shortcuts
        except Exception as error:
            _plog("shortcuts", "failed parsing binary shortcuts.vdf", level=logging.WARNING, path=path, exc=True, error=error)
        text = data.decode("utf-8", errors="replace")
        names = re.findall(r"appname\x00([^\x00]+)", text, flags=re.IGNORECASE)
        exes = re.findall(r"exe\x00([^\x00]+)", text, flags=re.IGNORECASE)
        launch_options = re.findall(
            r"launchoptions\x00([^\x00]*)", text, flags=re.IGNORECASE
        )
        icons = re.findall(r"icon\x00([^\x00]*)", text, flags=re.IGNORECASE)
        shortcuts = []
        for index, name in enumerate(names[:MAX_SHORTCUTS_VDF_ENTRIES]):
            clean_name = name.strip()
            if not clean_name:
                continue
            exe_raw = exes[index].strip() if index < len(exes) else ""
            exe = self._strip_surrounding_quotes(exe_raw)
            launch_options_value = (
                launch_options[index].strip() if index < len(launch_options) else ""
            )
            app_id = self._shortcut_app_id(exe, clean_name)
            shortcuts.append(
                {
                    "name": clean_name,
                    "exe": exe,
                    "exe_raw": exe_raw,
                    "start_dir": "",
                    "launch_options": launch_options_value,
                    "shortcut_path": "",
                    "icon": icons[index].strip() if index < len(icons) else "",
                    "appid": None,
                    "appid_raw": None,
                    "app_id": app_id,
                    "source": "steam_shortcuts_vdf",
                    "steam_user_id": self._steam_user_id_from_shortcut_path(path),
                    "shortcut_file": str(path),
                }
            )
        return shortcuts

    @staticmethod
    def _vdf_get(values: dict[str, Any], *names: str) -> Any:
        lowered = {str(key).casefold(): value for key, value in values.items()}
        for name in names:
            if name.casefold() in lowered:
                return lowered[name.casefold()]
        return None

    @staticmethod
    def _strip_surrounding_quotes(value: str) -> str:
        stripped = value.strip()
        if len(stripped) >= 2 and stripped[0] == stripped[-1] == '"':
            return stripped[1:-1]
        return stripped

    @staticmethod
    def _steam_user_id_from_shortcut_path(path: Path) -> str:
        try:
            parts = path.parts
            for index, part in enumerate(parts):
                if part == "userdata" and index + 1 < len(parts):
                    return parts[index + 1]
        except Exception:
            pass
        return ""

    def _normalize_shortcut_app_id(self, value: Any, exe: str, name: str) -> int:
        if isinstance(value, int):
            return int(value) & 0xFFFFFFFF
        try:
            if value not in (None, ""):
                return int(value) & 0xFFFFFFFF
        except Exception:
            pass
        if exe or name:
            return self._shortcut_app_id(exe, name)
        return 0

    def _parse_binary_vdf_object(
        self, data: bytes, pos: int, depth: int = 0
    ) -> tuple[dict[str, Any], int]:
        if depth > MAX_SHORTCUTS_VDF_DEPTH:
            raise ValueError("binary VDF nesting depth exceeded")
        result: dict[str, Any] = {}
        while pos < len(data):
            value_type = data[pos]
            pos += 1
            if value_type == 0x08:
                break
            key, pos = self._read_vdf_cstring(data, pos)
            if value_type == 0x00:
                child, pos = self._parse_binary_vdf_object(data, pos, depth + 1)
                result[key] = child
            elif value_type == 0x01:
                value, pos = self._read_vdf_cstring(data, pos)
                result[key] = value
            elif value_type == 0x02:
                if pos + 4 > len(data):
                    break
                result[key] = int.from_bytes(data[pos : pos + 4], "little", signed=True)
                pos += 4
            elif value_type == 0x07:
                if pos + 8 > len(data):
                    break
                result[key] = int.from_bytes(data[pos : pos + 8], "little", signed=False)
                pos += 8
            else:
                break
        return result, pos

    @staticmethod
    def _read_vdf_cstring(data: bytes, pos: int) -> tuple[str, int]:
        end = data.find(b"\x00", pos)
        if end < 0:
            return "", len(data)
        return data[pos:end].decode("utf-8", errors="replace"), end + 1

    @staticmethod
    def _shortcut_app_id(exe: str, name: str) -> int:
        digest = zlib.crc32((exe + name).encode("utf-8", errors="ignore")) & 0xFFFFFFFF
        return (digest | 0x80000000) & 0xFFFFFFFF

    def _slug_candidates(self, title: str) -> list[str]:
        cleaned = self._clean_game_title(title).lower()
        replacements = {
            "&": " and ",
            "+": " plus ",
            ":": " ",
            "'": "",
            "\u2019": "",
        }
        for old, new in replacements.items():
            cleaned = cleaned.replace(old, new)
        cleaned = re.sub(r"\b(the|game of the year|goty|deluxe|ultimate|complete|edition|remastered|remaster)\b", " ", cleaned)
        words = re.findall(r"[a-z0-9]+", cleaned)
        base = "-".join(words)
        candidates = [base]
        if base.startswith("james-bond-blood-stone"):
            candidates.insert(0, "james-bond-007-blood-stone")
        if base.endswith("-game"):
            candidates.append(base[:-5])
        return [candidate for candidate in dict.fromkeys(candidates) if candidate]

    def _slug_from_ign_value(self, value: str) -> str:
        raw = str(value or "").strip()
        if not raw:
            return ""
        if raw.startswith("http"):
            parsed = urllib.parse.urlparse(raw)
            parts = [part for part in parsed.path.split("/") if part]
            if len(parts) >= 2 and parts[0] == "games":
                return parts[1]
            return ""
        raw = raw.strip("/")
        if raw.startswith("games/"):
            return raw.split("/", 1)[1].split("/", 1)[0]
        return raw.split("/", 1)[0]

    def _absolute_ign_url(self, value: str | None) -> str:
        if not value:
            return ""
        raw = str(value)
        if raw.startswith("http"):
            return raw
        if raw.startswith("/"):
            return f"{IGN_BASE_URL}{raw}"
        return f"{IGN_BASE_URL}/games/{raw}"

    def _attributes_to_people(self, values: list[Any]) -> list[dict[str, str]]:
        people: list[dict[str, str]] = []
        for value in values:
            if not isinstance(value, dict):
                continue
            name = str(value.get("name") or "").strip()
            slug = str(value.get("slug") or "").strip()
            if name:
                people.append(
                    {
                        "name": name,
                        "url": f"{IGN_BASE_URL}/games/producer/{slug}" if slug else "",
                    }
                )
        return people

    def _attributes_to_names(self, values: list[Any]) -> list[str]:
        return [
            str(value.get("name") or "").strip()
            for value in values
            if isinstance(value, dict) and str(value.get("name") or "").strip()
        ]

    def _first_release_date(self, regions: list[Any]) -> int | None:
        dates: list[str] = []
        for region in regions:
            if not isinstance(region, dict):
                continue
            for release in region.get("releases") or []:
                if isinstance(release, dict) and release.get("date"):
                    dates.append(str(release["date"]))
        if not dates:
            return None
        return self._date_to_epoch(sorted(dates)[0])

    def _infer_store_categories(self, text: str) -> list[int]:
        haystack = text.casefold()
        categories: list[int] = []
        if re.search(r"\bmmo\b", haystack) or "massively multiplayer" in haystack:
            categories.append(STORE_CATEGORY["mmo"])
        if "multiplayer" in haystack or "multi-player" in haystack:
            categories.extend(
                [STORE_CATEGORY["multiplayer"], STORE_CATEGORY["online_multiplayer"]]
            )
        if "co-op" in haystack or "coop" in haystack or "cooperative" in haystack:
            categories.extend([STORE_CATEGORY["co_op"], STORE_CATEGORY["online_co_op"]])
        if "split-screen" in haystack or "split screen" in haystack:
            categories.append(STORE_CATEGORY["split_screen"])
        if "controller" in haystack or "steam deck verified" in haystack:
            categories.append(STORE_CATEGORY["full_controller"])
        if STORE_CATEGORY["multiplayer"] not in categories and STORE_CATEGORY["mmo"] not in categories:
            categories.insert(0, STORE_CATEGORY["single_player"])
        return list(dict.fromkeys(categories))

    @staticmethod
    def _reasonable_match(query: str, title: str) -> bool:
        q = set(re.findall(r"[a-z0-9]+", query.casefold()))
        t = set(re.findall(r"[a-z0-9]+", str(title).casefold()))
        if not q or not t:
            return False
        if q.issubset(t) or t.issubset(q):
            return True
        overlap = len(q.intersection(t)) / max(len(q), 1)
        return overlap >= 0.55

    @staticmethod
    def _clean_html_text(value: str) -> str:
        text = str(value or "")
        text = re.sub(r"</p\s*>", "\n\n", text, flags=re.IGNORECASE)
        text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", "", text)
        text = html.unescape(text)
        return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", text)).strip()

    @staticmethod
    def _clean_game_title(name: str) -> str:
        text = html.unescape(str(name or ""))
        text = re.sub(r"[\u2122\u00ae\u00a9]", "", text)
        return re.sub(r"\s+", " ", text).strip()

    @staticmethod
    def _rating_to_percent(value: Any) -> int | None:
        if value is None:
            return None
        try:
            number = float(value)
        except Exception:
            return None
        if number <= 10:
            number *= 10
        return max(0, min(int(round(number)), 100))

    @staticmethod
    def _date_to_epoch(value: Any) -> int:
        if not value:
            return 0
        text = str(value).strip()
        formats = ["%Y-%m-%d", "%b %d, %Y", "%B %d, %Y", "%d %b %Y", "%d %B %Y"]
        try:
            if re.fullmatch(r"\d{4}-\d{2}-\d{2}T.*", text):
                text = text[:10]
            for fmt in formats:
                try:
                    return int(time.mktime(time.strptime(text, fmt)))
                except Exception:
                    pass
        except Exception:
            return 0
        return 0

    @staticmethod
    def _safe_int(value: Any) -> int | None:
        if value in (None, ""):
            return None
        try:
            return int(float(str(value).replace(",", "")))
        except Exception:
            return None

    @staticmethod
    def _as_number(value: Any, fallback: float) -> float:
        try:
            return float(value)
        except Exception:
            return fallback
