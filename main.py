from __future__ import annotations

import asyncio
import base64
import concurrent.futures
import http.server
import io
import difflib
import hashlib
import html
import json
import os
import re
import shutil
import ssl
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import zlib
from pathlib import Path
from typing import Any

import decky

try:
    from PIL import Image
except Exception:  # Pillow is available in Decky on most setups, but keep fallback.
    Image = None

IGN_GRAPHQL_URL = "https://mollusk.apis.ign.com/graphql"
IGN_BASE_URL = "https://www.ign.com"
RAWG_BASE_URL = "https://rawg.io"
YOUTUBE_SEARCH_URL = "https://www.youtube.com/results"
RETROACHIEVEMENTS_GAME_URL = (
    "https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php"
)
RETROACHIEVEMENTS_PROFILE_URL = (
    "https://retroachievements.org/API/API_GetUserProfile.php"
)
RETROACHIEVEMENTS_HASH_LIBRARY_URL = (
    "https://retroachievements.org/dorequest.php?r=hashlibrary"
)
RETROACHIEVEMENTS_CONSOLE_IDS_URL = (
    "https://retroachievements.org/API/API_GetConsoleIDs.php"
)
RETROACHIEVEMENTS_GAME_LIST_URL = (
    "https://retroachievements.org/API/API_GetGameList.php"
)
OPENXBL_API_BASE_URL = "https://xbl.io/api/v2"
MICROSOFT_STORE_SEARCH_URL = "https://storeedgefd.dsx.mp.microsoft.com/v9.0/pages/searchResults"
MICROSOFT_STORE_PRODUCTS_URL = "https://storeedgefd.dsx.mp.microsoft.com/v8.0/sdk/products"
MICROSOFT_DISPLAY_CATALOG_PRODUCTS_URL = "https://displaycatalog.mp.microsoft.com/v7.0/products"
TRUEACHIEVEMENTS_BASE_URL = "https://www.trueachievements.com"
STEAM_STORE_SEARCH_URL = "https://store.steampowered.com/api/storesearch/"
STEAM_NEWS_URL = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/"
STEAM_EVENTS_URL = "https://store.steampowered.com/events/ajaxgetpartnereventspageable/"
STEAM_STORE_APP_URL = "https://store.steampowered.com/app/{appid}/"
STEAM_ACTIVITY_EVENT_TYPES = {12, 13, 14, 15, 23, 24, 25, 28, 35}
ACHIEVEMENT_SOURCES = {"auto", "retroachievements", "xbox", "disabled"}
ACHIEVEMENT_CACHE_POLICIES = {"hourly", "daily", "weekly", "pc_session", "manual"}
ACHIEVEMENT_CACHE_DEFAULT_POLICY = "daily"
PLAYHUB_ACHIEVEMENT_CACHE_VERSION = 29
# Steam serves <Steam>/steamui on https://steamloopback.host/. Square cropped
# Xbox card icons are written there so Steam's UI can load them over HTTPS
# without CSP/mixed-content issues and without depending on the local proxy
# port staying alive.
PLAYHUB_LOOPBACK_ICON_SUBDIR = "playhub_xbox_icons"
PLAYHUB_LOOPBACK_BASE_URL = "https://steamloopback.host"
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
        self._data_file = self._settings_dir / "playhub_metadata.json"
        self._scan_task: asyncio.Task[Any] | None = None
        self._scan_progress = self._new_scan_progress("idle")
        self._activity_refresh_task: asyncio.Task[Any] | None = None
        self._activity_refresh_progress = self._new_scan_progress("idle")
        self._data = self._default_data()
        self._hash_library: dict[str, int] = {}
        self._ra_title_index: list[dict[str, Any]] = []
        self._plugin_dir = Path(getattr(decky, "DECKY_PLUGIN_DIR", Path(__file__).parent))
        self._ra_index_file = self._settings_dir / "retroachievements_game_index.json"
        self._ra_hash_file = self._settings_dir / "retroachievements_hash_library.json"
        self._ra_achievement_cache_file = self._settings_dir / "retroachievements_achievement_cache_v2.json"
        self._xbox_index_file = self._settings_dir / "openxbl_title_index_v9.json"
        self._xbox_achievement_cache_file = self._settings_dir / "openxbl_achievement_cache_v29.json"
        self._xbox_icon_cache_file = self._settings_dir / "trueachievements_icon_cache_v16.json"
        self._xbox_icon_dir = self._settings_dir / "trueachievements_achievement_icons"
        self._xbox_card_proxy_dir = self._settings_dir / "xbox_card_proxy_icons"
        self._steamui_icon_dir: Path | None = None
        self._steamui_icon_dir_checked = False
        self._openxbl_memory_cache: dict[str, tuple[int, Any]] = {}
        self._openxbl_rate_limited_until = 0.0
        self._last_trueachievements_image_map_diagnostics: dict[str, Any] = {}
        self._image_proxy_server: http.server.ThreadingHTTPServer | None = None
        self._image_proxy_thread: threading.Thread | None = None
        self._image_proxy_port = 0
        self._steam_session_id = f"steam-{now()}-{id(self)}"
        self._pc_session_id = str(int(time.time() - time.monotonic()))

    async def _main(self) -> None:
        self._settings_dir.mkdir(parents=True, exist_ok=True)
        self._start_image_proxy_server()
        self._cleanup_loopback_icons()
        self._load_data()
        decky.logger.info(
            "Playhub image pipeline status: "
            f"pillow={'yes' if Image is not None else 'NO'} "
            f"cropper={self._xbox_cropper_name()} "
            f"proxy_port={self._image_proxy_port} "
            f"loopback_dir={self._steamui_loopback_icon_dir() or 'unavailable'}"
        )
        decky.logger.info("Playhub Metadata backend ready")

    async def _unload(self) -> None:
        if self._scan_task and not self._scan_task.done():
            self._scan_task.cancel()
        if self._activity_refresh_task and not self._activity_refresh_task.done():
            self._activity_refresh_task.cancel()
        self._stop_image_proxy_server()
        decky.logger.info("Playhub Metadata backend unloaded")

    def _start_image_proxy_server(self) -> None:
        if self._image_proxy_server is not None:
            return

        plugin = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, _format: str, *_args: Any) -> None:
                return

            def do_GET(self) -> None:
                try:
                    parsed = urllib.parse.urlparse(self.path)
                    if parsed.path != "/xbox-icon":
                        self.send_error(404)
                        return
                    query = urllib.parse.parse_qs(parsed.query)
                    src = query.get("src", [""])[0]
                    data = plugin._xbox_proxy_icon_bytes(src)
                    if not data:
                        self.send_error(404)
                        return
                    self.send_response(200)
                    self.send_header("Content-Type", "image/png")
                    self.send_header("Cache-Control", "public, max-age=604800")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                except Exception as error:
                    try:
                        decky.logger.error(f"Playhub image proxy failed: {error}")
                    except Exception:
                        pass
                    self.send_error(500)

        try:
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
            server.daemon_threads = True
            thread = threading.Thread(target=server.serve_forever, name="PlayhubImageProxy", daemon=True)
            thread.start()
            self._image_proxy_server = server
            self._image_proxy_thread = thread
            self._image_proxy_port = int(server.server_address[1])
            decky.logger.info(f"Playhub image proxy ready on 127.0.0.1:{self._image_proxy_port}")
        except Exception as error:
            self._image_proxy_server = None
            self._image_proxy_thread = None
            self._image_proxy_port = 0
            decky.logger.error(f"Playhub image proxy could not start: {error}")

    def _stop_image_proxy_server(self) -> None:
        server = self._image_proxy_server
        self._image_proxy_server = None
        self._image_proxy_thread = None
        self._image_proxy_port = 0
        if server is None:
            return
        try:
            server.shutdown()
            server.server_close()
        except Exception:
            pass

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

    def _can_crop_xbox_icons(self) -> bool:
        return Image is not None or bool(self._windows_powershell_executable())

    def _xbox_cropper_name(self) -> str:
        if Image is not None:
            return "pillow"
        if self._windows_powershell_executable():
            return "windows"
        return "none"

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

    def _xbox_proxy_icon_url(self, source_url: str) -> str:
        if not source_url or not self._image_proxy_port or not self._can_crop_xbox_icons():
            return ""
        if not self._is_xbox_card_image_url(source_url):
            return ""
        encoded = urllib.parse.quote(source_url, safe="")
        return f"http://127.0.0.1:{self._image_proxy_port}/xbox-icon?src={encoded}"

    def _xbox_proxy_icon_bytes(self, source_url: str) -> bytes:
        source_url = self._xbox_square_icon_source(source_url)
        if not source_url or not self._is_xbox_card_image_url(source_url) or not self._can_crop_xbox_icons():
            return b""
        self._xbox_card_proxy_dir.mkdir(parents=True, exist_ok=True)
        cache_key = hashlib.sha1(source_url.encode("utf-8")).hexdigest()
        output_path = self._xbox_card_proxy_dir / f"{cache_key}.png"
        if output_path.exists() and output_path.stat().st_size > 0:
            return output_path.read_bytes()
        self._download_and_crop_xbox_icon(source_url, output_path)
        return output_path.read_bytes()

    @staticmethod
    def _is_xbox_card_image_url(url: Any) -> bool:
        lower = str(url or "").casefold()
        return any(token in lower for token in (
            "images-eds-ssl.xboxlive.com/image",
            "dlassets.xboxlive.com",
            "store-images.s-microsoft.com",
            "store-images.microsoft.com",
        ))

    def _steamui_loopback_icon_dir(self) -> Path | None:
        # Resolve <Steam>/steamui once per backend lifetime. Steam's UI serves
        # that folder at https://steamloopback.host/, so PNGs written there are
        # loadable from Steam without the http://127.0.0.1 proxy.
        if self._steamui_icon_dir_checked:
            return self._steamui_icon_dir
        self._steamui_icon_dir_checked = True
        candidates: list[Path] = []
        steam_path = self._read_windows_steam_path()
        if steam_path:
            candidates.append(steam_path)
        if os.name == "nt":
            for env_name in ("PROGRAMFILES(X86)", "PROGRAMFILES"):
                value = os.environ.get(env_name)
                if value:
                    candidates.append(Path(value) / "Steam")
        candidates.append(Path.home() / ".local" / "share" / "Steam")
        candidates.append(Path.home() / ".steam" / "steam")
        for candidate in candidates:
            try:
                steamui = candidate / "steamui"
                if not steamui.is_dir():
                    continue
                icon_dir = steamui / PLAYHUB_LOOPBACK_ICON_SUBDIR
                icon_dir.mkdir(parents=True, exist_ok=True)
                probe = icon_dir / ".playhub_write_probe"
                probe.write_bytes(b"ok")
                probe.unlink(missing_ok=True)
                self._steamui_icon_dir = icon_dir
                decky.logger.info(f"Playhub loopback icon dir ready: {icon_dir}")
                return icon_dir
            except Exception:
                continue
        decky.logger.info(
            "Playhub loopback icon dir unavailable; falling back to 127.0.0.1 image proxy"
        )
        return None

    def _xbox_loopback_icon_url(self, source_url: str, generate: bool = True) -> str:
        # Preferred square-icon strategy: write the cropped PNG into
        # <Steam>/steamui/playhub_xbox_icons and reference it through
        # https://steamloopback.host/. The file survives Steam/Decky restarts
        # and there is no localhost port that can change or die.
        if not source_url or not self._can_crop_xbox_icons():
            return ""
        source_url = self._xbox_square_icon_source(source_url)
        if not source_url or not self._is_xbox_card_image_url(source_url):
            return ""
        icon_dir = self._steamui_loopback_icon_dir()
        if icon_dir is None:
            return ""
        name = hashlib.sha1(source_url.encode("utf-8")).hexdigest() + ".png"
        output_path = icon_dir / name
        loopback_url = f"{PLAYHUB_LOOPBACK_BASE_URL}/{PLAYHUB_LOOPBACK_ICON_SUBDIR}/{name}"
        try:
            if output_path.exists() and output_path.stat().st_size > 0:
                return loopback_url
            if not generate:
                return ""
            # Reuse a crop already produced by the 127.0.0.1 proxy if present,
            # otherwise download and crop now. Same sha1 key in both caches.
            proxy_cached = self._xbox_card_proxy_dir / name
            if proxy_cached.exists() and proxy_cached.stat().st_size > 0:
                shutil.copyfile(proxy_cached, output_path)
            else:
                self._download_and_crop_xbox_icon(source_url, output_path)
            if output_path.exists() and output_path.stat().st_size > 0:
                return loopback_url
        except Exception as error:
            decky.logger.error(f"Playhub loopback icon failed for {source_url}: {error}")
        return ""

    def _prefetch_xbox_loopback_icons(self, sources: list[str]) -> None:
        # Generate missing loopback PNGs in parallel so scans of games with
        # many achievements do not pay one sequential download per icon.
        if not self._can_crop_xbox_icons() or self._steamui_loopback_icon_dir() is None:
            return
        pending: list[str] = []
        seen: set[str] = set()
        for source in sources:
            if not source or source in seen:
                continue
            seen.add(source)
            if not self._is_xbox_card_image_url(source):
                continue
            if not self._xbox_loopback_icon_url(source, generate=False):
                pending.append(source)
        if not pending:
            return
        workers = min(6 if Image is not None else 3, len(pending))
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
                list(pool.map(lambda src: self._xbox_loopback_icon_url(src, generate=True), pending))
        except Exception as error:
            decky.logger.error(f"Playhub loopback icon prefetch failed: {error}")

    def _cleanup_loopback_icons(self, max_age_days: int = 60) -> None:
        # Keep <Steam>/steamui tidy: drop crops not touched in a long time.
        icon_dir = self._steamui_icon_dir if self._steamui_icon_dir_checked else self._steamui_loopback_icon_dir()
        if icon_dir is None:
            return
        cutoff = time.time() - max_age_days * 86400
        try:
            for path in icon_dir.glob("*.png"):
                try:
                    if path.stat().st_mtime < cutoff:
                        path.unlink()
                except Exception:
                    continue
        except Exception:
            pass

    async def _migration(self) -> None:
        self._settings_dir.mkdir(parents=True, exist_ok=True)

    async def get_state(self) -> dict[str, Any]:
        self._load_data()
        return self._data

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

    async def enrich_community_media(
        self, app_id: int, title: str = "", source_url: str = ""
    ) -> dict[str, Any] | None:
        return await asyncio.to_thread(
            self._enrich_community_media_sync, app_id, title, source_url
        )

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

    async def get_retroachievements_settings(self) -> dict[str, Any]:
        self._load_data()
        ra = self._data["settings"]["retroachievements"]
        return {
            "enabled": bool(ra.get("enabled", False)),
            "username": str(ra.get("username", "")),
            "api_key": str(ra.get("api_key", "")),
            "game_ids": self._data["ra_game_ids"],
        }

    async def set_retroachievements_settings(
        self, enabled: bool, username: str, api_key: str
    ) -> dict[str, Any]:
        self._load_data()
        self._data["settings"]["retroachievements"] = {
            "enabled": bool(enabled),
            "username": str(username or "").strip(),
            "api_key": str(api_key or "").strip(),
        }
        self._save_data()
        return await self.get_retroachievements_settings()

    async def test_retroachievements_credentials(
        self, username: str = "", api_key: str = ""
    ) -> dict[str, Any]:
        return await asyncio.to_thread(
            self._test_retroachievements_credentials_sync, username, api_key
        )

    async def set_retroachievements_game_id(
        self, app_id: int, game_id: int | None
    ) -> dict[str, Any]:
        self._load_data()
        key = str(app_id)
        if game_id and int(game_id) > 0:
            self._data["ra_game_ids"][key] = int(game_id)
        else:
            self._data["ra_game_ids"].pop(key, None)
        self._save_data()
        return self._data["ra_game_ids"]

    async def fetch_achievements(self, app_id: int) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._fetch_achievements_sync, app_id)

    async def sync_trueachievements_progress(self, app_id: int) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._sync_trueachievements_progress_sync, app_id)

    async def resolve_retroachievements_from_path(
        self, app_id: int, path: str, title: str = ""
    ) -> dict[str, Any] | None:
        return await asyncio.to_thread(
            self._resolve_retroachievements_from_path_sync, app_id, path, title
        )

    async def search_retroachievements_games(
        self, query: str, limit: int = 8, app_id: int = 0
    ) -> list[dict[str, Any]]:
        return await asyncio.to_thread(
            self._search_retroachievements_games_sync, query, limit, app_id
        )

    async def get_achievement_settings(self) -> dict[str, Any]:
        self._load_data()
        ra = self._data["settings"].get("retroachievements") or {}
        xbox = self._data["settings"].get("xbox") or {}
        achievement_cache = self._data["settings"].get("achievement_cache") or {}
        return {
            "retroachievements": {
                "enabled": bool(ra.get("enabled", False)),
                "username": str(ra.get("username", "")),
                "api_key": str(ra.get("api_key", "")),
                "game_ids": self._data["ra_game_ids"],
            },
                "xbox": {
                    "enabled": bool(xbox.get("enabled", False)),
                    "api_key": str(xbox.get("api_key") or ""),
                    "xuid": str(xbox.get("xuid") or ""),
                    "gamertag": str(xbox.get("gamertag") or ""),
                    "ta_logged_in": bool(xbox.get("xuid") or xbox.get("ta_logged_in")),
                    "title_ids": self._data["xbox_title_ids"],
                },
            "achievement_sources": self._data["achievement_sources"],
            "achievement_cache": {
                "policy": self._normalise_achievement_cache_policy(achievement_cache.get("policy")),
            },
        }

    async def set_achievement_cache_policy(self, policy: str = "") -> dict[str, Any]:
        self._load_data()
        cleaned = self._normalise_achievement_cache_policy(policy)
        self._data.setdefault("settings", {}).setdefault("achievement_cache", {})["policy"] = cleaned
        self._save_data()
        return {"policy": cleaned}

    async def get_xbox_settings(self) -> dict[str, Any]:
        settings = await self.get_achievement_settings()
        return settings["xbox"]

    async def set_xbox_settings(self, enabled: bool, api_key: str = "") -> dict[str, Any]:
        self._load_data()
        current = self._data["settings"].get("xbox") or {}
        cleaned_key = str(api_key or "").strip()
        key_changed = cleaned_key != str(current.get("api_key") or "").strip()
        self._data["settings"]["xbox"] = {
            "enabled": bool(enabled),
            "api_key": cleaned_key,
            "xuid": "" if key_changed else str(current.get("xuid") or ""),
            "gamertag": "" if key_changed else str(current.get("gamertag") or ""),
            "ta_cookies": "",
            "ta_logged_in": False if key_changed else bool(current.get("xuid") or current.get("ta_logged_in")),
            "ta_session_source": "openxbl",
        }
        if key_changed:
            self._data["xbox_achievement_payloads"] = {}
        self._save_data()
        return await self.get_xbox_settings()

    async def login_trueachievements(self, gamertag: str = "", password: str = "") -> dict[str, Any]:
        return await asyncio.to_thread(self._login_trueachievements_sync, gamertag, password)

    async def clear_xbox_associations(self) -> dict[str, Any]:
        self._load_data()
        self._data["xbox_title_ids"] = {}
        self._data["xbox_achievement_payloads"] = {}
        self._data["achievement_sources"] = {
            str(key): value
            for key, value in (self._data.get("achievement_sources") or {}).items()
            if value != "xbox"
        }
        try:
            for pattern in (
                "openxbl_achievement_cache*.json",
                "openxbl_title_index*.json",
                "trueachievements_achievement_cache*.json",
                "trueachievements_icon_cache*.json",
                "trueachievements_title_index*.json",
            ):
                for cache_file in self._settings_dir.glob(pattern):
                    if cache_file.exists() and cache_file.is_file():
                        cache_file.unlink()
            if self._xbox_icon_dir.exists() and self._xbox_icon_dir.is_dir():
                for icon_file in self._xbox_icon_dir.glob("*"):
                    if icon_file.is_file():
                        icon_file.unlink()
            if self._xbox_card_proxy_dir.exists() and self._xbox_card_proxy_dir.is_dir():
                for icon_file in self._xbox_card_proxy_dir.glob("*"):
                    if icon_file.is_file():
                        icon_file.unlink()
        except Exception as error:
            decky.logger.error(f"Failed clearing Xbox achievement cache: {error}")
        self._save_data()
        return await self.get_xbox_settings()

    async def test_openxbl_credentials(self, api_key: str = "") -> dict[str, Any]:
        return await asyncio.to_thread(self._test_openxbl_credentials_sync, api_key)

    async def set_xbox_title_id(
        self, app_id: int, title_id: str | int | None
    ) -> dict[str, str]:
        self._load_data()
        key = str(app_id)
        cleaned = self._normalise_xbox_or_ta_match_id(title_id)
        # A manual match change is the explicit refresh boundary for Xbox/TA achievements.
        # Drop the persisted payload so the next fetch refreshes from the selected
        # provider, while normal page visits keep using the last good cached payload.
        self._data.setdefault("xbox_achievement_payloads", {}).pop(key, None)
        if cleaned:
            self._data["xbox_title_ids"][key] = cleaned
        else:
            self._data["xbox_title_ids"].pop(key, None)
            if self._data.get("achievement_sources", {}).get(key) == "xbox":
                self._data["achievement_sources"].pop(key, None)
        self._save_data()
        return self._data["xbox_title_ids"]

    def _normalise_xbox_or_ta_match_id(self, value: Any) -> str:
        raw = str(value or "").strip()
        if not raw:
            return ""
        if raw.startswith("ta:"):
            path = self._trueachievements_path_from_any(raw[3:])
            return f"ta:{path}" if path else ""
        if "trueachievements.com" in raw.casefold() or "/game/" in raw.casefold():
            path = self._trueachievements_path_from_any(raw)
            return f"ta:{path}" if path else ""
        numeric = re.sub(r"[^0-9]", "", raw)
        return numeric if len(numeric) >= 4 else ""

    async def set_achievement_source(self, app_id: int, source: str) -> dict[str, str]:
        self._load_data()
        key = str(app_id)
        cleaned = str(source or "auto").strip().casefold()
        if cleaned not in ACHIEVEMENT_SOURCES:
            cleaned = "auto"
        if cleaned == "auto":
            self._data["achievement_sources"].pop(key, None)
        else:
            self._data["achievement_sources"][key] = cleaned
        self._save_data()
        return self._data["achievement_sources"]

    async def resolve_xbox_from_shortcut(
        self, app_id: int, title: str = "", path: str = ""
    ) -> dict[str, Any] | None:
        return await asyncio.to_thread(
            self._resolve_xbox_from_shortcut_sync, app_id, title, path
        )

    async def search_xbox_titles(
        self, query: str, limit: int = 8, app_id: int = 0, include_catalog: bool = True
    ) -> list[dict[str, Any]]:
        return await asyncio.to_thread(
            self._search_xbox_titles_sync, query, limit, app_id, include_catalog
        )

    def _default_data(self) -> dict[str, Any]:
        return {
            "metadata": {},
            "settings": {
                "retroachievements": {
                    "enabled": False,
                    "username": "",
                    "api_key": "",
                },
                "xbox": {
                    "enabled": False,
                    "api_key": "",
                    "xuid": "",
                    "gamertag": "",
                    "ta_cookies": "",
                    "ta_logged_in": False,
                },
                "achievement_cache": {
                    "policy": ACHIEVEMENT_CACHE_DEFAULT_POLICY,
                },
            },
            "ra_game_ids": {},
            "xbox_title_ids": {},
            "xbox_achievement_payloads": {},
            "achievement_sources": {},
        }

    def _load_data(self) -> None:
        if not self._data_file.exists():
            self._save_data()
            return
        try:
            payload = json.loads(self._data_file.read_text(encoding="utf-8"))
        except Exception as error:
            decky.logger.error(f"Failed reading metadata settings: {error}")
            return
        if not isinstance(payload, dict):
            return
        default = self._default_data()
        default["metadata"].update(payload.get("metadata") or {})
        default["settings"].update(payload.get("settings") or {})
        if "retroachievements" not in default["settings"]:
            default["settings"]["retroachievements"] = {
                "enabled": False,
                "username": "",
                "api_key": "",
            }
        if "xbox" not in default["settings"]:
            default["settings"]["xbox"] = {
                "enabled": False,
                "api_key": "",
                "xuid": "",
                "gamertag": "",
                "ta_cookies": "",
                "ta_logged_in": False,
            }
        xbox_settings = default["settings"].setdefault("xbox", {})
        xbox_settings.setdefault("api_key", "")
        xbox_settings.setdefault("xuid", "")
        xbox_settings.setdefault("gamertag", "")
        # 1.3.18 uses OpenXBL again for Xbox data. TA cookies/passwords stay
        # gone; TA is only a public-image/profile fallback when explicitly used.
        xbox_settings["ta_cookies"] = ""
        xbox_settings["ta_logged_in"] = bool(xbox_settings.get("xuid") or (xbox_settings.get("api_key") and xbox_settings.get("ta_logged_in")))
        xbox_settings["ta_session_source"] = "openxbl"
        cache_settings = default["settings"].setdefault("achievement_cache", {})
        policy = str(cache_settings.get("policy") or ACHIEVEMENT_CACHE_DEFAULT_POLICY).strip().casefold()
        cache_settings["policy"] = policy if policy in ACHIEVEMENT_CACHE_POLICIES else ACHIEVEMENT_CACHE_DEFAULT_POLICY
        default["ra_game_ids"].update(payload.get("ra_game_ids") or {})
        # Preserve both modern OpenXBL numeric title IDs and older TA fallback
        # matches. The fetch path decides which provider to use.
        raw_xbox_ids = payload.get("xbox_title_ids") or {}
        if isinstance(raw_xbox_ids, dict):
            for key, value in raw_xbox_ids.items():
                cleaned = self._normalise_xbox_or_ta_match_id(value)
                if cleaned:
                    default["xbox_title_ids"][str(key)] = cleaned
        raw_payloads = payload.get("xbox_achievement_payloads") or {}
        if isinstance(raw_payloads, dict):
            for key, row in raw_payloads.items():
                if not isinstance(row, dict):
                    continue
                match_id = self._normalise_xbox_or_ta_match_id(row.get("title_id") or row.get("match_id") or "")
                if match_id and match_id == default["xbox_title_ids"].get(str(key)):
                    payload_blob = row.get("payload") if isinstance(row.get("payload"), dict) else {}
                    if payload_blob.get("playhubAchievementSource") in {"openxbl", "trueachievements"} or payload_blob.get("provider") == "xbox":
                        default["xbox_achievement_payloads"][str(key)] = row
        raw_sources = payload.get("achievement_sources") or {}
        if isinstance(raw_sources, dict):
            default["achievement_sources"].update(
                {
                    str(key): str(value)
                    for key, value in raw_sources.items()
                    if str(value) in ACHIEVEMENT_SOURCES
                }
            )
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
        for game in missing:
            app_id = int(game.get("appid"))
            title = self._clean_game_title(str(game.get("name") or ""))
            self._scan_progress["current"] = f"{self._scan_progress['completed'] + 1}/{len(missing)} - {title}" if title else f"{self._scan_progress['completed'] + 1}/{len(missing)}"
            try:
                self._scan_progress["message"] = f"Fetching metadata for {title}"
                metadata = await asyncio.to_thread(self._auto_fetch_metadata_sync, title)
                if metadata:
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
                decky.logger.error(f"Metadata scan failed for {title}: {error}")
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
                decky.logger.error(f"Steam Activity refresh failed for {title}: {error}")
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
                if metadata and self._reasonable_match(cleaned, metadata.get("title", "")):
                    return metadata
            except Exception:
                continue

        results = self._search_metadata_sync(cleaned, 5)
        if not results:
            return None
        best = results[0]
        if not self._reasonable_match(cleaned, best.get("title", "")):
            return None
        return self._fetch_metadata_sync(best["slug"] or best["url"])

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
            "community_images": self._sanitize_screenshots(
                metadata.get("community_images")
            ),
            "community_videos": self._sanitize_videos(
                metadata.get("community_videos")
            ),
            "steam_appid": self._safe_int(metadata.get("steam_appid")),
            "steam_store_url": self._https_url(str(metadata.get("steam_store_url") or "")),
            "steam_news": self._sanitize_steam_news(metadata.get("steam_news")),
            "steam_news_enriched_at": int(
                self._as_number(metadata.get("steam_news_enriched_at"), 0)
            ),
            "community_enriched_at": int(
                self._as_number(metadata.get("community_enriched_at"), 0)
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

    def _enrich_community_media_sync(
        self, app_id: int, title: str = "", source_url: str = ""
    ) -> dict[str, Any] | None:
        self._load_data()
        key = str(app_id)
        metadata = self._data["metadata"].get(key)
        if not isinstance(metadata, dict):
            return None
        clean_title = self._clean_game_title(
            title or str(metadata.get("title") or "")
        )
        if not clean_title:
            return metadata

        videos = self._youtube_videos_for_title(clean_title, limit=10)
        images = self._rawg_images_for_title(
            clean_title,
            source_url or str(metadata.get("source_url") or ""),
            limit=10,
        )
        next_metadata = dict(metadata)
        next_metadata.update(
            {
                "community_videos": videos,
                "community_images": images,
                # Steam Activity/news are refreshed only by the explicit
                # “Aggiorna attività” action. Keeping this enrichment limited to
                # community media prevents Activity refreshes from running in the
                # background while the Steam UI is being opened.
                "steam_news": self._sanitize_steam_news(metadata.get("steam_news")),
                "steam_news_enriched_at": int(self._as_number(metadata.get("steam_news_enriched_at"), 0)),
                "community_enriched_at": now(),
                "updated_at": now(),
            }
        )
        saved = self._sanitize_metadata(next_metadata)
        self._data["metadata"][key] = saved
        self._save_data()
        return saved

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

    def _steam_news_image(self, contents: str, steam_appid: int = 0) -> str:
        images = self._steam_news_image_candidates(contents, steam_appid)
        return images[0] if images else ""

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
        for value in (metadata.get("steam_store_url"), metadata.get("source_url"), metadata.get("id")):
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
            payload = self._http_json(f"{STEAM_STORE_SEARCH_URL}?{params}", timeout=12)
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
            if normalised_name == normalised_query:
                score += 1000
            elif self._reasonable_match(clean_title, name):
                score += 700
            else:
                ratio = difflib.SequenceMatcher(None, normalised_query, normalised_name).ratio()
                if ratio < 0.72:
                    continue
                score += int(ratio * 500)
            # Prefer the first Steam result when scores are close. The store
            # already ranks exact/official pages above DLC, demos and bundles.
            score -= index * 5
            url = STEAM_STORE_APP_URL.format(appid=appid)
            row = (score, appid, url, name)
            if not best or row[0] > best[0]:
                best = row
        if not best:
            return None, ""
        return best[1], best[2]

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
            screenshots.append(
                {
                    "id": str(item.get("id") or url),
                    "url": url,
                    "caption": self._clean_html_text(str(item.get("caption") or "")),
                    "width": int(self._as_number(item.get("width"), 0)),
                    "height": int(self._as_number(item.get("height"), 0)),
                }
            )
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
        context = ssl._create_unverified_context()
        with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
            return response.read().decode("utf-8", errors="ignore")

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
                "User-Agent": "PlayhubMetadata/0.1 (+Decky Loader)",
            },
        )
        context = ssl._create_unverified_context()
        try:
            with urllib.request.urlopen(request, timeout=20, context=context) as response:
                payload = json.loads(response.read().decode("utf-8", errors="ignore"))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"IGN request failed: {error.code} {detail}") from error
        if payload.get("errors"):
            raise RuntimeError(f"IGN GraphQL error: {payload['errors']}")
        return payload

    def _fetch_achievements_sync(self, app_id: int) -> dict[str, Any] | None:
        self._load_data()
        source = self._achievement_source_for_app(app_id)
        if source == "disabled":
            return None
        if source == "xbox":
            if not self._is_uwphook_shortcut(app_id):
                return None
            return self._fetch_xbox_achievements_sync(app_id, auto_resolve=True)
        if source == "retroachievements":
            return self._fetch_ra_achievements_sync(app_id)

        # Auto mode: UWPHook/Xbox shortcuts prefer Xbox/OpenXBL, otherwise keep
        # the existing RetroAchievements flow untouched.
        if self._is_uwphook_shortcut(app_id):
            payload = self._fetch_xbox_achievements_sync(app_id, auto_resolve=True)
            if payload:
                return payload
        return self._fetch_ra_achievements_sync(app_id)

    def _fetch_ra_achievements_sync(self, app_id: int) -> dict[str, Any] | None:
        self._load_data()
        ra = self._data["settings"].get("retroachievements") or {}
        if not ra.get("enabled"):
            return None
        username = str(ra.get("username") or "").strip()
        api_key = str(ra.get("api_key") or "").strip()
        game_id = self._data["ra_game_ids"].get(str(app_id))
        if not username or not api_key or not game_id:
            return None
        api_key_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:16]
        cache_key = f"ra{PLAYHUB_ACHIEVEMENT_CACHE_VERSION}:{api_key_hash}:{username.casefold()}:{int(game_id)}"
        cached = self._load_ra_achievement_cache(cache_key)
        if isinstance(cached, dict):
            payload = self._retro_payload_to_steam(cached, int(game_id))
            if payload:
                return payload
        params = urllib.parse.urlencode(
            {"z": username, "y": api_key, "u": username, "g": int(game_id)}
        )
        request = urllib.request.Request(
            f"{RETROACHIEVEMENTS_GAME_URL}?{params}",
            headers={"User-Agent": "PlayhubMetadata/0.1 (+Decky Loader)"},
        )
        context = ssl._create_unverified_context()
        with urllib.request.urlopen(request, timeout=25, context=context) as response:
            payload = json.loads(response.read().decode("utf-8", errors="ignore"))
        self._save_ra_achievement_cache(cache_key, payload)
        return self._retro_payload_to_steam(payload, int(game_id))

    def _achievement_source_for_app(self, app_id: int) -> str:
        source = str(
            self._data.get("achievement_sources", {}).get(str(app_id)) or "auto"
        ).strip().casefold()
        return source if source in ACHIEVEMENT_SOURCES else "auto"

    @staticmethod
    def _normalise_achievement_cache_policy(value: Any) -> str:
        policy = str(value or ACHIEVEMENT_CACHE_DEFAULT_POLICY).strip().casefold()
        return policy if policy in ACHIEVEMENT_CACHE_POLICIES else ACHIEVEMENT_CACHE_DEFAULT_POLICY

    def _achievement_cache_policy(self) -> str:
        settings = (self._data.get("settings") or {}).get("achievement_cache") or {}
        return self._normalise_achievement_cache_policy(settings.get("policy"))

    def _achievement_cache_entry_meta(self) -> dict[str, Any]:
        return {
            "updated_at": now(),
            "steam_session_id": self._steam_session_id,
            "pc_session_id": self._pc_session_id,
        }

    def _achievement_cache_entry_is_fresh(self, entry: dict[str, Any] | None) -> bool:
        if not isinstance(entry, dict) or "payload" not in entry:
            return False
        policy = self._achievement_cache_policy()
        updated_at = int(entry.get("updated_at") or 0)
        if updated_at <= 0:
            return False
        if policy == "hourly":
            return now() - updated_at < 60 * 60
        if policy == "daily":
            return now() - updated_at < 24 * 60 * 60
        if policy == "weekly":
            return now() - updated_at < 7 * 24 * 60 * 60
        if policy == "pc_session":
            return str(entry.get("pc_session_id") or "") == self._pc_session_id
        if policy == "manual":
            return True
        return False

    def _openxbl_settings(self) -> tuple[dict[str, Any], str]:
        xbox = self._data["settings"].get("xbox") or {}
        return xbox, str(xbox.get("api_key") or "").strip()

    def _test_openxbl_credentials_sync(self, api_key: str = "") -> dict[str, Any]:
        self._load_data()
        clean_key = str(api_key or (self._data.get("settings", {}).get("xbox") or {}).get("api_key") or "").strip()
        if not clean_key:
            return {"ok": False, "message": "Inserisci la chiave API OpenXBL."}
        try:
            payload = self._openxbl_request("/account", clean_key, timeout=22, cache_ttl=0)
            xuid, gamertag = self._extract_openxbl_identity(payload)
        except Exception as error:
            return {"ok": False, "message": f"OpenXBL non verificato: {error}"}
        if not xuid:
            return {"ok": False, "message": "OpenXBL non verificato: XUID non trovato."}
        self._data["settings"]["xbox"] = {
            "enabled": True,
            "api_key": clean_key,
            "xuid": xuid,
            "gamertag": gamertag,
            "ta_cookies": "",
            "ta_logged_in": True,
            "ta_session_source": "openxbl",
        }
        self._save_data()
        return {"ok": True, "message": "OpenXBL verificato.", "gamertag": gamertag, "xuid": xuid}

    def _openxbl_request(
        self,
        path: str,
        api_key: str,
        params: dict[str, Any] | None = None,
        timeout: int = 25,
        cache_ttl: int = 60,
        method: str = "GET",
        body: Any | None = None,
    ) -> Any:
        if not path.startswith("/"):
            path = f"/{path}"
        url = f"{OPENXBL_API_BASE_URL}{path}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        method = str(method or "GET").upper()
        body_bytes: bytes | None = None
        if body is not None:
            body_bytes = json.dumps(body).encode("utf-8")
        api_key_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:16]
        body_hash = hashlib.sha256(body_bytes or b"").hexdigest()[:16]
        cache_key = f"{api_key_hash}:{method}:{url}:{body_hash}"
        now_ts = now()
        cached = self._openxbl_memory_cache.get(cache_key)
        if cached and cache_ttl > 0 and now_ts - int(cached[0]) < cache_ttl:
            return cached[1]
        # During a 429 cooldown, do not burn more OpenXBL quota: cached data is
        # still served above, everything else fails fast with a clear reason.
        if time.monotonic() < self._openxbl_rate_limited_until:
            remaining = int(self._openxbl_rate_limited_until - time.monotonic())
            raise RuntimeError(f"OpenXBL rate-limited (429); cooling down for {remaining}s")
        decky.logger.info(f"OpenXBL request: {method} {path}")
        request = urllib.request.Request(
            url,
            data=body_bytes,
            method=method,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Authorization": api_key,
                "User-Agent": "PlayhubMetadata/1.3.18 (+Decky Loader)",
            },
        )
        context = ssl._create_unverified_context()
        try:
            with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
                payload = json.loads(response.read().decode("utf-8", errors="ignore") or "null")
        except urllib.error.HTTPError as error:
            decky.logger.error(f"OpenXBL {method} {path} -> HTTP {error.code}")
            if error.code == 429:
                self._openxbl_rate_limited_until = time.monotonic() + 600
                decky.logger.error("OpenXBL returned 429 Too Many Requests; pausing OpenXBL calls for 10 minutes")
            raise
        payload = self._unwrap_openxbl_payload(payload)
        if cache_ttl > 0:
            self._openxbl_memory_cache[cache_key] = (now_ts, payload)
        return payload

    @staticmethod
    def _unwrap_openxbl_payload(payload: Any) -> Any:
        if isinstance(payload, dict) and "data" in payload and len(payload) <= 3:
            return payload.get("data")
        return payload

    def _extract_openxbl_identity(self, payload: Any) -> tuple[str, str]:
        # OpenXBL's /account endpoint is documented as profileUsers[].id/hostId,
        # but in practice wrapper shapes can vary between API versions/plans:
        #   {"profileUsers": [...]}
        #   {"profileUsers": {...}}
        #   {"people": [...]}
        #   {"data": {"profileUsers": [...]}}
        #   {"user": {"xuid": ...}}
        # Keep this parser deliberately tolerant so a harmless envelope change
        # does not make the login test fail.
        def as_items(value: Any) -> list[Any]:
            if isinstance(value, list):
                return value
            if isinstance(value, dict):
                return [value]
            return []

        def interesting_nodes(value: Any) -> list[dict[str, Any]]:
            found: list[dict[str, Any]] = []
            if isinstance(value, dict):
                # Prefer the well-known identity containers first.
                for key in (
                    "profileUsers",
                    "people",
                    "users",
                    "user",
                    "account",
                    "profile",
                    "person",
                    "data",
                ):
                    if key in value:
                        for item in as_items(value.get(key)):
                            if isinstance(item, dict):
                                found.extend(interesting_nodes(item))
                found.append(value)
                for child in value.values():
                    if isinstance(child, (dict, list)):
                        found.extend(interesting_nodes(child))
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, (dict, list)):
                        found.extend(interesting_nodes(item))
            # De-duplicate by object identity while preserving priority order.
            unique: list[dict[str, Any]] = []
            seen: set[int] = set()
            for node in found:
                marker = id(node)
                if marker not in seen:
                    seen.add(marker)
                    unique.append(node)
            return unique

        def numeric_xuid(value: Any) -> str:
            raw = re.sub(r"[^0-9]", "", str(value or ""))
            # Modern XUIDs are long numeric strings. Avoid accepting generic IDs.
            return raw if len(raw) >= 10 else ""

        def setting_value(user: dict[str, Any], wanted: str) -> str:
            settings = user.get("settings") or []
            if isinstance(settings, dict):
                settings = [settings]
            if isinstance(settings, list):
                for setting in settings:
                    if not isinstance(setting, dict):
                        continue
                    key = str(setting.get("id") or setting.get("name") or "").casefold()
                    if key == wanted.casefold():
                        return str(setting.get("value") or "").strip()
            return ""

        for user in interesting_nodes(payload):
            xuid = (
                numeric_xuid(user.get("xuid"))
                or numeric_xuid(user.get("hostId"))
                or numeric_xuid(user.get("userId"))
                or numeric_xuid(user.get("ownerXuid"))
                or numeric_xuid(user.get("id"))
            )
            gamertag = str(
                user.get("gamertag")
                or user.get("gamerTag")
                or user.get("uniqueModernGamertag")
                or user.get("modernGamertag")
                or user.get("displayName")
                or setting_value(user, "Gamertag")
                or setting_value(user, "GameDisplayName")
                or ""
            ).strip()
            if xuid:
                return xuid, gamertag

        # Last-resort regex fallback for unexpected but still JSON-like payloads.
        try:
            text = json.dumps(payload, ensure_ascii=False)
            for pattern in (
                r'"(?:xuid|hostId|userId|ownerXuid)"\s*:\s*"?(\d{10,})"?',
                r'"id"\s*:\s*"?(253\d{10,})"?',
            ):
                match = re.search(pattern, text, flags=re.IGNORECASE)
                if match:
                    return match.group(1), ""
        except Exception:
            pass
        return "", ""

    def _get_openxbl_xuid(self, api_key: str) -> str:
        xbox = self._data["settings"].get("xbox") or {}
        cached = str(xbox.get("xuid") or "").strip()
        if cached:
            return cached
        payload = self._openxbl_request("/account", api_key)
        xuid, gamertag = self._extract_openxbl_identity(payload)
        if xuid:
            self._data["settings"]["xbox"]["xuid"] = xuid
            self._data["settings"]["xbox"]["gamertag"] = gamertag
            self._save_data()
        return xuid

    def _persisted_xbox_achievement_payload(self, app_id: int, title_id: str) -> dict[str, Any] | None:
        entry = (self._data.get("xbox_achievement_payloads") or {}).get(str(app_id))
        if not isinstance(entry, dict):
            return None
        if str(entry.get("title_id") or "") != str(title_id or ""):
            return None
        if not self._achievement_cache_entry_is_fresh(entry):
            return None
        payload = entry.get("payload")
        if isinstance(payload, dict) and payload.get("steam", {}).get("nTotal"):
            # Invalidate payloads produced by older TA/OpenXBL experiments. They
            # could contain parsed filter labels, stale OpenXBL art, or TA share
            # cards. Version 18 returns to OpenXBL as the primary Xbox source.
            if int(payload.get("playhubAchievementCacheVersion") or 0) < PLAYHUB_ACHIEVEMENT_CACHE_VERSION:
                return None
            normalized = self._normalize_xbox_payload_images(payload)
            # Persist the normalized payload once, so older stretched/cached Xbox
            # image URLs are migrated without forcing the user to rematch.
            if normalized is not payload:
                replacement = dict(entry)
                replacement["payload"] = normalized
                self._data.setdefault("xbox_achievement_payloads", {})[str(app_id)] = replacement
                self._save_data()
            return normalized
        return None

    def _save_persisted_xbox_achievement_payload(self, app_id: int, title_id: str, payload: dict[str, Any] | None) -> None:
        if not payload or not payload.get("steam", {}).get("nTotal"):
            return
        payload = self._normalize_xbox_payload_images(payload)
        self._data.setdefault("xbox_achievement_payloads", {})[str(app_id)] = {
            "title_id": str(title_id or ""),
            "payload": payload,
            **self._achievement_cache_entry_meta(),
        }
        self._save_data()

    @staticmethod
    def _iter_xbox_payload_achievement_items(cloned: dict[str, Any]) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        steam = cloned.get("steam") if isinstance(cloned, dict) else None
        if isinstance(steam, dict):
            for key in ("vecAchievedHidden", "vecHighlight", "vecUnachieved"):
                value = steam.get(key)
                if isinstance(value, list):
                    items.extend(item for item in value if isinstance(item, dict))
        user = cloned.get("user") if isinstance(cloned, dict) else None
        data = user.get("data") if isinstance(user, dict) else None
        if isinstance(data, dict):
            for bucket in ("achieved", "hidden", "unachieved"):
                value = data.get(bucket)
                if isinstance(value, dict):
                    items.extend(item for item in value.values() if isinstance(item, dict))
                elif isinstance(value, list):
                    items.extend(item for item in value if isinstance(item, dict))
        return items

    def _normalize_xbox_payload_images(self, payload: dict[str, Any]) -> dict[str, Any]:
        # Older OpenXBL test builds cached Xbox CDN URLs with resize parameters
        # that could already be server-side squashed. Normalize every achievement
        # again from the cleanest URL we can find and write a dedicated square
        # Playhub image for the custom achievements page. Since 1.3.28 the
        # square crop is preferably a steamloopback.host PNG written into
        # <Steam>/steamui, regenerated from playhubOriginalImage when missing.
        try:
            cloned = json.loads(json.dumps(payload))
        except Exception:
            cloned = dict(payload)

        def clean_source(item: dict[str, Any]) -> str:
            source = (
                item.get("playhubOriginalImage")
                or item.get("playhubSourceImage")
                or item.get("playhubRemoteImage")
                or item.get("strImageURL")
                or item.get("strImageUrl")
                or item.get("strImage")
                or item.get("strIconURL")
                or item.get("strIcon")
                or item.get("iconUrl")
                or item.get("imageUrl")
                or item.get("playhubImage")
                or ""
            )
            return self._xbox_square_icon_source(source)

        items = self._iter_xbox_payload_achievement_items(cloned)
        cleaned_sources = [clean_source(item) for item in items]
        self._prefetch_xbox_loopback_icons(cleaned_sources)

        for item, clean in zip(items, cleaned_sources):
            display = self._xbox_achievement_playhub_image(clean) if clean else ""
            if clean:
                item["playhubOriginalImage"] = clean
                # Keep real remote URLs in every Steam-visible field. Decky/Steam
                # can be fussy with data: images, while CSS can crop remotes safely.
                for key in (
                    "strImage",
                    "strImageURL",
                    "strImageUrl",
                    "strImageGray",
                    "strImageGrey",
                    "strImageLocked",
                    "strImageLarge",
                    "strImageAchieved",
                    "strImageUnlocked",
                    "strImageUnachieved",
                    "strImageLockedURL",
                    "strIcon",
                    "strIconGray",
                    "strIconGrey",
                    "strIconURL",
                    "strIconUrl",
                    "image",
                    "imageUrl",
                    "icon",
                    "iconUrl",
                ):
                    item[key] = display
            if display:
                item["playhubImage"] = display
        return cloned

    def _fetch_xbox_achievements_sync(
        self, app_id: int, auto_resolve: bool = False
    ) -> dict[str, Any] | None:
        self._load_data()
        shortcut = self._shortcut_for_app(app_id)
        shortcut_text = " ".join(
            str(shortcut.get(item_key) or "")
            for item_key in ("exe", "launch_options", "start_dir", "shortcut_path", "name")
        ) if shortcut else ""
        if not self._is_uwphook_shortcut(app_id, shortcut_text):
            return None
        xbox = self._data["settings"].get("xbox") or {}
        if not xbox.get("enabled"):
            return None

        key = str(app_id)
        match_id = self._normalise_xbox_or_ta_match_id(
            self._data.get("xbox_title_ids", {}).get(key)
        )

        if match_id:
            persisted = self._persisted_xbox_achievement_payload(app_id, match_id)
            if persisted:
                return persisted
            if match_id.startswith("ta:"):
                payload = self._fetch_trueachievements_achievements(match_id)
                if payload and payload.get("steam", {}).get("nTotal"):
                    self._save_persisted_xbox_achievement_payload(app_id, match_id, payload)
                    return payload
                return self._persisted_xbox_achievement_payload(app_id, match_id)
            xbox, api_key = self._openxbl_settings()
            if not api_key:
                return None
            try:
                xuid = self._get_openxbl_xuid(api_key)
                if not xuid:
                    return None
                raw_payload = self._fetch_openxbl_title_achievements(api_key, xuid, match_id)
                payload = self._xbox_payload_to_steam(
                    raw_payload,
                    match_id,
                    title_hint=str(shortcut.get("name") or "") if shortcut else "",
                )
                if payload and payload.get("steam", {}).get("nTotal"):
                    self._save_persisted_xbox_achievement_payload(app_id, match_id, payload)
                    return payload
            except Exception as error:
                decky.logger.error(f"OpenXBL achievement fetch failed for {match_id}: {error}")
            return self._persisted_xbox_achievement_payload(app_id, match_id)

        if auto_resolve:
            title = str(shortcut.get("name") or "") if shortcut else ""
            # Auto mode stays conservative: only UWPHook/Xbox App shortcuts get
            # Xbox matches, and the resolver uses cached/user-scoped OpenXBL data.
            if self._is_uwphook_shortcut(app_id, shortcut_text):
                matched = self._resolve_xbox_title_id_by_title(title, app_id=app_id, validate=True)
                if matched:
                    match_id = self._normalise_xbox_or_ta_match_id(matched.get("id"))
                    if match_id:
                        self._data["xbox_title_ids"][key] = match_id
                        self._save_data()
                        return self._fetch_xbox_achievements_sync(app_id, auto_resolve=False)
        return None

    def _fetch_openxbl_title_achievements(
        self, api_key: str, xuid: str, title_id: str, force_refresh: bool = False
    ) -> Any:
        # Use user-scoped endpoints only. Title-only endpoints can return definition/global
        # data without the player's unlock state, which makes every achievement look
        # unlocked in Steam's UI. OpenXBL documents both user-title routes; try the
        # shortest one first, then the alternate route as a fallback.
        api_key_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
        cache_key = f"openxbl{PLAYHUB_ACHIEVEMENT_CACHE_VERSION}:{api_key_hash}:{xuid}:{title_id}"
        cached_payload = None if force_refresh else self._load_xbox_achievement_cache(cache_key)
        if cached_payload is not None:
            return cached_payload

        errors: list[str] = []
        for path in (
            f"/achievements/player/{urllib.parse.quote(str(xuid))}/{urllib.parse.quote(str(title_id))}",
            f"/achievements/player/{urllib.parse.quote(str(xuid))}/title/{urllib.parse.quote(str(title_id))}",
        ):
            try:
                payload = self._openxbl_request(path, api_key, timeout=30, cache_ttl=0 if force_refresh else 120)
                achievements = self._find_xbox_achievement_nodes(payload)
                if achievements:
                    # Always merge title definitions when available. Some OpenXBL
                    # player endpoints return correct unlock state but omit media,
                    # while definition/title endpoints carry the real icons.
                    definitions = self._fetch_openxbl_title_achievement_definitions(api_key, title_id)
                    payload = self._merge_xbox_achievement_definitions(payload, definitions)
                    self._save_xbox_achievement_cache(cache_key, payload)
                    return payload
            except Exception as error:
                errors.append(f"{path}: {error}")

        # Critical for games installed from Xbox/Game Pass but never launched on
        # the Xbox profile: user-scoped endpoints can be empty, but title
        # definitions still let us display every achievement as locked.
        definitions = self._fetch_openxbl_title_achievement_definitions(api_key, title_id)
        if self._find_xbox_achievement_nodes(definitions):
            payload = {"achievements": self._find_xbox_achievement_nodes(definitions), "playhubDefinitionOnly": True}
            self._save_xbox_achievement_cache(cache_key, payload)
            return payload

        if errors:
            decky.logger.error("OpenXBL achievement fetch failed: " + " | ".join(errors))
        return None

    def _fetch_openxbl_title_achievement_definitions(self, api_key: str, title_id: str) -> Any:
        errors: list[str] = []
        for path in (
            f"/achievements/title/{urllib.parse.quote(str(title_id))}",
            f"/achievements/{urllib.parse.quote(str(title_id))}",
        ):
            try:
                payload = self._openxbl_request(path, api_key, timeout=30, cache_ttl=12 * 60 * 60)
                if self._find_xbox_achievement_nodes(payload):
                    return payload
            except Exception as error:
                errors.append(f"{path}: {error}")
        if errors:
            decky.logger.error("OpenXBL definition fetch failed: " + " | ".join(errors))
        return None

    def _merge_xbox_achievement_definitions(self, player_payload: Any, definition_payload: Any) -> Any:
        if not player_payload or not definition_payload:
            return player_payload
        player_nodes = self._find_xbox_achievement_nodes(player_payload)
        definition_nodes = self._find_xbox_achievement_nodes(definition_payload)
        if not player_nodes or not definition_nodes:
            return player_payload

        def keys_for(node: dict[str, Any]) -> list[str]:
            raw_values = [
                self._first_value(node, "id", "achievementId", "serviceConfigId", "scid"),
                self._first_value(node, "name", "title", "displayName"),
            ]
            keys: list[str] = []
            for value in raw_values:
                text = str(value or "").strip().casefold()
                if text and text not in keys:
                    keys.append(text)
            return keys

        definitions: dict[str, dict[str, Any]] = {}
        for node in definition_nodes:
            if not isinstance(node, dict):
                continue
            for key in keys_for(node):
                definitions.setdefault(key, node)

        preferred_fields = (
            "mediaAssets",
            "media",
            "displayImageUrl",
            "imageUrl",
            "iconUrl",
            "thumbnailUrl",
            "tileUrl",
            "lockedDescription",
            "description",
            "rewards",
            "isSecret",
        )
        for player in player_nodes:
            if not isinstance(player, dict):
                continue
            match = None
            for key in keys_for(player):
                match = definitions.get(key)
                if match:
                    break
            if not match:
                continue
            for field in preferred_fields:
                if self._field_is_empty(player.get(field)) and not self._field_is_empty(match.get(field)):
                    player[field] = match.get(field)
            # Keep existing progress/state untouched; add any missing metadata only.
            for field, value in match.items():
                if field not in player and field not in {"progression", "progressState", "state", "isUnlocked", "unlocked", "earned", "isEarned", "timeUnlocked"}:
                    player[field] = value
        return player_payload

    @staticmethod
    def _field_is_empty(value: Any) -> bool:
        return value in (None, "", [], {})

    def _load_xbox_achievement_cache(self, cache_key: str) -> Any | None:
        try:
            if not self._xbox_achievement_cache_file.exists():
                return None
            cached = json.loads(self._xbox_achievement_cache_file.read_text(encoding="utf-8"))
            entry = (cached.get("entries") or {}).get(cache_key)
            if self._achievement_cache_entry_is_fresh(entry):
                return entry.get("payload")
        except Exception as error:
            decky.logger.error(f"Failed loading OpenXBL achievement cache: {error}")
        return None

    def _save_xbox_achievement_cache(self, cache_key: str, payload: Any) -> None:
        try:
            self._settings_dir.mkdir(parents=True, exist_ok=True)
            cached: dict[str, Any] = {"entries": {}}
            if self._xbox_achievement_cache_file.exists():
                raw = json.loads(self._xbox_achievement_cache_file.read_text(encoding="utf-8"))
                if isinstance(raw, dict):
                    cached = raw
            entries = cached.setdefault("entries", {})
            if isinstance(entries, dict):
                if self._achievement_cache_policy() != "manual":
                    cutoff = now() - 30 * 24 * 60 * 60
                    for key in list(entries.keys()):
                        entry = entries.get(key) or {}
                        if not isinstance(entry, dict) or int(entry.get("updated_at") or 0) < cutoff:
                            entries.pop(key, None)
                entries[cache_key] = {"payload": payload, **self._achievement_cache_entry_meta()}
            self._xbox_achievement_cache_file.write_text(
                json.dumps(cached, ensure_ascii=False), encoding="utf-8"
            )
        except Exception as error:
            decky.logger.error(f"Failed saving OpenXBL achievement cache: {error}")

    def _load_ra_achievement_cache(self, cache_key: str) -> Any | None:
        try:
            if not self._ra_achievement_cache_file.exists():
                return None
            cached = json.loads(self._ra_achievement_cache_file.read_text(encoding="utf-8"))
            entry = (cached.get("entries") or {}).get(cache_key)
            if self._achievement_cache_entry_is_fresh(entry):
                return entry.get("payload")
        except Exception as error:
            decky.logger.error(f"Failed loading RetroAchievements achievement cache: {error}")
        return None

    def _save_ra_achievement_cache(self, cache_key: str, payload: Any) -> None:
        try:
            self._settings_dir.mkdir(parents=True, exist_ok=True)
            cached: dict[str, Any] = {"entries": {}}
            if self._ra_achievement_cache_file.exists():
                raw = json.loads(self._ra_achievement_cache_file.read_text(encoding="utf-8"))
                if isinstance(raw, dict):
                    cached = raw
            entries = cached.setdefault("entries", {})
            if isinstance(entries, dict):
                if self._achievement_cache_policy() != "manual":
                    cutoff = now() - 30 * 24 * 60 * 60
                    for key in list(entries.keys()):
                        entry = entries.get(key) or {}
                        if not isinstance(entry, dict) or int(entry.get("updated_at") or 0) < cutoff:
                            entries.pop(key, None)
                entries[cache_key] = {"payload": payload, **self._achievement_cache_entry_meta()}
            self._ra_achievement_cache_file.write_text(
                json.dumps(cached, ensure_ascii=False), encoding="utf-8"
            )
        except Exception as error:
            decky.logger.error(f"Failed saving RetroAchievements achievement cache: {error}")

    def _resolve_xbox_from_shortcut_sync(
        self, app_id: int, title: str = "", path: str = ""
    ) -> dict[str, Any] | None:
        self._load_data()
        if not self._is_uwphook_shortcut(app_id, " ".join(str(v or "") for v in (title, path))):
            return None
        xbox = self._data["settings"].get("xbox") or {}
        if not xbox.get("enabled"):
            self._data.setdefault("settings", {}).setdefault("xbox", {})["enabled"] = True
            self._save_data()
        candidate_text = " ".join(self._xbox_title_candidates(app_id, title, path)) or title
        match = self._resolve_xbox_title_id_by_title(candidate_text, app_id=app_id, validate=False)
        if not match:
            return None
        key = str(app_id)
        next_id = str(match["id"])
        if str(self._data.get("xbox_title_ids", {}).get(key) or "") != next_id:
            self._data.setdefault("xbox_achievement_payloads", {}).pop(key, None)
        self._data["xbox_title_ids"][key] = next_id
        self._save_data()
        return self._fetch_xbox_achievements_sync(app_id, auto_resolve=False)

    def _resolve_xbox_title_id_by_title(
        self, title: str, app_id: int = 0, validate: bool = False
    ) -> dict[str, Any] | None:
        # Auto validation stays on cached/user-scoped OpenXBL title data. Manual
        # searches may use the Microsoft Store fallback, but bulk auto-scan should
        # not walk broad catalogs or spend many OpenXBL calls.
        matches = self._search_xbox_titles_sync(title, 12, app_id=app_id, include_catalog=not validate)
        if not matches:
            return None
        minimum = 0.62 if validate else 0.56
        strong = [item for item in matches if float(item.get("score") or 0) >= minimum]
        return strong[0] if strong else None

    def _search_xbox_titles_sync(
        self, query: str, limit: int = 8, app_id: int = 0, include_catalog: bool = True
    ) -> list[dict[str, Any]]:
        self._load_data()
        if app_id and not self._is_uwphook_shortcut(app_id):
            return []
        _, api_key = self._openxbl_settings()
        if not api_key:
            return []
        try:
            xuid = self._get_openxbl_xuid(api_key)
        except Exception as error:
            decky.logger.error(f"OpenXBL account lookup failed during title search: {error}")
            xuid = ""
        # Manual searches use exactly the text typed by the user. Older builds
        # mixed in shortcut paths, which produced poor candidates.
        explicit_query = self._clean_game_title(str(query or ""))
        if explicit_query:
            queries = [explicit_query]
        elif app_id:
            queries = self._xbox_title_candidates(app_id, "", "")[:3]
        else:
            queries = []
        targets = [self._normalise_match_title(value) for value in queries]
        targets = [value for value in dict.fromkeys(targets) if value]
        if not targets:
            return []
        rows: dict[str, dict[str, Any]] = {}

        def add_candidate(item: dict[str, Any]) -> None:
            candidates = [self._normalise_match_title(str(item.get("title") or ""))]
            candidates.extend(self._normalise_match_title(str(alias or "")) for alias in item.get("aliases") or [])
            candidates = [candidate for candidate in dict.fromkeys(candidates) if candidate]
            if not candidates:
                return
            score = max(
                self._title_match_score(target, candidate)
                for target in targets
                for candidate in candidates
            )
            if score < 0.50:
                return
            title_id = self._normalise_xbox_or_ta_match_id(item.get("id"))
            if not title_id:
                return
            row = {
                "id": title_id,
                "title": item.get("title") or "",
                "source": item.get("source") or "OpenXBL",
                "score": round(score, 4),
                "unlocked": item.get("unlocked"),
                "total": item.get("total"),
                "gamerscore": item.get("gamerscore"),
                "has_achievements": item.get("has_achievements"),
            }
            if row["id"] and (row["id"] not in rows or self._xbox_search_result_quality(row) > self._xbox_search_result_quality(rows[row["id"]])):
                rows[row["id"]] = row

        for item in self._load_xbox_title_index(api_key, xuid=xuid, include_catalog=False):
            add_candidate(item)

        if include_catalog and explicit_query:
            for item in self._search_microsoft_store_xbox_titles(explicit_query, api_key, limit=max(8, int(limit or 8))):
                add_candidate(item)

        result = list(rows.values())
        result.sort(key=self._xbox_search_result_quality, reverse=True)
        return result[: max(1, min(int(limit or 8), 24))]

    @staticmethod
    def _xbox_search_result_quality(item: dict[str, Any]) -> tuple[float, int, int, int, int, int]:
        source = str(item.get("source") or "").casefold()
        has_achievements = 1 if item.get("has_achievements") else 0
        has_total = 1 if item.get("total") is not None else 0
        total = int(item.get("total") or 0)
        user_scoped = 1 if ("achievement" in source or "titlehistory" in source or "player" in source) else 0
        # Prefer direct Microsoft Store query results over broad buckets when the
        # text score ties: direct search is how unplayed Game Pass/App titles are
        # discovered.
        direct_store = 1 if ("microsoft store" in source or "store search" in source) else 0
        catalog_priority = 0 if "gamepass" in source else 1
        return (float(item.get("score") or 0), has_achievements, has_total, direct_store, user_scoped, total, catalog_priority)

    def _trueachievements_path_from_any(self, value: Any) -> str:
        raw = html.unescape(str(value or "").strip())
        if not raw:
            return ""
        raw = raw.replace("\\/", "/")
        if raw.startswith("ta:"):
            raw = raw[3:]
        if raw.startswith("http://") or raw.startswith("https://"):
            try:
                parsed = urllib.parse.urlparse(raw)
                raw = parsed.path
            except Exception:
                pass
        if not raw.startswith("/"):
            raw = "/" + raw
        match = re.match(r"^/game/([^/?#'\"<>]+)(?:/achievements)?/?$", raw, re.IGNORECASE)
        if not match:
            return ""
        slug = match.group(1).strip()
        if not slug:
            return ""
        return f"/game/{slug}/achievements"

    def _trueachievements_url(self, ta_id: str) -> str:
        path = self._trueachievements_path_from_any(ta_id)
        return TRUEACHIEVEMENTS_BASE_URL + path if path else ""

    def _trueachievements_slug_candidates(self, title: str) -> list[str]:
        title = self._clean_game_title(str(title or ""))
        if not title:
            return []
        cleaned = re.sub(r"[™®©]", "", title)
        cleaned = re.sub(r"['`´’]", "", cleaned)
        cleaned = re.sub(
            r"\b(PC|Xbox|Game Pass|Standard Edition|Deluxe Edition|Premium Edition)\b",
            "",
            cleaned,
            flags=re.I,
        )
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:|_")

        def smart_title_case(value: str) -> str:
            parts = re.split(r"([\s:]+)", value.strip())
            out: list[str] = []
            for part in parts:
                if not part or part.isspace() or re.fullmatch(r"[\s:]+", part):
                    out.append(part)
                    continue
                # Keep short mixed-case tokens such as HiFi as-is, but avoid all-caps
                # query text producing TA slugs like Hi-Fi-RUSH.
                if re.search(r"[a-z][A-Z]", part):
                    out.append(part)
                else:
                    out.append(part[:1].upper() + part[1:].lower())
            return "".join(out).strip()

        def acronym_dehyphenate(value: str) -> str:
            # TrueAchievements uses HiFi-Rush, not Hi-Fi-RUSH/Hi-Fi-Rush. This also
            # handles similar short acronym hyphens without affecting normal titles.
            previous = None
            current = value
            while previous != current:
                previous = current
                current = re.sub(r"\b([A-Za-z]{1,3})-([A-Za-z]{1,3})\b", r"\1\2", current)
            return current

        variants = [cleaned, smart_title_case(cleaned), acronym_dehyphenate(cleaned), smart_title_case(acronym_dehyphenate(cleaned))]
        if ":" in cleaned:
            variants.extend([cleaned.replace(":", ""), cleaned.replace(":", " -")])
        # Known TA slug quirks that do not follow a simple punctuation-to-dash rule.
        quirks = {
            "hi fi rush": "HiFi-Rush",
            "hifi rush": "HiFi-Rush",
            "ghostwire tokyo": "Ghostwire-Tokyo",
        }
        norm = self._normalise_match_title(cleaned)
        if norm in quirks:
            return [quirks[norm]]

        out: list[str] = []
        seen: set[str] = set()
        for value in variants:
            value = value.strip()
            if not value:
                continue
            if "/game/" in value:
                path = self._trueachievements_path_from_any(value)
                slug = path.split("/")[2] if path else ""
            else:
                slug = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-")
            if not slug:
                continue
            # Deduplicate case-insensitively. The lowercase duplicates never help and
            # often create broken TA URLs in the selector.
            key = slug.casefold()
            if key in seen:
                continue
            seen.add(key)
            out.append(slug)
        return out


    def _trueachievements_cookie_header(self) -> str:
        return ""

    def _save_trueachievements_public_profile(self, gamertag: str, verified: bool) -> dict[str, Any]:
        clean_gamertag = self._normalise_trueachievements_profile(gamertag)
        xbox = self._data.setdefault("settings", {}).setdefault("xbox", {})
        xbox["enabled"] = True
        xbox["gamertag"] = clean_gamertag
        xbox["api_key"] = ""
        xbox["xuid"] = ""
        xbox["ta_cookies"] = ""
        xbox["ta_logged_in"] = bool(verified)
        xbox["ta_session_source"] = "public_profile"
        self._save_data()
        if verified:
            return {"ok": True, "message": "Profilo pubblico TrueAchievements verificato.", "gamertag": clean_gamertag}
        return {"ok": False, "message": "Profilo TrueAchievements non verificato.", "gamertag": clean_gamertag}

    def _verify_trueachievements_public_profile(self, gamertag: str) -> tuple[bool, str]:
        clean_gamertag = self._normalise_trueachievements_profile(gamertag)
        if not clean_gamertag:
            return False, "Inserisci il gamertag pubblico TrueAchievements."
        profile_url = self._trueachievements_profile_url(clean_gamertag)
        try:
            profile_html = self._http_text(profile_url, timeout=18)
        except Exception as error:
            return False, str(error)
        if self._looks_like_blocked_trueachievements_page(profile_html):
            return False, "pagina bloccata da TrueAchievements"
        lower_html = profile_html.casefold()
        if "http error 404" in lower_html or "404: not found" in lower_html or "page can’t be found" in lower_html or "page can't be found" in lower_html:
            return False, "profilo pubblico non trovato"
        profile_text = self._html_to_text(profile_html).casefold()
        profile_key = self._normalise_match_title(clean_gamertag)
        for match in re.finditer(r"<h1[^>]*>(.*?)</h1>", profile_html, re.I | re.S):
            if self._normalise_match_title(self._html_to_text(match.group(1))) == profile_key:
                return True, ""
        title_match = re.search(r"<title[^>]*>(.*?)\s+Xbox Achievements\s*</title>", profile_html, re.I | re.S)
        if title_match and self._normalise_match_title(self._html_to_text(title_match.group(1))) == profile_key:
            return True, ""
        # Some public profiles use spaces/plus signs or display names that do not
        # exactly match what the user typed. If TA returned a real gamer profile
        # page, accept it instead of failing on fragile text equality.
        if re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']https://img\.trueachievements\.com/gamer/\d+', profile_html, re.I | re.S):
            return True, ""
        if re.search(r"\bfindgamerid=\d+\b", profile_html, re.I) and "xbox achievements" in lower_html:
            return True, ""
        if title_match and "xbox achievements" in lower_html and "gamer" in lower_html:
            return True, ""
        return False, "profilo pubblico non trovato"

    def _login_trueachievements_sync(self, gamertag: str = "", password: str = "") -> dict[str, Any]:
        # Backward-compatible callable name kept for older frontend bundles.
        return self._test_openxbl_credentials_sync(gamertag or password)

    def _http_text(self, url: str, timeout: int = 18) -> str:
        # Keep all network reads inside Python/urllib only: no curl, no PowerShell,
        # no flashing terminal windows on Windows. If TrueAchievements blocks the
        # direct request, try reader mirrors through urllib as plain HTTP reads.
        errors: list[str] = []
        raw_url = str(url or "").strip()
        is_reader = "r.jina.ai/http" in raw_url.casefold()
        try:
            text = self._http_text_urllib(raw_url, timeout=timeout)
            if text and not self._looks_like_blocked_trueachievements_page(text):
                return text
            if text:
                errors.append(f"urllib: blocked/invalid page ({len(text)} bytes)")
        except Exception as error:
            errors.append(f"urllib: {error}")

        if (not is_reader) and "trueachievements.com" in raw_url.casefold():
            for reader_url in self._trueachievements_reader_urls(raw_url):
                try:
                    text = self._http_text_urllib(reader_url, timeout=max(timeout, 26))
                    if text and not self._looks_like_blocked_trueachievements_page(text):
                        return text
                    if text:
                        errors.append(f"reader: blocked/invalid page ({len(text)} bytes)")
                except Exception as error:
                    errors.append(f"reader: {error}")
        raise RuntimeError("TrueAchievements fetch failed: " + " | ".join(errors[-5:]))


    def _http_request_headers(self, include_auth: bool = False) -> dict[str, str]:
        headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,it;q=0.7",
            "Accept-Encoding": "identity",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Referer": TRUEACHIEVEMENTS_BASE_URL + "/",
            "Upgrade-Insecure-Requests": "1",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        }
        return headers

    def _http_text_urllib(self, url: str, timeout: int = 18) -> str:
        request = urllib.request.Request(url, headers=self._http_request_headers())
        context = ssl._create_unverified_context()
        with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
            return response.read().decode("utf-8", errors="ignore")

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
        completed = subprocess.run(command, capture_output=True, timeout=max(10, int(timeout or 18) + 5))
        if completed.returncode != 0:
            stderr = completed.stderr.decode("utf-8", errors="ignore").strip()
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
        completed = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
            capture_output=True,
            timeout=max(12, int(timeout or 18) + 8),
        )
        if completed.returncode != 0:
            stderr = completed.stderr.decode("utf-8", errors="ignore").strip()
            raise RuntimeError(stderr or f"PowerShell exited {completed.returncode}")
        return completed.stdout.decode("utf-8", errors="ignore")

    @staticmethod
    def _looks_like_blocked_trueachievements_page(text: str) -> bool:
        sample = str(text or "")[:12000]
        lower = sample.casefold()
        if not sample.strip():
            return True
        blocked_tokens = (
            "just a moment", "checking your browser", "cloudflare", "captcha",
            "access denied", "attention required", "enable javascript", "temporarily unavailable",
            "error 1020", "verify you are human", "request unsuccessful",
        )
        if any(token in lower for token in blocked_tokens):
            return True
        # A real TA achievement page/search page has at least one of these.
        if "trueachievements" in lower and (
            "full list of all" in lower
            or "/game/" in lower
            or "/a" in lower
            or "achievements" in lower
            or "gaming" in lower
        ):
            return False
        # Reader/markdown fallback may omit the site chrome but still contains
        # the useful achievement text.
        if "full list of all" in lower and "achievement" in lower:
            return False
        return len(sample.strip()) < 400

    @staticmethod
    def _trueachievements_reader_urls(url: str) -> list[str]:
        raw = str(url or "").strip()
        if not raw:
            return []
        # Jina Reader accepts the target URL in the path. Keep several URL forms
        # because some sites behave differently between http/https redirects.
        without_scheme = re.sub(r"^https?://", "", raw, flags=re.I)
        https_target = "https://" + without_scheme
        http_target = "http://" + without_scheme
        encoded = urllib.parse.quote(https_target, safe=":/?&=%#-._~+")
        out: list[str] = []
        for candidate in (
            "https://r.jina.ai/http://" + https_target,
            "https://r.jina.ai/http://" + http_target,
            "https://r.jina.ai/http://" + without_scheme,
            "https://r.jina.ai/http://" + encoded,
        ):
            if candidate not in out:
                out.append(candidate)
        return out


    def _trueachievements_search_queries(self, query: str) -> list[str]:
        query = self._clean_game_title(str(query or ""))
        if not query:
            return []
        variants: list[str] = []

        def add(value: str) -> None:
            cleaned = self._clean_game_title(value)
            cleaned = re.sub(r"[â„¢Â®Â©]", "", cleaned)
            cleaned = re.sub(r"['`´’]", "", cleaned)
            cleaned = re.sub(r"[:|]+", " ", cleaned)
            cleaned = re.sub(r"\s+", " ", cleaned).strip(" -_")
            if cleaned and cleaned.casefold() not in [item.casefold() for item in variants]:
                variants.append(cleaned)

        add(query)
        add(re.sub(r"\bfor\s+Windows\b", "Windows", query, flags=re.I))
        add(re.sub(r"\((Windows|Xbox|PC)\)", r"\1", query, flags=re.I))
        add(re.sub(r"\b(PC|Xbox|Game Pass)\b", " ", query, flags=re.I))

        normal = self._normalise_match_title(query)
        if "minecraft" in normal and "windows" in normal:
            add("Minecraft Windows 10")
        if "senua" in normal and "hellblade" in normal:
            add("Senuas Saga Hellblade II")
        return variants[:8]

    def _search_trueachievements_titles(self, query: str, limit: int = 8) -> list[dict[str, Any]]:
        query = self._clean_game_title(str(query or ""))
        if not query:
            return []
        rows: dict[str, dict[str, Any]] = {}
        seen_paths: set[str] = set()

        def add(path: str, title: str = "", html_text: str = "", allow_unverified: bool = False, fetch: bool = True) -> None:
            path = self._trueachievements_path_from_any(path)
            if not path:
                return
            path_key = path.casefold()
            if path_key in seen_paths:
                return
            seen_paths.add(path_key)
            ta_id = f"ta:{path}"
            if ta_id in rows:
                return

            # Manual search and bulk scan must stay fast. Direct TA slugs are
            # predictable, so add them as candidates without hitting the network;
            # the selected candidate is validated only when we actually load the
            # achievement list. Older builds fetched every slug candidate and made
            # scans painfully slow.
            parsed_title = title or path.split("/")[2].replace("-", " ")
            total = None
            gamerscore = None
            page_html = html_text
            fetch_failed = False
            if fetch and not page_html:
                try:
                    page_html = self._http_text(TRUEACHIEVEMENTS_BASE_URL + path, timeout=12)
                except Exception as error:
                    fetch_failed = True
                    decky.logger.error(f"TrueAchievements candidate fetch failed for {path}: {error}")
            if page_html:
                parsed_title = self._trueachievements_title_from_html(page_html) or parsed_title
                total = self._trueachievements_total_from_html(page_html)
                gamerscore = self._trueachievements_gamerscore_from_html(page_html)
                page_text = self._html_to_text(page_html)
                looks_like_achievement_page = bool(
                    total
                    or re.search(r"\bFull list of all\b.*?\bachievements\b", page_text, re.I | re.S)
                    or re.search(r'href=["\'](?:https?://www\.trueachievements\.com)?/a\d+(?:/|["\'])', page_html, re.I)
                )
                if not looks_like_achievement_page and not allow_unverified:
                    return
            elif fetch_failed and not allow_unverified:
                return
            rows[ta_id] = {
                "id": ta_id,
                "title": self._clean_game_title(parsed_title),
                "aliases": [parsed_title, path.split("/")[2].replace("-", " ")],
                "total": total,
                "gamerscore": gamerscore,
            }

        search_queries = self._trueachievements_search_queries(query)

        # Direct slug candidates are useful, but must be validated. Otherwise
        # titles like "Minecraft for Windows" can produce plausible-looking TA
        # paths such as /game/Minecraft-for/achievements that later load only a
        # tiny/incorrect page.
        for query_value in search_queries:
            for slug in self._trueachievements_slug_candidates(query_value)[:6]:
                add(f"/game/{slug}/achievements", allow_unverified=False, fetch=True)
                if len(rows) >= max(1, min(limit, 12)):
                    break
            if len(rows) >= max(1, min(limit, 12)):
                break

        # Best-effort site search fallback. Current TA pages expose /game/... links
        # either with or without /achievements, so handle both forms.
        if len(rows) < max(1, min(limit, 8)):
            for query_value in search_queries:
                search_urls = [
                    f"{TRUEACHIEVEMENTS_BASE_URL}/searchresults.aspx?search={urllib.parse.quote(query_value)}",
                    f"{TRUEACHIEVEMENTS_BASE_URL}/search.aspx?search={urllib.parse.quote(query_value)}",
                    f"{TRUEACHIEVEMENTS_BASE_URL}/search?search={urllib.parse.quote(query_value)}",
                ]
                for url in search_urls:
                    try:
                        html_text = self._http_text(url, timeout=14)
                    except Exception as error:
                        decky.logger.error(f"TrueAchievements search failed for {url}: {error}")
                        continue
                    for match in re.finditer(r'href=["\'](?P<href>/game/[^"\'#?]+(?:/achievements)?)["\'][^>]*>(?P<title>.*?)</a>', html_text, re.I | re.S):
                        href = match.group("href")
                        if "/achievement" in href.casefold():
                            continue
                        title_text = self._html_to_text(match.group("title"))
                        add(href, title_text, allow_unverified=False, fetch=True)
                        if len(rows) >= max(1, min(limit, 12)):
                            break
                    if len(rows) >= max(1, min(limit, 8)):
                        break
                if len(rows) >= max(1, min(limit, 8)):
                    break
        result = list(rows.values())
        target = self._normalise_match_title(query)
        for item in result:
            candidates = [self._normalise_match_title(str(item.get("title") or ""))]
            candidates.extend(self._normalise_match_title(str(alias or "")) for alias in item.get("aliases") or [])
            candidates = [candidate for candidate in dict.fromkeys(candidates) if candidate]
            item["score"] = max((self._title_match_score(target, candidate) for candidate in candidates), default=0.0)
        result.sort(key=lambda item: (float(item.get("score") or 0), int(item.get("total") or 0)), reverse=True)
        return result[: max(1, min(limit, 24))]

    def _normalise_trueachievements_profile(self, value: Any) -> str:
        raw = html.unescape(str(value or "").strip())
        if not raw:
            return ""
        raw = raw.replace("\\/", "/")
        # Accept either a gamer/profile URL or a plain gamertag/profile name.
        if "trueachievements.com" in raw.casefold():
            parsed = urllib.parse.urlparse(raw if raw.startswith("http") else "https://" + raw)
            path = urllib.parse.unquote(parsed.path or "").strip("/")
            match = re.search(r"(?:^|/)gamer/([^/?#]+)", "/" + path, re.I)
            if match:
                return urllib.parse.unquote_plus(match.group(1)).strip()
            query = urllib.parse.parse_qs(parsed.query or "")
            for key in ("gamer", "gamertag", "gamername"):
                if query.get(key):
                    return urllib.parse.unquote_plus(str(query[key][0])).strip()
            return raw
        return raw.strip().strip("/")

    def _trueachievements_profile_url(self, profile: str) -> str:
        cleaned = self._normalise_trueachievements_profile(profile)
        if not cleaned:
            return ""
        if cleaned.startswith("http://") or cleaned.startswith("https://"):
            return cleaned
        return f"{TRUEACHIEVEMENTS_BASE_URL}/gamer/{urllib.parse.quote(cleaned.replace(' ', '+'))}"

    def _sync_trueachievements_progress_sync(self, app_id: int) -> dict[str, Any] | None:
        self._load_data()
        xbox = self._data.get("settings", {}).get("xbox") or {}
        if not xbox.get("enabled"):
            return None
        if not self._is_uwphook_shortcut(app_id):
            return None
        key = str(app_id)
        match_id = self._normalise_xbox_or_ta_match_id((self._data.get("xbox_title_ids") or {}).get(key))
        if not match_id:
            payload = self._fetch_xbox_achievements_sync(app_id, auto_resolve=True)
            self._load_data()
            match_id = self._normalise_xbox_or_ta_match_id((self._data.get("xbox_title_ids") or {}).get(key))
            if not match_id:
                return payload

        if not match_id.startswith("ta:"):
            _, api_key = self._openxbl_settings()
            if not api_key:
                return self._fetch_xbox_achievements_sync(app_id, auto_resolve=False)
            try:
                xuid = self._get_openxbl_xuid(api_key)
                if not xuid:
                    return self._fetch_xbox_achievements_sync(app_id, auto_resolve=False)
                raw_payload = self._fetch_openxbl_title_achievements(api_key, xuid, match_id, force_refresh=True)
                payload = self._xbox_payload_to_steam(raw_payload, match_id)
                if payload and payload.get("steam", {}).get("nTotal"):
                    self._save_persisted_xbox_achievement_payload(app_id, match_id, payload)
                    return payload
            except Exception as error:
                decky.logger.error(f"OpenXBL progress sync failed for {match_id}: {error}")
            return self._fetch_xbox_achievements_sync(app_id, auto_resolve=False)

        profile = self._normalise_trueachievements_profile(xbox.get("gamertag") or "")
        if not profile:
            return self._fetch_xbox_achievements_sync(app_id, auto_resolve=False)
        payload = self._fetch_xbox_achievements_sync(app_id, auto_resolve=False)
        if not payload or not payload.get("steam", {}).get("nTotal"):
            return payload
        progress = self._fetch_trueachievements_profile_progress(match_id, profile)
        if not progress:
            return payload
        synced = self._apply_trueachievements_progress_to_steam_payload(payload, progress)
        if synced and synced.get("steam", {}).get("nTotal"):
            self._save_persisted_xbox_achievement_payload(app_id, match_id, synced)
            return synced
        return payload

    def _fetch_trueachievements_profile_progress(self, ta_id: str, profile: str) -> dict[str, Any]:
        game_url = self._trueachievements_url(ta_id)
        if not game_url or not profile:
            return {}
        profile_url = self._trueachievements_profile_url(profile)
        gamer_id = ""
        profile_html = ""
        try:
            if profile_url:
                profile_html = self._http_text(profile_url, timeout=18)
                gamer_id = self._trueachievements_gamer_id_from_html(profile_html)
        except Exception as error:
            decky.logger.error(f"TrueAchievements profile fetch failed for {profile_url}: {error}")
        candidates = self._trueachievements_profile_game_urls(game_url, profile, gamer_id, profile_html)
        best: dict[str, Any] = {}
        for url in candidates:
            try:
                page_html = self._http_text(url, timeout=22)
                progress = self._parse_trueachievements_progress_page(page_html)
                if progress.get("unlocked_names") or progress.get("unlocked_hrefs"):
                    progress["source_url"] = url
                    return progress
                # Keep a confirmed empty result only if the page clearly contains the game.
                if not best and self._trueachievements_title_from_html(page_html):
                    best = progress
                    best["source_url"] = url
            except Exception as error:
                decky.logger.error(f"TrueAchievements progress fetch failed for {url}: {error}")
        return best

    def _trueachievements_gamer_id_from_html(self, html_text: str) -> str:
        for pattern in (
            r"[?&]gamerid=(\d+)",
            r"[?&]gamerId=(\d+)",
            r"gamerid[\"']?\s*[:=]\s*[\"']?(\d+)",
            r"GamerID[\"']?\s*[:=]\s*[\"']?(\d+)",
            r"data-gamerid=[\"'](\d+)[\"']",
            r"data-gamer-id=[\"'](\d+)[\"']",
            r"userid[\"']?\s*[:=]\s*[\"']?(\d+)",
            r"data-userid=[\"'](\d+)[\"']",
        ):
            match = re.search(pattern, html_text or "", re.I)
            if match:
                return match.group(1)
        return ""

    def _trueachievements_profile_game_urls(self, game_url: str, profile: str, gamer_id: str = "", profile_html: str = "") -> list[str]:
        urls: list[str] = []
        parsed = urllib.parse.urlparse(game_url)
        game_path = parsed.path or ""
        base_game = re.sub(r"/achievements/?$", "", game_path, flags=re.I).rstrip("/")
        clean_profile = self._normalise_trueachievements_profile(profile)

        def add(url: str) -> None:
            if url and url not in urls:
                urls.append(url)

        query_variants: list[tuple[str, str]] = []
        if gamer_id:
            query_variants.extend([("gamerid", gamer_id), ("gamerId", gamer_id)])
        if clean_profile:
            query_variants.extend([
                ("gamer", clean_profile),
                ("gamertag", clean_profile),
                ("gamername", clean_profile),
                ("user", clean_profile),
            ])

        # Try the game-specific achievement page first. Older builds paged the
        # global profile feed before trying this, which was slow and only found
        # recently-unlocked games. The game+gamer page is the only useful target
        # for reliable per-game sync when the public profile exposes it.
        for key, value in query_variants:
            parsed_query = dict(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True))
            parsed_query[key] = value
            add(urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(parsed_query))))
            for extra in ({"showall": "1"}, {"showall": "1", "view": "list"}, {"dlc": "1", "showall": "1"}, {"unlocked": "1"}):
                next_query = dict(parsed_query)
                next_query.update(extra)
                add(urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(next_query))))

        # If the public gamer page already contains a per-game link, try it next.
        if profile_html and base_game:
            for match in re.finditer(r'href=["\']([^"\']+)["\']', profile_html, re.I):
                href = html.unescape(match.group(1)).replace("\\/", "/")
                if base_game.casefold() not in href.casefold():
                    continue
                if href.startswith("/"):
                    href = TRUEACHIEVEMENTS_BASE_URL + href
                elif href.startswith("//"):
                    href = "https:" + href
                if href.startswith("http"):
                    add(href)

        if clean_profile:
            profile_base = TRUEACHIEVEMENTS_BASE_URL + "/gamer/" + urllib.parse.quote(clean_profile)
            if base_game:
                slug = base_game.split("/")[-1]
                for suffix in (
                    f"/{slug}", f"/{slug}/achievements", f"/game/{slug}", f"/game/{slug}/achievements",
                    f"/achievements?game={urllib.parse.quote(slug)}", f"/achievements?game={urllib.parse.quote(slug)}&showall=1",
                ):
                    add(profile_base + suffix)
            # Last resort: public recent-feed pages. Keep bounded but broader than
            # before; this is only used after direct game-specific URLs fail.
            for suffix in ("/achievements", "/achievements?showall=1", "/achievements?dlc=1", "/achievements?showall=1&dlc=1"):
                add(profile_base + suffix)
            for page in range(2, 16):
                add(profile_base + f"/achievements?page={page}")
                add(profile_base + f"/achievements?p={page}")
        return urls[:44]

    def _parse_trueachievements_progress_panels(self, html_text: str) -> dict[str, Any]:
        unlocked_names: set[str] = set()
        unlocked_hrefs: set[str] = set()
        unlocked_dates: dict[str, str] = {}
        panel_pattern = re.compile(r"<li\b(?P<attrs>[^>]*)>(?P<body>.*?)</li>", re.I | re.S)
        title_pattern = re.compile(
            r'<a[^>]+class=["\']title["\'][^>]+href=["\'](?P<href>(?:https?://www\.trueachievements\.com)?/a\d+(?:/[^"\'#?]*)?)(?:#[^"\']*)?["\'][^>]*>(?P<name>.*?)</a>',
            re.I | re.S,
        )
        for match in panel_pattern.finditer(html_text or ""):
            block = match.group(0)
            title_match = title_pattern.search(block)
            if not title_match:
                continue
            lower = block.casefold()
            is_unlocked = (
                'class="lock u"' in lower
                or "class='lock u'" in lower
                or "fa-unlock-alt" in lower
                or re.search(r'\bclass=["\'][^"\']*\bw\b[^"\']*["\']', match.group("attrs") or "", re.I) is not None
            )
            if "fa-lock" in lower and "fa-unlock-alt" not in lower:
                is_unlocked = False
            if "locked" in self._html_to_text(block).casefold() and "fa-unlock-alt" not in lower and 'class="lock u"' not in lower and "class='lock u'" not in lower:
                is_unlocked = False
            if not is_unlocked:
                continue
            href = html.unescape(title_match.group("href")).split("?")[0]
            name = self._html_to_text(title_match.group("name"))
            name_key = self._normalise_match_title(name)
            href_key = self._normalise_trueachievements_achievement_href(href)
            if name_key and not self._looks_like_trueachievements_bad_title(name):
                unlocked_names.add(name_key)
            if href_key:
                unlocked_hrefs.add(href_key)
            date_text = self._trueachievements_unlock_date_from_block(block)
            if date_text:
                if name_key:
                    unlocked_dates[name_key] = date_text
                if href_key:
                    unlocked_dates[href_key] = date_text
        return {
            "unlocked_names": sorted(unlocked_names),
            "unlocked_hrefs": sorted(unlocked_hrefs),
            "unlocked_dates": unlocked_dates,
        }

    def _parse_trueachievements_progress_page(self, html_text: str) -> dict[str, Any]:
        panel_progress = self._parse_trueachievements_progress_panels(html_text)
        if panel_progress.get("unlocked_names") or panel_progress.get("unlocked_hrefs"):
            return panel_progress
        unlocked_names: set[str] = set()
        unlocked_hrefs: set[str] = set()
        unlocked_dates: dict[str, str] = {}
        pattern = re.compile(r'<a[^>]+href=["\'](?P<href>(?:https?://www\.trueachievements\.com)?/a\d+(?:/[^"\'#?]*)?)(?:[?#][^"\']*)?["\'][^>]*>(?P<name>.*?)</a>', re.I | re.S)
        matches = list(pattern.finditer(html_text or ""))
        # Reader/markdown pages expose TA links as [Name](https://.../a123/name).
        markdown_pattern = re.compile(r"\[(?P<name>[^\]\n]{2,140})\]\((?P<href>(?:https?://www\.trueachievements\.com)?/a\d+(?:/[^)\s#]*)?)(?:#[^)]*)?\)", re.I | re.S)
        markdown_matches = list(markdown_pattern.finditer(html_text or ""))
        if markdown_matches and not matches:
            class _M:
                def __init__(self, m): self._m=m
                def group(self, name): return self._m.group(name)
                def start(self): return self._m.start()
                def end(self): return self._m.end()
            matches = [_M(m) for m in markdown_matches]
        for index, match in enumerate(matches):
            href = html.unescape(match.group("href")).split("?")[0]
            name = self._html_to_text(match.group("name"))
            if not href or not name:
                continue
            start = max(0, match.start() - 1800)
            end = matches[index + 1].start() if index + 1 < len(matches) else min(len(html_text), match.end() + 2400)
            block = html_text[start:end]
            if self._trueachievements_progress_block_is_unlocked(block):
                name_key = self._normalise_match_title(name)
                href_key = self._normalise_trueachievements_achievement_href(href)
                if name_key:
                    unlocked_names.add(name_key)
                if href_key:
                    unlocked_hrefs.add(href_key)
                date_text = self._trueachievements_unlock_date_from_block(block)
                if date_text:
                    if name_key:
                        unlocked_dates[name_key] = date_text
                    if href_key:
                        unlocked_dates[href_key] = date_text
        return {
            "unlocked_names": sorted(unlocked_names),
            "unlocked_hrefs": sorted(unlocked_hrefs),
            "unlocked_dates": unlocked_dates,
        }

    def _trueachievements_progress_block_is_unlocked(self, block: str) -> bool:
        lower_html = str(block or "").casefold()
        lower_text = self._html_to_text(block).casefold()
        positive_tokens = (
            "achievement unlocked",
            "unlocked on",
            "won on",
            " date won",
            "date won",
            "class=\"won",
            "class='won",
            "class=\"lock u",
            "class='lock u",
            "class=\"unlocked",
            "class='unlocked",
            "class=\"complete",
            "class='complete",
            "class=\"earned",
            "class='earned",
            "fa-unlock-alt",
            "data-unlocked=\"true",
            "data-earned=\"true",
        )
        if any(token in lower_html or token in lower_text for token in positive_tokens):
            return True
        # TA pages commonly show a completed date near won achievements.
        if re.search(r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2},\s+20\d{2}\b", lower_text, re.I):
            return True
        if re.search(r"\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+20\d{2}\b", lower_text, re.I):
            return True
        return False

    def _trueachievements_unlock_date_from_block(self, block: str) -> str:
        text = self._html_to_text(block)
        for pattern in (
            r"(?:Unlocked|Won|Date won)\s*(?:on)?\s*[:\-]?\s*([A-Z][a-z]{2,9}\s+\d{1,2},\s+20\d{2})",
            r"\b([A-Z][a-z]{2,9}\s+\d{1,2},\s+20\d{2})\b",
            r"\b(\d{1,2}\s+[A-Z][a-z]{2,9}\s+20\d{2})\b",
        ):
            match = re.search(pattern, text, re.I)
            if match:
                return match.group(1)
        return ""

    def _apply_trueachievements_progress_to_steam_payload(self, payload: dict[str, Any], progress: dict[str, Any]) -> dict[str, Any]:
        try:
            cloned = json.loads(json.dumps(payload))
        except Exception:
            cloned = dict(payload)
        unlocked_names = set(progress.get("unlocked_names") or [])
        unlocked_hrefs = set(progress.get("unlocked_hrefs") or [])
        unlocked_dates = progress.get("unlocked_dates") or {}
        if not unlocked_names and not unlocked_hrefs:
            return cloned
        all_items: list[dict[str, Any]] = []
        data = ((cloned.get("user") or {}).get("data") or {}) if isinstance(cloned, dict) else {}
        if isinstance(data, dict):
            for bucket in ("achieved", "hidden", "unachieved"):
                values = data.get(bucket) or {}
                if isinstance(values, dict):
                    all_items.extend(item for item in values.values() if isinstance(item, dict))
                elif isinstance(values, list):
                    all_items.extend(item for item in values if isinstance(item, dict))
        if not all_items:
            steam = cloned.get("steam") if isinstance(cloned, dict) else {}
            for key in ("vecHighlight", "vecAchievedHidden", "vecUnachieved"):
                value = steam.get(key) if isinstance(steam, dict) else None
                if isinstance(value, list):
                    all_items.extend(item for item in value if isinstance(item, dict))
        # Deduplicate by Steam achievement id.
        unique: dict[str, dict[str, Any]] = {}
        for item in all_items:
            item_id = str(item.get("strID") or item.get("id") or item.get("strName") or "")
            if item_id:
                unique[item_id] = item
        all_items = list(unique.values())
        achieved: dict[str, Any] = {}
        unachieved: dict[str, Any] = {}
        hidden: dict[str, Any] = {}
        global_data: dict[str, float] = {}
        for item in all_items:
            name_key = self._normalise_match_title(str(item.get("strName") or item.get("name") or ""))
            href_key = self._normalise_trueachievements_achievement_href(str(item.get("playhubTaHref") or item.get("taHref") or item.get("id") or ""))
            is_unlocked = bool((name_key and name_key in unlocked_names) or (href_key and href_key in unlocked_hrefs))
            item["bAchieved"] = is_unlocked
            item["flAchieved"] = 100.0 if is_unlocked else 0.0
            item["flCurrentProgress"] = 1 if is_unlocked else 0
            date_value = unlocked_dates.get(name_key) or unlocked_dates.get(href_key) or ""
            item["rtUnlocked"] = self._date_to_epoch(date_value) if is_unlocked and date_value else (item.get("rtUnlocked") if is_unlocked else 0)
            key = str(item.get("strID") or item.get("strName") or "")
            if not key:
                continue
            if is_unlocked:
                achieved[key] = item
            elif item.get("bHidden"):
                hidden[key] = item
            else:
                unachieved[key] = item
            global_data[key] = float(item.get("flAchieved") or 0)
        total = len(achieved) + len(hidden) + len(unachieved)
        if total:
            cloned["steam"] = {
                "nAchieved": len(achieved),
                "nTotal": total,
                "vecAchievedHidden": list(hidden.values())[:12],
                "vecHighlight": list(achieved.values())[:3],
                "vecUnachieved": list(unachieved.values())[:12],
            }
            cloned["user"] = {"loading": False, "data": {"achieved": achieved, "hidden": hidden, "unachieved": unachieved}}
            cloned["global"] = {"loading": False, "data": global_data}
            cloned["progress"] = {"achieved": len(achieved), "total": total, "percentage": (len(achieved) / total) * 100 if total else 0}
            cloned["trueachievements_profile_sync"] = {
                "profile": profile if (profile := self._normalise_trueachievements_profile((self._data.get("settings", {}).get("xbox") or {}).get("gamertag") or "")) else "",
                "source_url": progress.get("source_url") or "",
                "updated_at": now(),
            }
        return cloned

    @staticmethod
    def _normalise_trueachievements_achievement_href(value: Any) -> str:
        raw = html.unescape(str(value or "").strip()).split("?")[0]
        if not raw:
            return ""
        match = re.search(r"/a(\d+)/", raw, re.I)
        if match:
            return f"a{match.group(1)}"
        return re.sub(r"[^a-z0-9]+", "", raw.casefold())


    def _load_trueachievements_icon_cache(self) -> dict[str, Any]:
        try:
            if not self._xbox_icon_cache_file.exists():
                return {}
            value = json.loads(self._xbox_icon_cache_file.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except Exception:
            return {}

    def _save_trueachievements_icon_cache(self, cache: dict[str, Any]) -> None:
        try:
            self._settings_dir.mkdir(parents=True, exist_ok=True)
            self._xbox_icon_cache_file.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as error:
            decky.logger.error(f"Failed saving TrueAchievements icon cache: {error}")

    def _trueachievements_achievement_detail_url(self, href: str) -> str:
        raw = html.unescape(str(href or "")).strip()
        if not raw or raw.startswith("ta-text:"):
            return ""
        if raw.startswith("http://") or raw.startswith("https://"):
            return raw
        if raw.startswith("/"):
            return TRUEACHIEVEMENTS_BASE_URL + raw
        if raw.startswith("a") and re.match(r"a\d+", raw, re.I):
            return TRUEACHIEVEMENTS_BASE_URL + "/" + raw
        return ""

    def _trueachievements_item_image_from_href(self, href: str) -> str:
        # Disabled intentionally: this URL family is TA's wide share-card art,
        # not the compact achievement icon wanted in Steam.
        return ""

    @staticmethod
    def _is_bad_trueachievements_achievement_image(url: Any) -> bool:
        lower = str(url or "").casefold()
        return (
            not lower
            or lower.startswith("data:image/")
            or "img.trueachievements.com/item/" in lower
            or "trueachievements.com/gameimage/" in lower
            or "trueachievements.com/gameimagem/" in lower
            or "/gameimage/" in lower
            or "/gameimagem/" in lower
            or any(token in lower for token in ("avatar", "userpic", "profile", "gamercard", "favicon", "ads"))
        )

    def _trueachievements_image_from_detail_page(self, html_text: str, name: str = "") -> str:
        # Achievement detail pages expose both the real icon under /imagestore/
        # and a wide share card under img.trueachievements.com/item. Prefer the
        # former; the share card looks bad in Steam's achievement list.
        candidates: list[tuple[int, str]] = []

        def add(value: Any, score: int = 0, context: str = "") -> None:
            src = html.unescape(str(value or "")).replace("\\/", "/").strip().strip('"').strip("'")
            if not src:
                return
            if "," in src or re.search(r"\s+\d+(?:x|w)\b", src):
                for piece in src.split(","):
                    add(piece.strip().split()[0] if piece.strip() else "", score, context)
                return
            if src.startswith("//"):
                src = "https:" + src
            elif src.startswith("/"):
                src = TRUEACHIEVEMENTS_BASE_URL + src
            if src.startswith("http://"):
                src = "https://" + src[len("http://"):]
            if not src.startswith("https://"):
                return
            lower = (src + " " + context).casefold()
            if self._is_bad_trueachievements_achievement_image(src):
                return
            if any(token in lower for token in ("avatar", "userpic", "profile", "logo", "sprite", "gamercard", "favicon", "ads")):
                return
            if not ("imagestore" in lower or "achievement" in lower or re.search(r"\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$", src, re.I)):
                return
            final_score = score
            if "og:image" in context.casefold() or "twitter:image" in context.casefold():
                final_score -= 60
            if "achievement" in lower:
                final_score += 40
            if "imagestore" in lower:
                final_score += 140
            if re.search(r"\.(?:jpg|jpeg)(?:[?#].*)?$", src, re.I):
                final_score += 10
            if name and self._normalise_match_title(name) and self._normalise_match_title(name) in self._normalise_match_title(context):
                final_score += 8
            candidates.append((final_score, self._xbox_square_icon_source(src)))

        text = str(html_text or "")
        for panel_match in re.finditer(r'class=["\'][^"\']*\bach-panel\b[^"\']*["\']', text, re.I):
            panel = text[max(0, panel_match.start() - 600): min(len(text), panel_match.end() + 5000)]
            image = self._trueachievements_image_from_block(panel, name)
            if image:
                add(image, 220, panel)
            for match in re.finditer(r'(?:src|data-src|srcset|data-srcset)=["\']([^"\']*?/imagestore/[^"\']+)["\']', panel, re.I | re.S):
                add(match.group(1), 230, panel)
        for pattern in (
            r'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\'][^>]+content=["\']([^"\']+)["\'][^>]*>',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\'][^>]*>',
        ):
            for match in re.finditer(pattern, text, re.I | re.S):
                add(match.group(1), 0, match.group(0))
        image = self._trueachievements_image_from_block(text, name)
        if image:
            add(image, 60, "achievement block")
        for match in re.finditer(r"https?://[^\s'\"<>]+(?:jpg|jpeg|png|webp)(?:\?[^\s'\"<>]*)?", text, re.I):
            add(match.group(0), 10, text[max(0, match.start() - 180): match.end() + 180])
        clean = [(score, url) for score, url in candidates if url]
        if not clean:
            return ""
        return sorted(dict((url, score) for score, url in clean).items(), key=lambda item: item[1], reverse=True)[0][0]

    def _trueachievements_detail_image_for_item(self, item: dict[str, Any]) -> str:
        href = str(item.get("taHref") or item.get("playhubTaHref") or item.get("id") or "")
        href_key = self._normalise_trueachievements_achievement_href(href)
        if not href_key or href.startswith("ta-text:"):
            return ""
        icon_cache = self._load_trueachievements_icon_cache()
        cached = icon_cache.get(href_key)
        if isinstance(cached, dict) and cached.get("url"):
            return str(cached.get("url") or "")
        if isinstance(cached, str) and cached:
            return cached
        detail_url = self._trueachievements_achievement_detail_url(href)
        if not detail_url:
            return ""
        try:
            detail_html = self._http_text(detail_url, timeout=7)
            image = self._trueachievements_image_from_detail_page(detail_html, str(item.get("name") or ""))
            icon_cache[href_key] = {"url": image, "updated_at": now(), "source": detail_url}
            self._save_trueachievements_icon_cache(icon_cache)
            return image
        except Exception as error:
            # Cache the miss briefly so a broken/detail-blocked page does not slow
            # every library visit forever.
            icon_cache[href_key] = {"url": "", "updated_at": now(), "error": str(error)[:180]}
            self._save_trueachievements_icon_cache(icon_cache)
            decky.logger.error(f"TrueAchievements icon fetch failed for {detail_url}: {error}")
            return ""

    def _enrich_trueachievements_achievement_images(self, items: list[dict[str, Any]], max_detail_fetches: int = 240) -> list[dict[str, Any]]:
        enriched: list[dict[str, Any]] = []
        missing_indexes: list[int] = []
        for raw in items:
            item = dict(raw) if isinstance(raw, dict) else {}
            if not item:
                continue
            image = self._xbox_achievement_image(item)
            if self._is_bad_trueachievements_achievement_image(image):
                image = ""
            if image:
                item["mediaAssets"] = [{"type": "Icon", "url": image}]
                for key in ("displayImageUrl", "imageUrl", "iconUrl", "thumbnailUrl", "playhubImage"):
                    item[key] = image
            else:
                missing_indexes.append(len(enriched))
            enriched.append(item)

        targets = missing_indexes[: max(0, int(max_detail_fetches or 0))]
        if targets:
            def fetch(index: int) -> tuple[int, str]:
                try:
                    return index, self._trueachievements_detail_image_for_item(enriched[index])
                except Exception:
                    return index, ""
            try:
                with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
                    for index, image in executor.map(fetch, targets):
                        if not image:
                            continue
                        item = enriched[index]
                        item["mediaAssets"] = [{"type": "Icon", "url": image}]
                        for key in ("displayImageUrl", "imageUrl", "iconUrl", "thumbnailUrl", "playhubImage"):
                            item[key] = image
            except Exception as error:
                decky.logger.error(f"TrueAchievements parallel image enrichment failed: {error}")

        for item in enriched:
            if self._xbox_achievement_image(item):
                continue
            fallback = self._generated_trueachievements_badge(str(item.get("name") or "Achievement"))
            item["mediaAssets"] = [{"type": "Icon", "url": fallback}]
            for key in ("displayImageUrl", "imageUrl", "iconUrl", "thumbnailUrl", "playhubImage"):
                item[key] = fallback
        return enriched

    def _generated_trueachievements_badge(self, title: str) -> str:
        text = self._clean_game_title(title or "Achievement")[:42]
        initials = "".join(part[:1] for part in re.findall(r"[A-Za-z0-9]+", text)[:3]).upper() or "TA"
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">'
            '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
            '<stop offset="0" stop-color="#174D7A"/><stop offset="1" stop-color="#0E1E2E"/>'
            '</linearGradient></defs>'
            '<rect width="256" height="256" rx="34" fill="url(#g)"/>'
            '<circle cx="128" cy="96" r="48" fill="#2EA7FF" opacity="0.85"/>'
            f'<text x="128" y="111" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="800" fill="white">{html.escape(initials)}</text>'
            '<text x="128" y="188" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" font-weight="700" fill="white">TA</text>'
            '</svg>'
        )
        encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
        return "data:image/svg+xml;base64," + encoded

    def _fetch_trueachievements_achievements(self, ta_id: str, max_detail_fetches: int = 0) -> dict[str, Any] | None:
        url = self._trueachievements_url(ta_id)
        if not url:
            return None
        cache_key = f"ta{PLAYHUB_ACHIEVEMENT_CACHE_VERSION}:" + hashlib.sha1(url.encode("utf-8")).hexdigest()
        cached = self._load_xbox_achievement_cache(cache_key)
        if cached:
            return self._xbox_payload_to_steam(cached, ta_id)

        urls: list[str] = []
        def add_url(candidate: str) -> None:
            if candidate and candidate not in urls:
                urls.append(candidate)

        # Exact selected/pasted URL first. Do not walk endless slug guesses before
        # validating the user's chosen TA page. This avoids regressions where a
        # valid match is followed by a bad canonical guess and ends up blank.
        add_url(url)
        if "?" not in url:
            add_url(url + "?showall=1")
            add_url(url + "?view=list")
        for base in self._trueachievements_fetch_url_candidates(url):
            add_url(base)
            if "?" not in base:
                add_url(base + "?showall=1")
        for reader_url in self._trueachievements_reader_urls(url):
            add_url(reader_url)

        last_error = ""
        best_partial: dict[str, Any] | None = None
        best_count = 0
        expected_seen = 0
        for candidate_url in urls[:14]:
            try:
                html_text = self._http_text(candidate_url, timeout=24)
                payload = self._parse_trueachievements_page(html_text, candidate_url, max_detail_fetches=max_detail_fetches)
                expected = self._trueachievements_total_from_html(html_text) or 0
                expected_seen = max(expected_seen, expected)
                count = len((payload or {}).get("achievements") or []) if payload else 0
                if payload and count:
                    # Prefer complete lists, but never discard a valid parsed list
                    # entirely. Some TA reader outputs omit totals or ads split the
                    # page; a partial list is still better than "no achievements".
                    if count > best_count:
                        best_partial = payload
                        best_count = count
                    if not expected or count >= max(3, int(expected * 0.70)):
                        payload["url"] = candidate_url
                        self._save_xbox_achievement_cache(cache_key, payload)
                        return self._xbox_payload_to_steam(payload, ta_id)
            except Exception as error:
                last_error = str(error)
                decky.logger.error(f"TrueAchievements fetch failed for {candidate_url}: {error}")
        if best_partial and best_partial.get("achievements"):
            best_partial["url"] = url
            best_partial["playhubPartial"] = bool(expected_seen and best_count < expected_seen)
            self._save_xbox_achievement_cache(cache_key, best_partial)
            return self._xbox_payload_to_steam(best_partial, ta_id)
        if last_error:
            decky.logger.error(f"TrueAchievements could not load achievements for {url}: {last_error}")
        return None


    def _trueachievements_fetch_url_candidates(self, url: str) -> list[str]:
        out: list[str] = []
        def add(value: str) -> None:
            if value and value not in out:
                out.append(value)
        add(url)
        parsed = urllib.parse.urlparse(url)
        path = parsed.path or ""
        match = re.search(r"/game/([^/]+)/achievements", path, re.I)
        if not match:
            return out
        slug = urllib.parse.unquote(match.group(1))
        title = slug.replace("-", " ")
        for candidate_slug in self._trueachievements_slug_candidates(title):
            add(TRUEACHIEVEMENTS_BASE_URL + f"/game/{candidate_slug}/achievements")
        # A few high-profile TA slugs intentionally remove punctuation rather than
        # replacing it with a dash. Keep this local and deterministic instead of
        # doing slow network validation during the search step.
        no_punct = re.sub(r"[^A-Za-z0-9]+", " ", title).strip()
        if no_punct:
            compact_words = no_punct.split()
            if len(compact_words) >= 2:
                camelish = "".join(word[:1].upper() + word[1:].lower() for word in compact_words[:-1]) + "-" + (compact_words[-1][:1].upper() + compact_words[-1][1:].lower())
                add(TRUEACHIEVEMENTS_BASE_URL + f"/game/{camelish}/achievements")
        return out

    def _trueachievements_title_from_html(self, html_text: str) -> str:
        for pattern in (
            r"<h1[^>]*>(.*?)\s+Achievements\s*</h1>",
            r"<title[^>]*>(.*?)\s+Achievements\s*\|",
            r"#\s*(.*?)\s+Achievements",
        ):
            match = re.search(pattern, html_text, re.I | re.S)
            if match:
                return self._clean_game_title(self._html_to_text(match.group(1)))
        return ""

    def _trueachievements_total_from_html(self, html_text: str) -> int | None:
        match = re.search(r"Full list of all\s+([0-9,]+)\s+.*?achievements", html_text, re.I | re.S)
        return self._safe_int((match.group(1) if match else "").replace(",", "")) if match else None

    def _trueachievements_gamerscore_from_html(self, html_text: str) -> int | None:
        match = re.search(r"worth\s+([0-9,]+)\s+gamerscore", html_text, re.I | re.S)
        return self._safe_int((match.group(1) if match else "").replace(",", "")) if match else None

    def _parse_trueachievements_page(self, html_text: str, url: str, max_detail_fetches: int = 0) -> dict[str, Any] | None:
        title = self._trueachievements_title_from_html(html_text) or "TrueAchievements"
        expected_total = self._trueachievements_total_from_html(html_text) or 0

        anchor_achievements = self._parse_trueachievements_anchor_achievements(html_text)
        text_achievements = self._parse_trueachievements_text_fallback(self._html_to_text(html_text), set())

        def quality(items: list[dict[str, Any]]) -> tuple[int, int, int, int]:
            if not items:
                return (0, 0, 0, 0)
            image_count = sum(1 for item in items if self._xbox_achievement_image(item))
            desc_count = sum(1 for item in items if str(item.get("description") or item.get("lockedDescription") or "").strip())
            # Heavy penalty for guide/solution-derived junk. Those were the source
            # of fake entries such as "Score 1,000,000 Chips..." with a guide link
            # as the description.
            bad_count = sum(1 for item in items if self._looks_like_trueachievements_junk_item(item))
            total_score = len(items) * 100 + image_count * 8 + desc_count * 4 - bad_count * 300
            if expected_total:
                total_score -= abs(expected_total - len(items)) * 30
                if len(items) >= max(3, int(expected_total * 0.75)):
                    total_score += 250
            return (total_score, image_count, desc_count, -bad_count)

        # Prefer the structured anchor parser only when it looks complete. If TA or
        # a reader/proxy turns guide links into /a12345/#Solutions anchors, the
        # anchor parser can return just a couple of bogus items. In that case the
        # public text list is more reliable.
        achievements = anchor_achievements
        if text_achievements and quality(text_achievements) > quality(anchor_achievements):
            achievements = self._merge_trueachievements_text_and_anchor_achievements(text_achievements, anchor_achievements)

        # Final sanity filter: no guide links, no TA flags, no menu labels.
        clean: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in achievements:
            if self._looks_like_trueachievements_junk_item(item):
                continue
            href_key = self._normalise_trueachievements_achievement_href(str(item.get("taHref") or item.get("playhubTaHref") or item.get("id") or ""))
            name_key = self._normalise_match_title(str(item.get("name") or ""))
            key = href_key if href_key and not href_key.startswith("tatext") else name_key or href_key
            if not key or key in seen:
                continue
            seen.add(key)
            clean.append(item)

        if expected_total and len(clean) < max(3, int(expected_total * 0.45)) and text_achievements:
            # The page clearly advertises many achievements, but parsing produced a
            # tiny list. Do not cache partial garbage; use the cleaner text fallback.
            clean = [item for item in text_achievements if not self._looks_like_trueachievements_junk_item(item)]

        if not clean:
            return None

        image_map = self._trueachievements_image_map_from_html(html_text)
        if image_map:
            for item in clean:
                if self._xbox_achievement_image(item):
                    continue
                key = self._normalise_match_title(str(item.get("name") or ""))
                image = image_map.get(key, "")
                if image:
                    item["mediaAssets"] = [{"type": "Icon", "url": image}]
                    for field in ("displayImageUrl", "imageUrl", "iconUrl", "thumbnailUrl", "playhubImage"):
                        item[field] = image

        # Detail pages expose the nicest TA icon, but fetching one page per
        # achievement is slow and quickly trips TA rate limits. Keep it opt-in;
        # the OpenXBL flow has a local square fallback for any remaining Xbox art.
        if max_detail_fetches:
            clean = self._enrich_trueachievements_achievement_images(clean, max_detail_fetches=max_detail_fetches)
        return {"provider": "trueachievements", "title": title, "url": url, "achievements": clean}

    def _parse_trueachievements_anchor_achievements(self, html_text: str) -> list[dict[str, Any]]:
        achievements: list[dict[str, Any]] = []
        seen: set[str] = set()

        def name_from_href(href: str) -> str:
            raw = urllib.parse.unquote(str(href or "").split("?")[0].split("#")[0].rstrip("/").split("/")[-1])
            raw = re.sub(r"-achievement$", "", raw, flags=re.I)
            raw = re.sub(r"-xbox-[a-z0-9-]+$", "", raw, flags=re.I)
            raw = re.sub(r"[-_]+", " ", raw).strip()
            return self._clean_game_title(raw.title())

        def add_achievement(href: str, name: str, block: str, anchor_html: str = "") -> None:
            raw_href = html.unescape(str(href or "")).strip()
            raw_anchor = str(anchor_html or "")
            if not raw_href:
                return
            lower_href = raw_href.casefold()
            lower_anchor = raw_anchor.casefold()
            # TA guide/solution links reuse the same /a12345/ URL plus #Solutions.
            # They are not achievement entries and must never become achievements.
            if "#solution" in lower_href or "#solution" in lower_anchor or "how to unlock" in lower_anchor:
                return
            if raw_href.startswith(TRUEACHIEVEMENTS_BASE_URL):
                parsed = urllib.parse.urlparse(raw_href)
                raw_href = parsed.path
            href = raw_href.split("?")[0].split("#")[0].rstrip("/")
            if not href.startswith("/a"):
                return
            key = self._normalise_trueachievements_achievement_href(href)
            clean_name = self._clean_game_title(self._html_to_text(name) or name_from_href(href))
            if not key or key in seen or not clean_name:
                return
            if self._looks_like_trueachievements_bad_title(clean_name):
                return
            description = self._trueachievements_description_from_block(block, clean_name)
            if self._looks_like_trueachievements_bad_description(description):
                description = ""
            gamerscore = self._trueachievements_gamerscore_from_block(block)
            image = self._trueachievements_image_from_block(block, clean_name)
            seen.add(key)
            achievements.append({
                "id": href,
                "taHref": href,
                "playhubTaHref": href,
                "name": clean_name,
                "description": description,
                "lockedDescription": description,
                "gamerscore": gamerscore,
                "isUnlocked": False,
                "progressState": "NotStarted",
                "mediaAssets": [{"type": "Icon", "url": image}] if image else [],
                "provider": "trueachievements",
            })

        pattern = re.compile(r'<a[^>]+href=["\'](?P<href>(?:https?://www\.trueachievements\.com)?/a\d+(?:/[^"\'#?]*)?)(?:[?#][^"\']*)?["\'][^>]*>(?P<name>.*?)</a>', re.I | re.S)
        matches = list(pattern.finditer(html_text or ""))
        for index, match in enumerate(matches):
            start = max(0, match.start() - 1800)
            end = matches[index + 1].start() if index + 1 < len(matches) else min(len(html_text), match.end() + 2600)
            add_achievement(match.group("href"), match.group("name"), html_text[start:end], match.group(0))

        markdown_links = list(re.finditer(r"\[(?P<name>[^\]\n]{2,140})\]\((?P<href>(?:https?://www\.trueachievements\.com)?/a\d+(?:/[^)\s#]*)?)(?P<tail>[^)]*)\)", html_text or "", re.I | re.S))
        for index, match in enumerate(markdown_links):
            full = match.group(0)
            href = (match.group("href") or "") + (match.group("tail") or "")
            start = max(0, match.start() - 600)
            end = markdown_links[index + 1].start() if index + 1 < len(markdown_links) else min(len(html_text), match.end() + 1200)
            add_achievement(href, match.group("name"), html_text[start:end], full)
        return achievements

    def _merge_trueachievements_text_and_anchor_achievements(self, text_items: list[dict[str, Any]], anchor_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        by_name = {self._normalise_match_title(str(item.get("name") or "")): item for item in anchor_items if isinstance(item, dict)}
        merged: list[dict[str, Any]] = []
        for item in text_items:
            if not isinstance(item, dict):
                continue
            key = self._normalise_match_title(str(item.get("name") or ""))
            anchor = by_name.get(key) if key else None
            if anchor:
                # Text fallback entries use ta-text:<name> pseudo ids. Those are
                # useful for text recovery, but they prevent detail-page image
                # fetches and href-based profile sync. Treat them as missing and
                # replace them with the real TA /a12345/ href from the anchor parser.
                for field in ("id", "taHref", "playhubTaHref"):
                    current = str(item.get(field) or "")
                    if anchor.get(field) and (not current or current.startswith("ta-text:")):
                        item[field] = anchor.get(field)
                if anchor.get("gamerscore") and not item.get("gamerscore"):
                    item["gamerscore"] = anchor.get("gamerscore")
                image = self._xbox_achievement_image(anchor)
                if image and not self._xbox_achievement_image(item):
                    item["mediaAssets"] = [{"type": "Icon", "url": image}]
                    for field in ("displayImageUrl", "imageUrl", "iconUrl", "thumbnailUrl", "playhubImage"):
                        item[field] = image
            merged.append(item)
        return merged

    def _looks_like_trueachievements_junk_item(self, item: dict[str, Any]) -> bool:
        name = str(item.get("name") or "")
        desc = str(item.get("description") or item.get("lockedDescription") or "")
        href = str(item.get("taHref") or item.get("playhubTaHref") or item.get("id") or "")
        if self._looks_like_trueachievements_bad_title(name):
            return True
        if self._looks_like_trueachievements_bad_description(desc):
            return True
        if "#solution" in href.casefold():
            return True
        return False

    def _looks_like_trueachievements_bad_title(self, value: Any) -> bool:
        text = self._clean_trueachievements_text_line(value)
        lower = text.casefold().strip()
        if not lower:
            return True
        bad_exact = {
            "achievement", "achievements", "hide ads", "filter", "view", "achievement view",
            "image view", "list view", "sort by", "apply", "all", "none", "offline mode",
            "online mode", "single player", "difficulty specific", "stackable", "collectable",
            "cumulative", "shop", "time consuming", "buggy", "link flags", "or join", "and join",
        }
        if lower in bad_exact:
            return True
        if lower.endswith(" guide") or lower.endswith(" guides"):
            return True
        if re.fullmatch(r"\d+\s+guide[s]?", lower):
            return True
        if re.fullmatch(r"\d+\s+[a-z][a-z /+\-]+", lower) and any(token in lower for token in ("mode", "player", "specific", "stackable", "collectable", "cumulative", "shop", "buggy")):
            return True
        if any(token in lower for token in ("trueachievement desc", "flag filter", "what are achievement flags", "achievements without these flags")):
            return True
        return not (2 <= len(text) <= 120)

    def _looks_like_trueachievements_bad_description(self, value: Any) -> bool:
        text = self._clean_trueachievements_text_line(value)
        lower = text.casefold().strip()
        if not lower:
            return False
        if lower.endswith(" guide") or lower.endswith(" guides") or re.fullmatch(r"\d+\s+guide[s]?", lower):
            return True
        if "#solutions" in lower or "how to unlock" in lower:
            return True
        if re.search(r"\[[^\]]*guide[^\]]*\]\([^)]*/a\d+", lower):
            return True
        if any(token in lower for token in ("achievement view", "sort by", "flag filter", "offline mode", "single player", "difficulty specific", "stackable", "collectable", "cumulative")):
            return True
        return False

    def _parse_trueachievements_text_fallback(self, text: str, seen: set[str]) -> list[dict[str, Any]]:
        raw_lines = [self._clean_trueachievements_text_line(line) for line in str(text or "").splitlines()]
        lines = [line for line in raw_lines if line]
        if not lines:
            return []

        start_index = 0
        for idx, line in enumerate(lines):
            if line.casefold() == "apply":
                start_index = idx + 1
                break
        if start_index <= 0:
            joined = "\n".join(lines)
            marker = re.search(r"Full list of all\s+[0-9,]+\s+.*?achievements[^\n]*", joined, re.I)
            if marker:
                start_index = joined[: marker.end()].count("\n") + 1
        lines = lines[start_index:]

        stop_contains = (
            " achievements faq", "game information", "purchase options", "share achievement list",
            "latest", "popular", "© 20", "publisher", "developer", "release", "platform",
        )
        bad_exact = {
            "filter", "view", "achievement view", "image view", "list view", "sort by", "dlc",
            "packs", "dlc filter", "all", "owned", "none", "apply", "base", "add-on",
            "hide ads", "game", "news", "community", "forums", "leaderboards", "targets",
            "or join", "and join", "link flags", "group dlc packs together in list",
            "base game (excludes dlc)", "xbox", "windows", "features:", "hardware:", "notes:",
            "medium:", "size:", "purchase options", "us", "united states", "canada", "australia",
            "united kingdom", "europe", "brazil",
        }
        bad_contains = (
            "trueachievement desc", "trueachievement asc", "achievement name", "gamerscore desc",
            "gamerscore asc", "ta ratio", "gamers desc", "gamers asc", "xbox.com order",
            "date won", "flag filter", "achievements without", "what are achievement flags",
            "this dlc has been removed", "full list of all", "the base game contains",
            "view image view", "list view sort by", "offline mode", "online mode", "single player",
            "cooperative", "difficulty specific", "stackable", "collectable", "cumulative",
            "time consuming", "buggy", "main storyline", "versus", "host only", "shop",
            "time/date", "bluesky", "twitter", "reddit", "email feed",
        )

        def is_bad_line(value: str) -> bool:
            lower = value.casefold().strip(" -*•·")
            if not lower:
                return True
            if any(token in lower for token in stop_contains):
                return True
            if lower in bad_exact:
                return True
            if any(token in lower for token in bad_contains):
                return True
            if lower.endswith(" achievement") or lower.endswith(" achievements"):
                return True
            if re.fullmatch(r"[0-9,]+(?:\s*\([0-9]+%\))?", value):
                return True
            if re.fullmatch(r"[0-9]+\.[0-9]+\*?", lower):
                return True
            if re.fullmatch(r"[0-9]+(?:-[0-9]+)?h(?:ours?)?", lower):
                return True
            if re.fullmatch(r"[0-9]+\s+guide[s]?", lower) or lower.endswith(" guide") or lower.endswith(" guides"):
                return True
            if re.fullmatch(r"[0-9]+\s+[a-z][a-z /+-]+", lower):
                return True
            if re.search(r"\b(TrueAchievement|GamerScore|TA Ratio|Xbox\.com)\b", value, re.I):
                return True
            if "http://" in lower or "https://" in lower or "/a" in lower and "guide" in lower:
                return True
            return False

        def looks_like_description(value: str) -> bool:
            if is_bad_line(value):
                return False
            if not (4 <= len(value) <= 260):
                return False
            lower = value.casefold()
            if lower.startswith(("how many achievements", "is ", "when did ", "how long does", "there are ", "you can view")):
                return False
            return True

        def next_is_guide_only(index: int) -> bool:
            # If a candidate is immediately followed only by a guide marker, it is
            # probably a description line that lost its title in a reader fallback.
            for candidate in lines[index + 1 : index + 4]:
                lower = candidate.casefold()
                if any(token in lower for token in stop_contains):
                    return False
                if re.fullmatch(r"[0-9]+\s+guide[s]?", lower) or lower.endswith(" guide") or lower.endswith(" guides"):
                    return True
                if not is_bad_line(candidate):
                    return False
            return False

        parsed: list[dict[str, Any]] = []
        i = 0
        while i < len(lines) and len(parsed) < 500:
            line = lines[i]
            lower = line.casefold()
            if any(token in lower for token in stop_contains):
                break
            if is_bad_line(line) or not (2 <= len(line) <= 120) or next_is_guide_only(i):
                i += 1
                continue
            desc = ""
            desc_index = 0
            for offset, candidate in enumerate(lines[i + 1 : i + 7], start=1):
                if any(token in candidate.casefold() for token in stop_contains):
                    break
                if looks_like_description(candidate):
                    desc = candidate
                    desc_index = i + offset
                    break
            if not desc:
                i += 1
                continue
            key = self._normalise_match_title(line)
            if key and key not in seen:
                seen.add(key)
                parsed.append({
                    "id": f"ta-text:{key}",
                    "taHref": f"ta-text:{key}",
                    "playhubTaHref": f"ta-text:{key}",
                    "name": line,
                    "description": self._clean_xbox_achievement_description(desc),
                    "lockedDescription": self._clean_xbox_achievement_description(desc),
                    "gamerscore": None,
                    "isUnlocked": False,
                    "progressState": "NotStarted",
                    "mediaAssets": [],
                    "provider": "trueachievements",
                })
            i = max(i + 1, desc_index + 1)
        return parsed


    @staticmethod
    def _clean_trueachievements_text_line(value: Any) -> str:
        line = html.unescape(str(value or "")).replace("\xa0", " ")
        # Web/reader renderers can produce citation markers or markdown links.
        # Keep the visible label and discard URLs/titles so guide links do not
        # become achievement descriptions.
        line = re.sub(r"cite[^†]+†([^]+)", r"\1", line)
        line = re.sub(r"\[([^\]]+)\]\((?:https?://www\.trueachievements\.com)?/a\d+[^)]*\)", r"\1", line, flags=re.I)
        line = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", line)
        line = re.sub(r"^\s*L\d+:\s*", "", line)
        line = re.sub(r"^\s*\[[ xX]\]\s*", "", line)
        line = line.replace("**", "")
        line = re.sub(r"^[\s\-*•·]+", "", line)
        line = re.sub(r"\s+", " ", line).strip()
        return line

    def _trueachievements_description_from_block(self, block: str, name: str) -> str:
        clean = self._html_to_text(block)
        lines = [line.strip() for line in clean.splitlines() if line.strip()]
        name_norm = self._normalise_match_title(name)
        for i, line in enumerate(lines):
            line_for_match = re.sub(r"\[([^\]]+)\]\((?:https?://www\.trueachievements\.com)?/a\d+/[^)]+\)", r"\1", line, flags=re.I)
            line_norm = self._normalise_match_title(line_for_match)
            if line_norm == name_norm or (name_norm and name_norm in line_norm):
                for candidate in lines[i + 1 : i + 8]:
                    lower = candidate.casefold()
                    if "guide" in lower or "hide ads" in lower or "#solutions" in lower or "how to unlock" in lower:
                        continue
                    if self._looks_like_trueachievements_bad_description(candidate):
                        continue
                    if re.fullmatch(r"[0-9,]+\s*(?:\([0-9]+%\))?", candidate):
                        continue
                    if re.match(r"^\s*[*-]?\s*\[[^\]]+\]\((?:https?://www\.trueachievements\.com)?/a\d+/", candidate, re.I):
                        break
                    if 5 <= len(candidate) <= 220:
                        return self._clean_xbox_achievement_description(candidate)
        return ""

    def _trueachievements_gamerscore_from_block(self, block: str) -> int | None:
        patterns = [
            r"data-bf=[\"']([0-9]{1,4})\s*-",
            r"([0-9]{1,4})\s*G(?:\b|<)",
            r"([0-9]{1,4})\s*Gamerscore",
            r"Gamerscore[^0-9]{0,20}([0-9]{1,4})",
        ]
        for pattern in patterns:
            match = re.search(pattern, block, re.I)
            if match:
                return self._safe_int(match.group(1))
        return None

    def _trueachievements_image_map_from_html(self, html_text: str) -> dict[str, str]:
        """Return achievement-name -> image URL from the raw TA page.

        TA pages often expose square achievement art in img/source tags with the
        achievement name in alt/title/aria-label. The text fallback loses those
        tags, so recover them globally and attach by normalized achievement name.
        """
        out: dict[str, str] = {}

        def clean_name(value: Any) -> str:
            text = self._clean_trueachievements_text_line(self._html_to_text(str(value or "")))
            text = re.sub(r"\bachievement\b", "", text, flags=re.I)
            text = re.sub(r"\bimage\b", "", text, flags=re.I)
            text = re.sub(r"\bicon\b", "", text, flags=re.I)
            return self._clean_game_title(text.strip(" -:|"))

        def image_from_tag(tag: str) -> str:
            for attr in ("src", "data-src", "data-original", "data-lazy-src", "data-url", "srcset", "data-srcset"):
                match = re.search(attr + r"=[\"']([^\"']+)[\"']", tag, re.I | re.S)
                if match:
                    image = self._trueachievements_image_from_block(match.group(0), "")
                    if image:
                        return image
                    raw = html.unescape(match.group(1)).replace("\\/", "/").strip()
                    if "," in raw:
                        raw = raw.split(",")[0].strip().split()[0]
                    if raw.startswith("//"):
                        raw = "https:" + raw
                    elif raw.startswith("/"):
                        raw = TRUEACHIEVEMENTS_BASE_URL + raw
                    if raw.startswith("http") and not self._is_bad_trueachievements_achievement_image(raw) and ("imagestore" in raw.casefold() or re.search(r"\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$", raw, re.I)):
                        return self._xbox_square_icon_source(raw)
            return ""

        for tag_match in re.finditer(r"<img\b[^>]*>", html_text or "", re.I | re.S):
            tag = tag_match.group(0)
            image = image_from_tag(tag)
            if not image:
                continue
            names: list[str] = []
            for attr in ("alt", "title", "aria-label"):
                match = re.search(attr + r"=[\"']([^\"']+)[\"']", tag, re.I | re.S)
                if match:
                    names.append(clean_name(match.group(1)))
            # Sometimes TA renders images near an achievement anchor rather than
            # giving the img a useful alt. Look around the tag for the closest
            # /a123 achievement link and use that anchor title.
            context = (html_text or "")[max(0, tag_match.start() - 900): min(len(html_text or ""), tag_match.end() + 900)]
            for match in re.finditer(r'<a[^>]+href=["\'](?:https?://www\.trueachievements\.com)?/a\d+(?:/[^"\'#?]*)?(?:[?#][^"\']*)?["\'][^>]*>(.*?)</a>', context, re.I | re.S):
                names.append(clean_name(match.group(1)))
            for name in names:
                key = self._normalise_match_title(name)
                if key and not self._looks_like_trueachievements_bad_title(name) and key not in out:
                    out[key] = image
        return out

    def _trueachievements_image_from_block(self, block: str, name: str = "") -> str:
        candidates: list[tuple[int, str]] = []

        def add(raw: Any, context: str = "") -> None:
            src = html.unescape(str(raw or "")).replace("\\/", "/").strip().strip('"').strip("'")
            if not src:
                return
            # srcset can contain "url 1x, url 2x" or "url 128w" entries.
            if "," in src or re.search(r"\s+\d+(?:x|w)\b", src):
                for piece in src.split(","):
                    add(piece.strip().split()[0] if piece.strip() else "", context)
                return
            if src.startswith("//"):
                src = "https:" + src
            elif src.startswith("/"):
                src = TRUEACHIEVEMENTS_BASE_URL + src
            if not src.startswith("http"):
                return
            lower = (src + " " + context).casefold()
            if self._is_bad_trueachievements_achievement_image(src):
                return
            if any(token in lower for token in ("avatar", "userpic", "profile", "logo", "sprite", "badge")):
                return
            if not re.search(r"\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$", src, re.I) and "imagestore" not in lower:
                return
            score = 0
            if "achievement" in lower:
                score += 30
            if "imagestore" in lower:
                score += 25
            if re.search(r"\.(?:jpg|jpeg)(?:[?#].*)?$", src, re.I):
                score += 8
            if "64" in lower or "100" in lower or "128" in lower or "256" in lower:
                score += 3
            if name and self._normalise_match_title(name) in self._normalise_match_title(context):
                score += 5
            candidates.append((score, src))

        # Standard image/lazy-load attributes.
        for tag_match in re.finditer(r"<img\b[^>]*>", block, re.I | re.S):
            tag = tag_match.group(0)
            for attr in ("src", "data-src", "data-original", "data-lazy-src", "data-url", "srcset", "data-srcset"):
                match = re.search(attr + r"=[\"']([^\"']+)[\"']", tag, re.I | re.S)
                if match:
                    add(match.group(1), tag)

        # Picture/source tags and inline background-image URLs.
        for match in re.finditer(r"<(?:source|img)\b[^>]*(?:srcset|data-srcset)=[\"']([^\"']+)[\"'][^>]*>", block, re.I | re.S):
            add(match.group(1), match.group(0))
        for match in re.finditer(r"url\(([^)]+)\)", block, re.I | re.S):
            add(match.group(1), block[max(0, match.start() - 160): match.end() + 160])

        # Last resort: any image URL embedded in the achievement block.
        for match in re.finditer(r"https?://[^\s'\"<>]+(?:jpg|jpeg|png|webp)(?:\?[^\s'\"<>]*)?", block, re.I):
            add(match.group(0), block[max(0, match.start() - 160): match.end() + 160])

        if not candidates:
            return ""
        # Deduplicate and prefer likely achievement art.
        best: dict[str, int] = {}
        for score, src in candidates:
            best[src] = max(best.get(src, -999), score)
        return sorted(best.items(), key=lambda item: item[1], reverse=True)[0][0]

    def _html_to_text(self, value: str) -> str:
        text = re.sub(r"<script\b.*?</script>", " ", str(value or ""), flags=re.I | re.S)
        text = re.sub(r"<style\b.*?</style>", " ", text, flags=re.I | re.S)
        # Keep achievement anchors separated. TrueAchievements often renders the
        # useful page as simple anchors followed by a description, and collapsing
        # anchors into surrounding text makes the fallback parser miss everything.
        text = re.sub(r"<a\b", "\n<a", text, flags=re.I)
        text = re.sub(r"</a>", "</a>\n", text, flags=re.I)
        text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
        text = re.sub(r"</(?:p|div|li|h\d|tr|section|article)>", "\n", text, flags=re.I)
        text = re.sub(r"<[^>]+>", " ", text)
        text = html.unescape(text)
        text = re.sub(r"[ \t\r\f\v]+", " ", text)
        text = re.sub(r"\n\s+", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def _search_microsoft_store_xbox_titles(
        self, query: str, api_key: str, limit: int = 10
    ) -> list[dict[str, Any]]:
        query = self._clean_game_title(str(query or ""))
        if not query or not api_key:
            return []
        product_rows: list[dict[str, Any]] = []
        seen_products: set[str] = set()
        # Query US first (widest catalog). Only try IT if US produced nothing;
        # this keeps manual search responsive in Decky.
        for market, locale in (("US", "en-US"), ("IT", "it-IT")):
            params = {
                "appVersion": "22203.1401.0.0",
                "market": market,
                "locale": locale,
                "deviceFamily": "windows.desktop",
                "mediaType": "games",
                "query": query,
            }
            url = f"{MICROSOFT_STORE_SEARCH_URL}?{urllib.parse.urlencode(params)}"
            try:
                payload = self._http_json(url, timeout=18)
            except Exception as error:
                decky.logger.error(f"Microsoft Store search failed for {query} [{market}]: {error}")
                continue
            for row in self._extract_microsoft_store_products(payload):
                product_id = str(row.get("product_id") or "").casefold()
                if not product_id or product_id in seen_products:
                    continue
                seen_products.add(product_id)
                product_rows.append(row)
                if len(product_rows) >= max(1, min(int(limit or 10), 24)):
                    break
            if product_rows or len(product_rows) >= max(1, min(int(limit or 10), 12)):
                break
        product_rows = product_rows[: max(1, min(int(limit or 10), 12))]
        product_ids = [str(item.get("product_id") or "").strip() for item in product_rows]
        product_ids = [item for item in dict.fromkeys(product_ids) if item]
        details_by_product = self._openxbl_marketplace_details_for_products(api_key, product_ids)

        rows: list[dict[str, Any]] = []
        for product in product_rows:
            product_id = str(product.get("product_id") or "").strip()
            detail = details_by_product.get(product_id.casefold(), {})
            title_id = self._extract_xbox_title_id(detail) or self._extract_xbox_title_id(product)
            if not title_id:
                continue
            title = self._clean_game_title(
                str(
                    self._first_value(detail, "title", "titleName", "productTitle", "name")
                    or product.get("title")
                    or ""
                )
            )
            if not title:
                continue
            aliases = [
                self._normalise_match_title(title),
                self._normalise_match_title(str(product.get("title") or "")),
                self._normalise_match_title(str(product_id)),
            ]
            for value in product.get("package_family_names") or []:
                aliases.append(self._normalise_match_title(str(value)))
            for value in self._collect_text_values(detail, limit=60):
                normalised = self._normalise_match_title(value)
                if normalised and len(normalised) >= 3:
                    aliases.append(normalised)
            aliases = [item for item in dict.fromkeys(aliases) if item]
            rows.append(
                {
                    "id": str(title_id),
                    "title": title,
                    "match_title": self._normalise_match_title(title),
                    "aliases": aliases,
                    "raw_aliases": [str(product_id).casefold()],
                    "source": "Microsoft Store search",
                    "unlocked": None,
                    "total": self._safe_int(self._first_value(detail, "totalAchievements", "achievementCount", "achievementsTotal")),
                    "gamerscore": self._safe_int(self._first_value(detail, "gamerscore", "maxGamerscore", "totalGamerscore")),
                    "has_achievements": None,
                }
            )
        return rows

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
        context = ssl._create_unverified_context()
        with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
            return json.loads(response.read().decode("utf-8", errors="ignore") or "null")

    def _extract_microsoft_store_products(self, payload: Any) -> list[dict[str, Any]]:
        nodes: list[dict[str, Any]] = []
        self._walk_json(payload, nodes)
        rows: list[dict[str, Any]] = []
        seen: set[str] = set()
        for node in nodes:
            product_id = self._first_value(node, "ProductId", "productId", "BigId", "bigId", "StoreId", "storeId")
            product_id = str(product_id or "").strip()
            if not product_id or product_id.casefold() in seen:
                continue
            title = self._first_value(node, "Title", "title", "ProductTitle", "productTitle", "Name", "name")
            title = self._clean_game_title(str(title or ""))
            if not title:
                continue
            package_family_names = []
            for key in ("PackageFamilyNames", "packageFamilyNames", "packageFamilyName", "PFN", "pfn"):
                value = node.get(key)
                if isinstance(value, list):
                    package_family_names.extend(str(item) for item in value if item)
                elif value:
                    package_family_names.append(str(value))
            seen.add(product_id.casefold())
            rows.append({"product_id": product_id, "title": title, "package_family_names": package_family_names})
        return rows

    def _openxbl_marketplace_details_for_products(
        self, api_key: str, product_ids: list[str]
    ) -> dict[str, dict[str, Any]]:
        product_ids = [str(value or "").strip() for value in product_ids]
        product_ids = [value for value in dict.fromkeys(product_ids) if value]
        if not api_key or not product_ids:
            return {}
        out: dict[str, dict[str, Any]] = {}
        # OpenXBL documents marketplace/details as POST with a comma-separated
        # products field. The older implementation accidentally tried it as GET,
        # so many unplayed games never became valid title candidates.
        for start in range(0, len(product_ids), 20):
            chunk = product_ids[start : start + 20]
            # Fast path: Microsoft catalog endpoints are usually quicker than
            # OpenXBL marketplace/details and are enough for most unplayed PC
            # Game Pass / Xbox App titles.
            for node in self._microsoft_display_catalog_details(chunk):
                product_id = self._first_value(node, "ProductId", "productId", "BigId", "bigId", "StoreId", "storeId", "id")
                product_id = str(product_id or "").strip()
                if product_id:
                    out[product_id.casefold()] = node
            missing = [pid for pid in chunk if pid.casefold() not in out or not self._extract_xbox_title_id(out.get(pid.casefold(), {}))]
            if missing:
                for node in self._microsoft_store_product_details(missing):
                    product_id = self._first_value(node, "productId", "ProductId", "bigId", "BigId", "storeId", "StoreId", "id")
                    product_id = str(product_id or "").strip()
                    if product_id:
                        current = out.get(product_id.casefold(), {})
                        merged = dict(current)
                        merged.update(node)
                        out[product_id.casefold()] = merged
            missing = [pid for pid in chunk if pid.casefold() not in out or not self._extract_xbox_title_id(out.get(pid.casefold(), {}))]
            if missing:
                try:
                    payload = self._openxbl_request(
                        "/marketplace/details",
                        api_key,
                        method="POST",
                        body={"products": ",".join(missing)},
                        timeout=15,
                        cache_ttl=12 * 60 * 60,
                    )
                except Exception as error:
                    decky.logger.error(f"OpenXBL marketplace/details failed: {error}")
                    payload = None
                for node in self._marketplace_detail_nodes(payload):
                    product_id = self._first_value(node, "productId", "ProductId", "bigId", "BigId", "storeId", "StoreId", "id")
                    product_id = str(product_id or "").strip()
                    if product_id:
                        current = out.get(product_id.casefold(), {})
                        merged = dict(current)
                        merged.update(node)
                        out[product_id.casefold()] = merged
        return out

    def _marketplace_detail_nodes(self, payload: Any) -> list[dict[str, Any]]:
        nodes: list[dict[str, Any]] = []
        self._walk_json(payload, nodes)
        likely: list[dict[str, Any]] = []
        for node in nodes:
            if self._extract_xbox_title_id(node) and self._first_value(node, "title", "titleName", "productTitle", "name"):
                likely.append(node)
        return likely

    def _microsoft_store_product_details(self, product_ids: list[str]) -> list[dict[str, Any]]:
        product_ids = [str(value or "").strip() for value in product_ids if str(value or "").strip()]
        if not product_ids:
            return []
        url = f"{MICROSOFT_STORE_PRODUCTS_URL}?{urllib.parse.urlencode({'market': 'US', 'locale': 'en-US', 'deviceFamily': 'Windows.Desktop'})}"
        try:
            payload = self._http_json(url, timeout=12, method="POST", body={"productIds": ",".join(product_ids)})
        except Exception as error:
            decky.logger.error(f"Microsoft Store product details failed: {error}")
            return []
        nodes: list[dict[str, Any]] = []
        self._walk_json(payload, nodes)
        return [node for node in nodes if self._first_value(node, "productId", "ProductId", "bigId", "BigId", "storeId", "StoreId", "id")]

    def _microsoft_display_catalog_details(self, product_ids: list[str]) -> list[dict[str, Any]]:
        product_ids = [str(value or "").strip() for value in product_ids if str(value or "").strip()]
        if not product_ids:
            return []
        nodes_out: list[dict[str, Any]] = []
        for start in range(0, len(product_ids), 20):
            chunk = product_ids[start : start + 20]
            params = {
                "bigIds": ",".join(chunk),
                "market": "US",
                "languages": "en-us",
                "MS-CV": "PlayhubMetadata",
            }
            url = f"{MICROSOFT_DISPLAY_CATALOG_PRODUCTS_URL}?{urllib.parse.urlencode(params)}"
            try:
                payload = self._http_json(url, timeout=12)
            except Exception as error:
                decky.logger.error(f"Microsoft DisplayCatalog details failed: {error}")
                continue
            products = payload.get("Products") if isinstance(payload, dict) else None
            if isinstance(products, list):
                nodes_out.extend(item for item in products if isinstance(item, dict))
            else:
                nodes: list[dict[str, Any]] = []
                self._walk_json(payload, nodes)
                nodes_out.extend(nodes)
        return nodes_out

    def _extract_xbox_title_id(self, node: Any) -> str:
        if not isinstance(node, dict):
            return ""
        for key in (
            "titleId", "titleID", "TitleId", "TitleID", "xboxTitleId",
            "xboxTitleID", "XboxTitleId", "XboxTitleID", "xbox_title_id",
            "XTitleId", "title_id", "titleid",
        ):
            value = self._first_value(node, key)
            raw = re.sub(r"[^0-9]", "", str(value or ""))
            if len(raw) >= 4:
                return raw
        # Some Store payloads hide the Xbox title id in alternateId arrays,
        # properties, or nested objects. Walk recursively and accept only fields
        # whose key name strongly implies an Xbox title id.
        stack = [node]
        while stack:
            current = stack.pop()
            if isinstance(current, dict):
                for key, value in current.items():
                    key_l = str(key).casefold()
                    if isinstance(value, (dict, list)):
                        stack.append(value)
                        continue
                    if "titleid" in key_l or "xboxtitle" in key_l:
                        raw = re.sub(r"[^0-9]", "", str(value or ""))
                        if len(raw) >= 4:
                            return raw
                    if key_l in {"alternateid", "alternateids"} and isinstance(value, str):
                        raw = re.sub(r"[^0-9]", "", value)
                        if len(raw) >= 4:
                            return raw
            elif isinstance(current, list):
                stack.extend(item for item in current if isinstance(item, (dict, list)))
        # Common Microsoft catalog shape: AlternateIds: [{ IdType:
        # "XboxTitleId", Value: "..." }] or similar.
        nodes: list[dict[str, Any]] = []
        self._walk_json(node, nodes)
        for candidate in nodes:
            label = " ".join(
                str(candidate.get(key) or "")
                for key in ("IdType", "idType", "Type", "type", "Name", "name", "Key", "key")
            ).casefold()
            if "xboxtitle" in label or "titleid" in label or label.strip() == "xbox title id":
                for key in ("Value", "value", "Id", "id", "AlternateId", "alternateId"):
                    raw = re.sub(r"[^0-9]", "", str(candidate.get(key) or ""))
                    if len(raw) >= 4:
                        return raw
        return ""

    def _collect_text_values(self, value: Any, limit: int = 100) -> list[str]:
        found: list[str] = []
        def walk(item: Any) -> None:
            if len(found) >= limit:
                return
            if isinstance(item, dict):
                for child in item.values():
                    walk(child)
            elif isinstance(item, list):
                for child in item:
                    walk(child)
            elif isinstance(item, str):
                text = self._clean_game_title(item)
                if text and 2 <= len(text) <= 120:
                    found.append(text)
        walk(value)
        return found[:limit]

    def _load_xbox_title_index(
        self, api_key: str, xuid: str = "", include_catalog: bool = True
    ) -> list[dict[str, Any]]:
        api_key_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
        now_ts = now()
        try:
            if self._xbox_index_file.exists():
                cached = json.loads(self._xbox_index_file.read_text(encoding="utf-8"))
                if (
                    int(cached.get("cache_version") or 0) == 9
                    and cached.get("api_key_hash") == api_key_hash
                    and str(cached.get("xuid") or "") == str(xuid or "")
                    and now_ts - int(cached.get("updated_at") or 0) < 24 * 60 * 60
                    and isinstance(cached.get("titles"), list)
                    # An empty cached index usually means every OpenXBL endpoint
                    # failed (e.g. 429 rate limit) on the previous attempt. Treat
                    # it as a cache miss so search recovers as soon as OpenXBL
                    # responds again, instead of returning nothing for 24 hours.
                    and cached["titles"]
                ):
                    return cached["titles"]
        except Exception as error:
            decky.logger.error(f"Failed loading OpenXBL title cache: {error}")

        titles: dict[str, dict[str, Any]] = {}
        # Auto-matching should not query broad Game Pass catalogs: it wastes API
        # quota and increases false positives. Use user-scoped achievement lists
        # first. Catalog fallback is only for the manual selector/search.
        endpoints = ["/achievements", "/player/titleHistory"]
        if xuid:
            endpoints.append(f"/achievements/player/{urllib.parse.quote(str(xuid))}")
            endpoints.append(f"/player/titleHistory/{urllib.parse.quote(str(xuid))}")
        # Do not add broad Game Pass/marketplace buckets here. Manual search has
        # a targeted Microsoft Store path; this index should stay cheap and
        # account-scoped so automatic scanning does not burn OpenXBL quota.
        for endpoint in endpoints:
            try:
                payload = self._openxbl_request(endpoint, api_key, timeout=35, cache_ttl=300)
                for item in self._extract_xbox_titles(payload, source=endpoint):
                    title_id = str(item.get("id") or "").strip()
                    if not title_id:
                        continue
                    current = titles.get(title_id)
                    if not current or self._xbox_title_quality(item) > self._xbox_title_quality(current):
                        titles[title_id] = item
            except Exception as error:
                decky.logger.error(f"Failed loading OpenXBL endpoint {endpoint}: {error}")
        result = [item for item in titles.values() if item.get("match_title")]
        if not result:
            # Do not persist an empty index: it would make manual search and the
            # bulk scan return nothing until the 24h cache expires.
            decky.logger.error("OpenXBL title index came back empty; not caching it")
            return result
        try:
            self._settings_dir.mkdir(parents=True, exist_ok=True)
            self._xbox_index_file.write_text(
                json.dumps(
                    {
                        "cache_version": 9,
                        "updated_at": now_ts,
                        "api_key_hash": api_key_hash,
                        "xuid": str(xuid or ""),
                        "include_catalog": False,
                        "titles": result,
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
        except Exception as error:
            decky.logger.error(f"Failed saving OpenXBL title cache: {error}")
        return result

    @staticmethod
    def _xbox_title_quality(item: dict[str, Any]) -> float:
        score = 0.0
        source = str(item.get("source") or "").casefold()
        if item.get("title"):
            score += 1.0
        if item.get("unlocked") is not None:
            score += 0.35
        if item.get("total") is not None:
            score += 0.45
        if "achievement" in source or "titlehistory" in source or "player" in source:
            score += 0.25
        if item.get("has_achievements"):
            score += 0.5
        if "gamepass" in source:
            score -= 0.05
        return score

    def _extract_xbox_titles(self, payload: Any, source: str = "OpenXBL") -> list[dict[str, Any]]:
        nodes: list[dict[str, Any]] = []
        self._walk_json(payload, nodes)
        titles: list[dict[str, Any]] = []
        seen: set[str] = set()

        def alias_values(node: dict[str, Any]) -> tuple[list[str], list[str]]:
            text_fields = (
                "titleName", "name", "title", "localizedTitleName", "localizedTitle",
                "productTitle", "productName", "displayTitle", "displayName",
                "developerName", "publisherName", "shortTitle", "sortTitle",
            )
            raw_fields = (
                "productId", "ProductId", "storeId", "StoreId", "msStoreProductId",
                "bigId", "BigId", "packageFamilyName", "PackageFamilyName", "pfn",
                "PFN", "aumid", "AUMID", "scid", "SCID", "serviceConfigId",
                "serviceConfigurationId", "contentId", "ContentId", "titleId",
                "xboxTitleId", "xbox_title_id",
            )
            aliases: list[str] = []
            raw_aliases: list[str] = []
            for field in text_fields:
                value = self._first_value(node, field)
                if value:
                    cleaned = self._normalise_match_title(str(value))
                    if cleaned and cleaned not in aliases:
                        aliases.append(cleaned)
            for field in raw_fields:
                value = self._first_value(node, field)
                if value:
                    raw = str(value).strip()
                    raw_l = raw.casefold()
                    if raw_l and raw_l not in raw_aliases:
                        raw_aliases.append(raw_l)
                    cleaned = self._normalise_match_title(raw)
                    if cleaned and cleaned not in aliases:
                        aliases.append(cleaned)
            return aliases, raw_aliases

        for node in nodes:
            title_id = self._first_value(
                node,
                "titleId",
                "titleID",
                "TitleId",
                "TitleID",
                "xboxTitleId",
                "xboxTitleID",
                "XboxTitleId",
                "XboxTitleID",
                "xbox_title_id",
                "XTitleId",
                "title_id",
                "titleid",
            )
            # Do not blindly accept every generic "id" as a title id; Game Pass
            # catalog objects often use Store product ids there. Keep generic id as
            # a last resort only when it is numeric.
            if title_id in (None, ""):
                generic_id = node.get("id") if isinstance(node, dict) else ""
                if re.fullmatch(r"\d{4,}", str(generic_id or "")):
                    title_id = generic_id
            title_id = re.sub(r"[^0-9]", "", str(title_id or ""))
            if not title_id or len(title_id) < 4:
                continue
            title = self._first_value(
                node,
                "titleName",
                "name",
                "title",
                "TitleName",
                "localizedTitleName",
                "localizedTitle",
                "productTitle",
                "ProductTitle",
                "productName",
                "ProductName",
                "displayTitle",
                "displayName",
            )
            title = self._clean_game_title(str(title or ""))
            if not title or title_id in seen:
                continue
            seen.add(title_id)
            unlocked = self._first_value(node, "achievementsUnlocked", "currentAchievements", "unlockedAchievements", "earnedAchievements")
            total = self._first_value(node, "totalAchievements", "maxAchievements", "achievementCount", "achievementsTotal")
            gamerscore = self._first_value(node, "currentGamerscore", "gamerscore", "Gamerscore", "earnedGamerscore")
            aliases, raw_aliases = alias_values(node)
            match_title = self._normalise_match_title(title)
            if match_title and match_title not in aliases:
                aliases.insert(0, match_title)
            titles.append(
                {
                    "id": title_id,
                    "title": title,
                    "match_title": match_title,
                    "aliases": aliases,
                    "raw_aliases": raw_aliases,
                    "source": source,
                    "unlocked": self._safe_int(unlocked),
                    "total": self._safe_int(total),
                    "gamerscore": self._safe_int(gamerscore),
                    "has_achievements": self._safe_int(total) is not None and self._safe_int(total) > 0,
                }
            )
        return titles

    def _enrich_openxbl_achievement_images_from_trueachievements(
        self,
        achievements: list[dict[str, Any]],
        title: str,
        expected_total: int = 0,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        title = self._clean_game_title(title)
        if not title or not achievements:
            return achievements, {"attempted": False, "reason": "missing title or achievements"}
        achievement_keys = {
            self._normalise_match_title(
                self._clean_game_title(str(self._first_value(item, "name", "title", "displayName") or ""))
            )
            for item in achievements
            if isinstance(item, dict)
        }
        achievement_keys.discard("")
        image_map = self._trueachievements_image_map_for_title(
            title,
            expected_total,
            achievement_names=achievement_keys,
        )
        map_diagnostics = dict(getattr(self, "_last_trueachievements_image_map_diagnostics", {}) or {})
        if not image_map:
            try:
                decky.logger.info(
                    "Playhub TA image map: "
                    + json.dumps(
                        {
                            "title": title,
                            "matched": 0,
                            "total": len(achievements),
                            "ta_map": map_diagnostics,
                        },
                        ensure_ascii=False,
                    )[:1200]
                )
            except Exception:
                pass
            return achievements, {
                "attempted": True,
                "title": title,
                "matched": 0,
                "total": len(achievements),
                "reason": "no TrueAchievements imagestore map",
                "ta_map": map_diagnostics,
            }
        enriched: list[dict[str, Any]] = []
        fuzzy_items = [
            (str(key), str(value))
            for key, value in image_map.items()
            if str(key) and not str(key).startswith("__index:")
        ]
        replaced = 0
        index_replaced = 0
        examples: list[dict[str, str]] = []
        for index, raw in enumerate(achievements):
            item = dict(raw) if isinstance(raw, dict) else raw
            if not isinstance(item, dict):
                enriched.append(item)
                continue
            name = self._clean_game_title(str(self._first_value(item, "name", "title", "displayName") or ""))
            key = self._normalise_match_title(name)
            image = image_map.get(key) if key else ""
            method = "name" if image else ""
            if not image and key:
                best_key, best_score = "", 0.0
                for candidate_key, _candidate_image in fuzzy_items:
                    score = self._title_match_score(key, candidate_key)
                    if score > best_score:
                        best_key, best_score = candidate_key, score
                if best_key and best_score >= 0.94:
                    image = image_map.get(best_key, "")
                    method = "fuzzy"
            if not image:
                ordered_image = image_map.get(f"__index:{index}", "")
                if ordered_image and not self._is_bad_trueachievements_achievement_image(ordered_image):
                    image = ordered_image
                    method = "index"
            if image and not self._is_bad_trueachievements_achievement_image(image):
                item["mediaAssets"] = [{"type": "Icon", "url": image}]
                item["playhubOriginalImage"] = image
                for field in (
                    "displayImageUrl",
                    "imageUrl",
                    "iconUrl",
                    "thumbnailUrl",
                    "playhubImage",
                    "strImage",
                    "strImageURL",
                    "strImageUrl",
                    "strImageGray",
                    "strImageGrey",
                    "strImageLocked",
                    "strImageLarge",
                    "strImageAchieved",
                    "strImageUnlocked",
                    "strImageUnachieved",
                    "strImageLockedURL",
                    "strIcon",
                    "strIconGray",
                    "strIconGrey",
                    "strIconURL",
                    "strIconUrl",
                    "image",
                    "icon",
                ):
                    item[field] = image
                replaced += 1
                if method == "index":
                    index_replaced += 1
                if len(examples) < 6:
                    examples.append({"name": name, "image": image, "method": method or "name"})
            enriched.append(item)
        try:
            decky.logger.info(
                "Playhub TA image map: "
                + json.dumps(
                    {
                        "title": title,
                        "matched": replaced,
                        "index_matched": index_replaced,
                        "total": len(achievements),
                        "ta_map": map_diagnostics,
                    },
                    ensure_ascii=False,
                )[:1200]
            )
        except Exception:
            pass
        return enriched, {
            "attempted": True,
            "title": title,
            "matched": replaced,
            "index_matched": index_replaced,
            "total": len(achievements),
            "examples": examples,
            "ta_map": map_diagnostics,
        }

    def _trueachievements_image_map_for_title(
        self,
        title: str,
        expected_total: int = 0,
        achievement_names: set[str] | None = None,
    ) -> dict[str, str]:
        title = self._clean_game_title(title)
        self._last_trueachievements_image_map_diagnostics = {
            "title": title,
            "expected_total": int(expected_total or 0),
            "reason": "",
        }
        if not title:
            self._last_trueachievements_image_map_diagnostics["reason"] = "missing_title"
            return {}
        achievement_names = {str(name) for name in (achievement_names or set()) if str(name)}
        names_hash = hashlib.sha1("|".join(sorted(achievement_names)).encode("utf-8")).hexdigest()[:12] if achievement_names else "nonames"
        cache_key = "title_image_map:" + hashlib.sha1(
            f"{self._normalise_match_title(title)}:{int(expected_total or 0)}:{names_hash}".encode("utf-8")
        ).hexdigest()

        def map_stats(image_map: dict[str, str]) -> dict[str, Any]:
            named = [str(value) for key, value in image_map.items() if str(key) and not str(key).startswith("__index:")]
            indexed = [str(value) for key, value in image_map.items() if str(key).startswith("__index:")]
            return {
                "named_images": len(named),
                "indexed_images": len(indexed),
                "unique_images": len(set(named + indexed)),
            }

        icon_cache = self._load_trueachievements_icon_cache()
        cached = icon_cache.get(cache_key)
        if isinstance(cached, dict) and isinstance(cached.get("images"), dict):
            cached_images = {
                str(key): str(value)
                for key, value in cached.get("images", {}).items()
                if value and not self._is_bad_trueachievements_achievement_image(value)
            }
            if cached_images:
                stats = map_stats(cached_images)
                self._last_trueachievements_image_map_diagnostics.update({
                    "cache_hit": True,
                    "cache_key": cache_key,
                    "ta_id": cached.get("ta_id") or "",
                    "overlap_count": cached.get("overlap_count") or 0,
                    "reason": "cached_map",
                    **stats,
                })
                return cached_images

        try:
            candidates = self._search_trueachievements_titles(title, limit=3)
        except Exception as error:
            decky.logger.error(f"TrueAchievements image title search failed for {title}: {error}")
            self._last_trueachievements_image_map_diagnostics.update({
                "reason": "search_error",
                "error": str(error)[:220],
            })
            return {}

        candidate_diagnostics: list[dict[str, Any]] = []
        self._last_trueachievements_image_map_diagnostics.update({
            "cache_hit": False,
            "cache_key": cache_key,
            "achievement_name_count": len(achievement_names),
            "candidate_count": len(candidates),
            "candidates": candidate_diagnostics,
        })
        best_result: tuple[float, dict[str, str], str, int] | None = None
        for candidate in candidates:
            score = float(candidate.get("score") or 0)
            candidate_total = self._safe_int(candidate.get("total"))
            candidate_diag: dict[str, Any] = {
                "id": str(candidate.get("id") or ""),
                "title": str(candidate.get("title") or ""),
                "score": round(score, 4),
                "total": candidate_total,
            }
            candidate_diagnostics.append(candidate_diag)
            if score < 0.68:
                candidate_diag["outcome"] = "low_title_score"
                continue
            ta_id = self._normalise_xbox_or_ta_match_id(candidate.get("id") or "")
            if not ta_id.startswith("ta:"):
                candidate_diag["outcome"] = "not_trueachievements"
                continue
            try:
                ta_payload = self._fetch_trueachievements_achievements(ta_id)
                image_map = self._trueachievements_image_map_from_steam_payload(ta_payload)
            except Exception as error:
                decky.logger.error(f"TrueAchievements image map failed for {ta_id}: {error}")
                candidate_diag["outcome"] = "fetch_error"
                candidate_diag["error"] = str(error)[:220]
                continue
            if not image_map:
                candidate_diag["outcome"] = "no_images"
                continue
            image_keys = {str(key) for key in image_map.keys() if str(key) and not str(key).startswith("__index:")}
            stats = map_stats(image_map)
            candidate_diag.update(stats)
            overlap_count = len(achievement_names.intersection(image_keys)) if achievement_names else 0
            overlap_ratio = overlap_count / max(1, min(len(achievement_names), len(image_keys))) if achievement_names else 0.0
            total_matches = bool(
                expected_total
                and candidate_total
                and abs(candidate_total - int(expected_total)) <= max(3, int(expected_total * 0.12))
            )
            confident = (
                (achievement_names and (overlap_count >= 3 or overlap_ratio >= 0.18))
                or (score >= 0.90 and (total_matches or not expected_total))
                    or (score >= 0.82 and total_matches)
            )
            enough_images = (
                not expected_total
                or len(image_keys) >= max(3, int(expected_total * 0.65))
                or overlap_count >= 3
            )
            candidate_diag.update({
                "overlap_count": overlap_count,
                "overlap_ratio": round(overlap_ratio, 4),
                "total_matches": total_matches,
                "enough_images": enough_images,
                "confident": confident,
            })
            if not enough_images:
                candidate_diag["outcome"] = "too_few_images"
                continue
            if not confident:
                candidate_diag["outcome"] = "low_confidence"
                continue
            confidence = score + min(0.4, overlap_ratio) + (0.15 if total_matches else 0.0) + min(0.15, overlap_count / 100)
            candidate_diag["outcome"] = "usable"
            candidate_diag["confidence"] = round(confidence, 4)
            if not best_result or confidence > best_result[0]:
                best_result = (confidence, image_map, ta_id, overlap_count)

        if best_result:
            _confidence, image_map, ta_id, overlap_count = best_result
            stats = map_stats(image_map)
            icon_cache[cache_key] = {
                "updated_at": now(),
                "title": title,
                "ta_id": ta_id,
                "overlap_count": overlap_count,
                "images": image_map,
            }
            self._save_trueachievements_icon_cache(icon_cache)
            self._last_trueachievements_image_map_diagnostics.update({
                "reason": "selected_map",
                "ta_id": ta_id,
                "overlap_count": overlap_count,
                "confidence": round(_confidence, 4),
                **stats,
            })
            return image_map
        self._last_trueachievements_image_map_diagnostics["reason"] = "no_confident_map"
        return {}

    def _trueachievements_image_map_from_steam_payload(self, payload: Any) -> dict[str, str]:
        if not isinstance(payload, dict):
            return {}
        data = ((payload.get("user") or {}).get("data") or {}) if isinstance(payload.get("user"), dict) else {}
        out: dict[str, str] = {}
        ordered_index = 0
        for bucket in ("achieved", "hidden", "unachieved"):
            values = data.get(bucket) if isinstance(data, dict) else None
            iterable = values.values() if isinstance(values, dict) else (values if isinstance(values, list) else [])
            for item in iterable:
                if not isinstance(item, dict):
                    continue
                current_index = ordered_index
                ordered_index += 1
                name = self._clean_game_title(str(item.get("strName") or item.get("name") or ""))
                key = self._normalise_match_title(name)
                if not key:
                    continue
                image = ""
                for field in ("playhubImage", "strImageURL", "strImageUrl", "strImage", "strIconURL", "strIcon", "imageUrl", "iconUrl"):
                    candidate = str(item.get(field) or "")
                    if candidate and not self._is_bad_trueachievements_achievement_image(candidate):
                        image = candidate
                        break
                if image and "imagestore" in image.casefold():
                    out[key] = image
                    out[f"__index:{current_index}"] = image
        return out

    def _xbox_payload_to_steam(self, payload: Any, title_id: str, title_hint: str = "") -> dict[str, Any] | None:
        if isinstance(payload, dict) and payload.get("provider") == "trueachievements":
            achievements = payload.get("achievements") or []
        else:
            achievements = self._find_xbox_achievement_nodes(payload)
        if not achievements:
            return None
        achieved: dict[str, Any] = {}
        unachieved: dict[str, Any] = {}
        hidden: dict[str, Any] = {}
        global_data: dict[str, float] = {}
        title = self._clean_game_title(str(payload.get("title") or "")) if isinstance(payload, dict) else ""
        if not title:
            title = self._clean_game_title(str(title_hint or ""))
        if not title:
            for raw in achievements:
                if isinstance(raw, dict):
                    title = self._xbox_title_from_achievement(raw)
                    if title:
                        break
        achievement_source = "trueachievements" if str(title_id).startswith("ta:") else "openxbl"
        image_diagnostics: dict[str, Any] = {}
        if achievement_source == "openxbl":
            achievements, image_diagnostics = self._enrich_openxbl_achievement_images_from_trueachievements(
                achievements,
                title,
                expected_total=len(achievements),
            )
        # Warm the steamloopback PNG cache in parallel before the per-achievement
        # conversion below, so _xbox_achievement_playhub_image hits files on disk
        # instead of downloading one card at a time.
        self._prefetch_xbox_loopback_icons([
            self._xbox_square_icon_source(self._xbox_achievement_image(raw))
            for raw in achievements
            if isinstance(raw, dict)
        ])
        image_diagnostics = {
            **image_diagnostics,
            "pillow": Image is not None,
            "cropper": self._xbox_cropper_name(),
            "proxyPort": self._image_proxy_port,
            "loopbackDir": str(self._steamui_loopback_icon_dir() or ""),
        }
        for raw in achievements:
            if not isinstance(raw, dict):
                continue
            steam = self._xbox_achievement_to_steam(raw)
            if not steam["strID"]:
                continue
            if not title:
                title = self._xbox_title_from_achievement(raw)
            if steam["bAchieved"]:
                achieved[steam["strID"]] = steam
            elif steam["bHidden"]:
                hidden[steam["strID"]] = steam
            else:
                unachieved[steam["strID"]] = steam
            global_data[steam["strID"]] = steam["flAchieved"]
        total = len(achieved) + len(unachieved) + len(hidden)
        if total <= 0:
            return None
        return {
            "game_id": int(hashlib.sha1(str(title_id).encode("utf-8")).hexdigest()[:8], 16) if str(title_id).startswith("ta:") else int(re.sub(r"[^0-9]", "", str(title_id)) or 0),
            "provider": "xbox",
            "playhubAchievementSource": achievement_source,
            "playhubAchievementCacheVersion": PLAYHUB_ACHIEVEMENT_CACHE_VERSION,
            "playhubImageDiagnostics": image_diagnostics,
            "title": title,
            "steam": {
                "nAchieved": len(achieved),
                "nTotal": total,
                "vecAchievedHidden": list(hidden.values())[:12],
                "vecHighlight": list(achieved.values())[:3],
                "vecUnachieved": list(unachieved.values())[:12],
            },
            "user": {
                "loading": False,
                "data": {
                    "achieved": achieved,
                    "hidden": hidden,
                    "unachieved": unachieved,
                },
            },
            "global": {"loading": False, "data": global_data},
            "progress": {
                "achieved": len(achieved),
                "total": total,
                "percentage": (len(achieved) / total) * 100 if total else 0,
            },
        }

    def _find_xbox_achievement_nodes(self, payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, dict):
            for key in ("achievements", "Achievements", "items", "results"):
                value = payload.get(key)
                if isinstance(value, list) and any(isinstance(item, dict) for item in value):
                    likely = [item for item in value if isinstance(item, dict) and self._looks_like_xbox_achievement(item)]
                    if likely:
                        return likely
            # Some OpenXBL responses nest the Xbox service response one level deeper.
            nested: list[dict[str, Any]] = []
            for value in payload.values():
                nested.extend(self._find_xbox_achievement_nodes(value))
            if nested:
                return nested
        if isinstance(payload, list):
            likely = [item for item in payload if isinstance(item, dict) and self._looks_like_xbox_achievement(item)]
            if likely:
                return likely
            nested: list[dict[str, Any]] = []
            for value in payload:
                nested.extend(self._find_xbox_achievement_nodes(value))
            return nested
        return []

    @staticmethod
    def _looks_like_xbox_achievement(node: dict[str, Any]) -> bool:
        keys = {str(key).casefold() for key in node.keys()}
        if "progressstate" in keys or "isunlocked" in keys or "isunlocked" in keys:
            return True
        return bool({"lockeddescription", "mediaassets", "rewards", "achievementtype"}.intersection(keys))

    def _xbox_achievement_to_steam(self, achievement: dict[str, Any]) -> dict[str, Any]:
        title = self._clean_game_title(str(self._first_value(achievement, "name", "title", "displayName") or ""))
        achievement_id = str(self._first_value(achievement, "id", "achievementId", "serviceConfigId") or title)
        progression = achievement.get("progression") if isinstance(achievement.get("progression"), dict) else {}
        progress_state = str(
            self._first_value(achievement, "progressState", "state")
            or self._first_value(progression, "progressState", "state")
            or ""
        ).casefold()
        raw_date_unlocked = self._first_value(progression, "timeUnlocked", "TimeUnlocked") or self._first_value(achievement, "timeUnlocked", "dateUnlocked", "unlockedTime")
        date_unlocked = raw_date_unlocked if self._is_valid_xbox_unlock_time(raw_date_unlocked) else ""
        explicit_unlocked = self._as_bool(self._first_value(achievement, "isUnlocked", "unlocked", "earned", "isEarned"))
        locked_states = {"notstarted", "not started", "locked", "notearned", "not earned", "inprogress", "in progress"}
        achieved_states = {"achieved", "unlocked", "earned", "complete", "completed"}
        achieved = progress_state in achieved_states or explicit_unlocked or bool(date_unlocked)
        if progress_state in locked_states and not explicit_unlocked and not date_unlocked:
            achieved = False
        description = self._clean_xbox_achievement_description(self._first_value(achievement, "description", "Description") or "")
        locked_description = self._clean_xbox_achievement_description(self._first_value(achievement, "lockedDescription", "LockedDescription") or "")
        if not achieved and locked_description:
            description = locked_description
        image = self._xbox_achievement_image(achievement)
        playhub_image = self._xbox_achievement_playhub_image(image)
        display_image = playhub_image or image
        hidden_flag = bool(self._first_value(achievement, "isSecret", "secret", "isHidden")) and not achieved
        percent = self._xbox_achievement_percent(achievement, achieved)
        clean_id = re.sub(r"[^A-Z0-9_]+", "", (achievement_id or title).upper().replace(" ", "_"))
        return {
            "bAchieved": achieved,
            "bHidden": hidden_flag,
            "flAchieved": percent,
            "flCurrentProgress": 1 if achieved else 0,
            "flMaxProgress": 1,
            "flMinProgress": 0,
            "rtUnlocked": self._date_to_epoch(date_unlocked) if achieved else 0,
            "strDescription": description,
            "strID": clean_id,
            "taHref": achievement.get("taHref") or achievement.get("playhubTaHref") or achievement_id,
            "playhubTaHref": achievement.get("playhubTaHref") or achievement.get("taHref") or achievement_id,
            "strImage": display_image,
            "strImageURL": display_image,
            "strImageUrl": display_image,
            "strImageGray": display_image,
            "strImageGrey": display_image,
            "strImageLocked": display_image,
            "strImageLarge": display_image,
            "strImageAchieved": display_image,
            "strImageUnlocked": display_image,
            "strImageUnachieved": display_image,
            "strImageLockedURL": display_image,
            "strIcon": display_image,
            "strIconGray": display_image,
            "strIconGrey": display_image,
            "strIconURL": display_image,
            "strIconUrl": display_image,
            "image": display_image,
            "imageUrl": display_image,
            "icon": display_image,
            "iconUrl": display_image,
            "playhubImage": display_image,
            "playhubOriginalImage": image,
            "strName": title or ("Secret achievement" if hidden_flag else ""),
        }

    @staticmethod
    def _clean_xbox_achievement_description(value: Any) -> str:
        text = str(value or "").strip()
        text = re.sub(r"^\s*\d{1,5}\s*G?\s*[-\u2013\u2014]\s*", "", text, flags=re.I)
        return text.strip()

    def _xbox_title_from_achievement(self, achievement: dict[str, Any]) -> str:
        associations = achievement.get("titleAssociations") or achievement.get("titles") or []
        if isinstance(associations, list):
            for association in associations:
                if isinstance(association, dict):
                    title = self._first_value(association, "name", "titleName", "title")
                    if title:
                        return self._clean_game_title(str(title))
        return ""

    def _xbox_gamerscore(self, achievement: dict[str, Any]) -> int | None:
        rewards = achievement.get("rewards") or achievement.get("Rewards") or []
        if isinstance(rewards, list):
            for reward in rewards:
                if not isinstance(reward, dict):
                    continue
                kind = str(reward.get("type") or reward.get("name") or "").casefold()
                if "gamerscore" in kind or kind == "score":
                    value = self._safe_int(reward.get("value") or reward.get("Value"))
                    if value is not None:
                        return value
        return self._safe_int(self._first_value(achievement, "gamerscore", "Gamerscore", "score"))

    def _xbox_achievement_image(self, achievement: dict[str, Any]) -> str:
        candidates: list[tuple[int, str]] = []

        def normalise_url(value: Any) -> str:
            raw = html.unescape(str(value or "").strip().strip('"').strip("'"))
            if not raw:
                return ""
            raw = raw.replace("\\/", "/")
            if raw.startswith("//"):
                raw = "https:" + raw
            if raw.startswith("http://"):
                raw = "https://" + raw[len("http://"):]
            if raw.startswith("images-eds-ssl.xboxlive.com") or raw.startswith("dlassets.xboxlive.com"):
                raw = "https://" + raw
            if not raw.startswith("https://"):
                return ""
            return raw

        def add_url(value: Any, priority: int = 0) -> None:
            raw = normalise_url(value)
            if raw:
                candidates.append((priority, raw))

        def add_urls_from_text(value: str, priority: int = 0) -> None:
            for match in re.findall(r"https?:\\?/\\?/[^\"'<>\s)]+", str(value or "")):
                url = match.replace("\\/", "/")
                lowered = url.casefold()
                if any(token in lowered for token in ("xbox", "microsoft", "akamai", "assets", "trueachievements", "imagestore")):
                    add_url(url, priority)

        def walk(value: Any, inherited_priority: int = 0) -> None:
            if isinstance(value, dict):
                label = " ".join(
                    str(value.get(key) or "")
                    for key in (
                        "type",
                        "Type",
                        "name",
                        "Name",
                        "mediaAssetType",
                        "MediaAssetType",
                        "purpose",
                        "fileType",
                    )
                ).casefold()
                priority = inherited_priority
                if "icon" in label:
                    priority += 140
                if "achievement" in label:
                    priority += 45
                if "tile" in label or "card" in label:
                    priority -= 20
                if "locked" in label:
                    priority += 10
                if "poster" in label or "boxart" in label or "hero" in label or "background" in label:
                    priority -= 45
                known_url_keys = (
                    "url",
                    "Url",
                    "uri",
                    "URI",
                    "imageUrl",
                    "ImageUrl",
                    "displayImageUrl",
                    "DisplayImageUrl",
                    "iconUrl",
                    "IconUrl",
                    "thumbnailUrl",
                    "ThumbnailUrl",
                    "smallImageUrl",
                    "SmallImageUrl",
                    "largeImageUrl",
                    "LargeImageUrl",
                    "tileUrl",
                    "TileUrl",
                    "artUrl",
                    "ArtUrl",
                    "value",
                    "Value",
                )
                for key in known_url_keys:
                    if key in value:
                        add_url(value.get(key), priority)
                        if isinstance(value.get(key), str):
                            add_urls_from_text(value.get(key), priority)
                for key, child_value in value.items():
                    key_text = str(key).casefold()
                    if isinstance(child_value, str):
                        if "url" in key_text or "image" in key_text or "icon" in key_text or "thumbnail" in key_text or "asset" in key_text:
                            add_url(child_value, priority + 30)
                        add_urls_from_text(child_value, priority)
                    elif isinstance(child_value, (dict, list)):
                        walk(child_value, priority)
            elif isinstance(value, list):
                for child in value:
                    walk(child, inherited_priority)
            elif isinstance(value, str):
                add_urls_from_text(value, inherited_priority)

        for key in (
            "displayImageUrl",
            "imageUrl",
            "iconUrl",
            "thumbnailUrl",
            "tileUrl",
            "artUrl",
            "displayImage",
            "image",
            "icon",
        ):
            add_url(achievement.get(key), 80)
        walk(achievement.get("mediaAssets") or achievement.get("media") or achievement.get("MediaAssets") or [], 30)
        walk(achievement, 0)

        if not candidates:
            return ""
        # Highest priority wins; keep original order for ties. Return the original
        # remote URL; previous query rewriting broke some Xbox image CDN URLs and
        # caused blank achievement cards in Steam.
        best = sorted(enumerate(candidates), key=lambda item: (-item[1][0], item[0]))[0][1][1]
        return self._xbox_square_icon_source(best)

    def _zoom_xbox_achievement_icon(self, url: str) -> str:
        # Kept for backwards compatibility with older cached payloads.
        return self._xbox_square_icon_source(url)

    def _xbox_square_icon_source(self, url: str) -> str:
        # Return the cleanest ORIGINAL remote image we can get. The Xbox CDN
        # often wraps the real image in images-eds-ssl.xboxlive.com/image?url=...
        # and resize parameters can produce a source image that is already
        # squashed. For a no-stretch UI we want the original aspect ratio, then
        # the frontend crops it visually with CSS.
        if not url:
            return ""
        raw = html.unescape(str(url or "").strip().strip('"').strip("'"))
        raw = raw.replace("\\/", "/")
        if raw.startswith("data:image/"):
            return raw
        if raw.startswith("//"):
            raw = "https:" + raw
        if raw.startswith("http://"):
            raw = "https://" + raw[len("http://"):]
        if raw.startswith("images-eds-ssl.xboxlive.com") or raw.startswith("dlassets.xboxlive.com") or raw.startswith("store-images.s-microsoft.com"):
            raw = "https://" + raw
        if not raw.startswith("https://"):
            return ""
        if "trueachievements.com/imagestore/mob/" in raw.casefold():
            raw = re.sub(r"/imagestore/mob/", "/imagestore/", raw, flags=re.I)
        try:
            parsed = urllib.parse.urlparse(raw)
            query_pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
            query = dict(query_pairs)

            # Prefer the inner, original image URL when the Xbox image proxy wraps
            # one. This avoids receiving a pre-resized/pre-stretched square.
            inner = query.get("url") or query.get("Url") or query.get("URL")
            if inner:
                inner = html.unescape(urllib.parse.unquote(str(inner))).replace("\\/", "/")
                if inner.startswith("//"):
                    inner = "https:" + inner
                if inner.startswith("http://"):
                    inner = "https://" + inner[len("http://"):]
                if inner.startswith("https://"):
                    raw = inner
                    parsed = urllib.parse.urlparse(raw)
                    query_pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)

            drop = {
                "w", "h", "width", "height", "maxwidth", "maxheight",
                "mode", "crop", "anchor", "resize", "thumbnail", "quality",
            }
            # Keep format=source because several Microsoft image URLs use it to
            # return the original asset. Drop other forced output formats.
            kept = []
            for key, value in query_pairs:
                lowered = key.casefold()
                if lowered in drop:
                    continue
                if lowered == "format" and str(value).casefold() not in {"source", "png", "jpg", "jpeg", "webp"}:
                    continue
                kept.append((key, value))
            raw = urllib.parse.urlunparse(parsed._replace(query=urllib.parse.urlencode(kept)))
        except Exception:
            pass
        return raw

    def _xbox_achievement_playhub_image(self, url: str) -> str:
        clean = self._xbox_square_icon_source(url)
        if not clean:
            return ""
        if "trueachievements.com/imagestore/" in clean.casefold():
            return clean
        # Priority for Xbox cards: steamloopback PNG on disk (stable HTTPS URL
        # Steam can always load), then the 127.0.0.1 proxy, then the original
        # card as a last resort. The Xbox image CDN rejects w/h crop parameters
        # on achievement-card URLs, so do not synthesize those broken URLs.
        loopback = self._xbox_loopback_icon_url(clean)
        if loopback:
            return loopback
        proxied = self._xbox_proxy_icon_url(clean)
        if proxied:
            return proxied
        return clean

    def _download_and_crop_xbox_icon(self, url: str, output_path: Path) -> None:
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
        )
        context = ssl._create_unverified_context()
        with urllib.request.urlopen(request, timeout=25, context=context) as response:
            raw = response.read()
        if Image is None:
            if self._crop_xbox_icon_with_windows(raw, output_path):
                return
            raise RuntimeError("no Xbox image cropper available")
        image = Image.open(io.BytesIO(raw)).convert("RGBA")
        width, height = image.size
        if width <= 0 or height <= 0:
            raise RuntimeError("invalid Xbox icon size")
        # First make a centered square crop; then zoom 40% into the square, which
        # matches Xbox's own achievement-card layout where the badge is centered.
        side = min(width, height)
        left = max(0, (width - side) // 2)
        top = max(0, (height - side) // 2)
        image = image.crop((left, top, left + side, top + side))
        zoom = 1.4
        inner = max(1, int(side / zoom))
        inset = max(0, (side - inner) // 2)
        image = image.crop((inset, inset, inset + inner, inset + inner))
        image = image.resize((256, 256), Image.LANCZOS)
        buffer = io.BytesIO()
        image.save(buffer, format="PNG", optimize=True)
        output_path.write_bytes(buffer.getvalue())

    def _crop_xbox_icon_with_windows(self, raw: bytes, output_path: Path) -> bool:
        powershell = self._windows_powershell_executable()
        if not powershell:
            return False
        work_dir = self._settings_dir / "xbox_card_work"
        try:
            work_dir.mkdir(parents=True, exist_ok=True)
        except Exception as error:
            decky.logger.error(f"Playhub Windows crop work dir unavailable: {error}")
            return False

        script_path = work_dir / "crop-xbox-icon.ps1"
        script = r'''
param(
    [Parameter(Mandatory=$true)][string]$InputPath,
    [Parameter(Mandatory=$true)][string]$OutputPath
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile($InputPath)
$bmp = $null
$graphics = $null
try {
    if ($src.Width -le 0 -or $src.Height -le 0) {
        throw "Invalid source image size"
    }
    $side = [Math]::Min($src.Width, $src.Height)
    $left = [Math]::Max(0, [int](($src.Width - $side) / 2))
    $top = [Math]::Max(0, [int](($src.Height - $side) / 2))
    $zoom = 1.4
    $inner = [Math]::Max(1, [int]($side / $zoom))
    $inset = [Math]::Max(0, [int](($side - $inner) / 2))
    $crop = New-Object System.Drawing.Rectangle -ArgumentList ($left + $inset), ($top + $inset), $inner, $inner
    $dest = New-Object System.Drawing.Rectangle -ArgumentList 0, 0, 256, 256
    $bmp = New-Object System.Drawing.Bitmap -ArgumentList 256, 256, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.DrawImage($src, $dest, $crop, [System.Drawing.GraphicsUnit]::Pixel)
    $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    if ($graphics -ne $null) { $graphics.Dispose() }
    if ($bmp -ne $null) { $bmp.Dispose() }
    if ($src -ne $null) { $src.Dispose() }
}
'''.strip()
        try:
            if not script_path.exists() or script_path.read_text(encoding="utf-8") != script:
                script_path.write_text(script, encoding="utf-8")
            source_path = work_dir / (hashlib.sha1(raw).hexdigest() + ".img")
            temp_output = output_path.with_name(
                f"{output_path.name}.{threading.get_ident()}.tmp"
            )
            source_path.write_bytes(raw)
            if temp_output.exists():
                temp_output.unlink()
            completed = subprocess.run(
                [
                    powershell,
                    "-NoProfile",
                    "-WindowStyle",
                    "Hidden",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(script_path),
                    "-InputPath",
                    str(source_path),
                    "-OutputPath",
                    str(temp_output),
                ],
                capture_output=True,
                text=True,
                timeout=45,
                **self._hidden_subprocess_kwargs(),
            )
            if completed.returncode != 0:
                detail = (completed.stderr or completed.stdout or "").strip()
                decky.logger.error(f"Playhub Windows image crop failed: {detail}")
                return False
            if not temp_output.exists() or temp_output.stat().st_size <= 0:
                decky.logger.error("Playhub Windows image crop produced no output")
                return False
            output_path.parent.mkdir(parents=True, exist_ok=True)
            os.replace(temp_output, output_path)
            try:
                source_path.unlink(missing_ok=True)
            except Exception:
                pass
            return True
        except Exception as error:
            decky.logger.error(f"Playhub Windows image crop failed: {error}")
            return False
        finally:
            try:
                temp_output = locals().get("temp_output")
                if isinstance(temp_output, Path) and temp_output.exists():
                    temp_output.unlink()
            except Exception:
                pass
            try:
                source_path = locals().get("source_path")
                if isinstance(source_path, Path) and source_path.exists():
                    source_path.unlink()
            except Exception:
                pass

    def _xbox_achievement_percent(self, achievement: dict[str, Any], achieved: bool) -> float:
        if achieved:
            return 100.0
        progression = achievement.get("progression") if isinstance(achievement.get("progression"), dict) else {}
        requirements = progression.get("requirements") if isinstance(progression, dict) else []
        if isinstance(requirements, list):
            values = []
            for requirement in requirements:
                if not isinstance(requirement, dict):
                    continue
                current = self._as_number(requirement.get("current") or requirement.get("Current"), 0)
                target = self._as_number(requirement.get("target") or requirement.get("Target"), 0)
                if target > 0:
                    values.append(max(0.0, min(100.0, (current / target) * 100)))
            if values:
                return sum(values) / len(values)
        return 0.0

    @staticmethod
    def _first_value(node: dict[str, Any], *names: str) -> Any:
        if not isinstance(node, dict):
            return None
        lowered = {str(key).casefold(): value for key, value in node.items()}
        for name in names:
            value = lowered.get(str(name).casefold())
            if value not in (None, ""):
                return value
        return None

    @staticmethod
    def _as_bool(value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if value in (None, ""):
            return False
        if isinstance(value, (int, float)):
            return value != 0
        text = str(value).strip().casefold()
        if text in {"true", "1", "yes", "y", "achieved", "unlocked", "earned", "complete", "completed"}:
            return True
        if text in {"false", "0", "no", "n", "none", "null", "locked", "notstarted", "not started", "notearned", "not earned", "inprogress", "in progress"}:
            return False
        return False

    @staticmethod
    def _is_valid_xbox_unlock_time(value: Any) -> bool:
        if value in (None, ""):
            return False
        text = str(value).strip().casefold()
        if text in {"none", "null", "false", "0"}:
            return False
        # Xbox services sometimes use sentinel dates for locked achievements.
        invalid_prefixes = ("0001-01-01", "1601-01-01", "1900-01-01", "1970-01-01")
        return not text.startswith(invalid_prefixes)

    @staticmethod
    def _safe_int(value: Any) -> int | None:
        if value in (None, ""):
            return None
        try:
            return int(float(str(value).replace(",", "")))
        except Exception:
            return None

    def _walk_json(self, value: Any, output: list[dict[str, Any]]) -> None:
        if isinstance(value, dict):
            output.append(value)
            for child in value.values():
                self._walk_json(child, output)
        elif isinstance(value, list):
            for child in value:
                self._walk_json(child, output)

    def _shortcut_for_app(self, app_id: int) -> dict[str, Any] | None:
        target = int(app_id) & 0xFFFFFFFF
        for shortcut in self._read_steam_shortcuts():
            shortcut_id = int(shortcut.get("appid") or 0) & 0xFFFFFFFF
            if shortcut_id == target:
                return shortcut
        return None

    def _is_probable_xbox_shortcut(self, app_id: int, extra_text: str = "") -> bool:
        shortcut = self._shortcut_for_app(app_id)
        fields = []
        if shortcut:
            fields.extend(str(shortcut.get(key) or "") for key in ("exe", "launch_options", "start_dir", "shortcut_path", "name"))
        fields.append(str(extra_text or ""))
        haystack = " ".join(fields).casefold().replace("\\", "/")
        needles = (
            "uwphook",
            "shell:appsfolder",
            "microsoft.",
            "_8wekyb3d8bbwe",
            "xboxapp",
            "gamepass",
            "gamingservices",
            "bethesdasoftworks.",
        )
        return any(needle in haystack for needle in needles)


    def _is_uwphook_shortcut(self, app_id: int, extra_text: str = "") -> bool:
        shortcut = self._shortcut_for_app(app_id)
        fields: list[str] = []
        if shortcut:
            fields.extend(str(shortcut.get(key) or "") for key in ("exe", "start_dir", "launch_options", "shortcut_path", "name"))
        fields.append(str(extra_text or ""))
        haystack = " ".join(fields).casefold().replace("\\", "/").strip('"')
        return "uwphook.exe" in haystack or "/uwphook/uwphook.exe" in haystack or "briano/uwphook" in haystack

    def _xbox_title_candidates(self, app_id: int, title: str = "", path: str = "") -> list[str]:
        shortcut = self._shortcut_for_app(app_id)
        values: list[str] = [title]
        metadata = self._data.get("metadata", {}).get(str(app_id)) or {}
        values.append(str(metadata.get("title") or ""))
        if shortcut:
            values.append(str(shortcut.get("name") or ""))
            values.extend(str(shortcut.get(key) or "") for key in ("exe", "launch_options", "start_dir", "shortcut_path"))
        values.append(path)
        text = " ".join(value for value in values if value)
        values.extend(self._uwphook_candidates_from_text(text))
        cleaned: list[str] = []
        for value in values:
            for candidate in self._split_xbox_title_candidate(value):
                clean = self._clean_game_title(candidate)
                if clean and clean not in cleaned:
                    cleaned.append(clean)
        return cleaned

    def _uwphook_candidates_from_text(self, text: str) -> list[str]:
        candidates: list[str] = []
        for match in re.findall(r"([A-Za-z0-9_.-]+_[A-Za-z0-9]+![A-Za-z0-9_.-]+)", text):
            candidates.append(match)
            candidates.extend(match.split("!"))
        for match in re.findall(r"shell:AppsFolder\\([^\"\s]+)", text, flags=re.IGNORECASE):
            candidates.append(match)
        for match in re.findall(r"(?:-app|-a|-appid|-aumid)\s+([A-Za-z0-9_.!_-]+)", text, flags=re.IGNORECASE):
            candidates.append(match)
        return candidates

    def _split_xbox_title_candidate(self, value: str) -> list[str]:
        raw = html.unescape(str(value or "")).strip().strip('"')
        if not raw:
            return []
        pieces = [raw]
        pieces.extend(re.split(r"[!_/\\|]", raw))
        output: list[str] = []
        for piece in pieces:
            piece = Path(piece).name if any(sep in piece for sep in ("/", "\\")) else piece
            piece = re.sub(r"\.(exe|lnk|url)$", "", piece, flags=re.IGNORECASE)
            piece = re.sub(r"_[a-z0-9]{8,}$", "", piece, flags=re.IGNORECASE)
            piece = re.sub(r"\b(uwphook|windows|shipping|client|launcher|game|pc)\b", " ", piece, flags=re.IGNORECASE)
            piece = re.sub(r"^(Microsoft|Xbox|BethesdaSoftworks|Zenimax|MicrosoftStudios|MicrosoftCorporation|SEGAEurope|ElectronicArts)\.", "", piece, flags=re.IGNORECASE)
            piece = re.sub(r"([a-z])([A-Z])", r"\1 \2", piece)
            piece = re.sub(r"[._-]+", " ", piece)
            piece = re.sub(r"\s+", " ", piece).strip()
            if len(piece) >= 3:
                output.append(piece)
        return output

    def _test_retroachievements_credentials_sync(
        self, username: str = "", api_key: str = ""
    ) -> dict[str, Any]:
        self._load_data()
        ra = self._data["settings"].get("retroachievements") or {}
        username = str(username or ra.get("username") or "").strip()
        api_key = str(api_key or ra.get("api_key") or "").strip()
        if not username or not api_key:
            return {
                "ok": False,
                "message": "Missing RetroAchievements username or API key.",
            }
        params = urllib.parse.urlencode({"u": username, "y": api_key})
        request = urllib.request.Request(
            f"{RETROACHIEVEMENTS_PROFILE_URL}?{params}",
            headers={"User-Agent": "PlayhubMetadata/0.1 (+Decky Loader)"},
        )
        context = ssl._create_unverified_context()
        try:
            with urllib.request.urlopen(request, timeout=20, context=context) as response:
                payload = json.loads(response.read().decode("utf-8", errors="ignore"))
        except urllib.error.HTTPError as error:
            return {
                "ok": False,
                "message": f"RetroAchievements login failed: HTTP {error.code}.",
            }
        except Exception as error:
            return {"ok": False, "message": f"RetroAchievements login failed: {error}"}

        if isinstance(payload, dict) and (
            payload.get("User")
            or payload.get("UserPic")
            or payload.get("TotalPoints") is not None
        ):
            return {
                "ok": True,
                "message": f"RetroAchievements login OK: {payload.get('User') or username}.",
            }
        return {
            "ok": False,
            "message": "RetroAchievements login failed: invalid response.",
        }

    def _resolve_retroachievements_from_path_sync(
        self, app_id: int, path: str, title: str = ""
    ) -> dict[str, Any] | None:
        self._load_data()
        resolved = self._extract_rom_path(path)
        game_id = None

        if resolved:
            if not self._hash_library:
                self._load_hash_library()
            if self._hash_library:
                digest = ""
                for candidate in self._retroachievements_hash_candidates(resolved):
                    digest = candidate.lower()
                    game_id = self._hash_library.get(digest)
                    if game_id:
                        break

        if not game_id:
            for fallback_title in self._retroachievements_title_candidates(
                app_id, path, title, resolved
            ):
                game_id = self._resolve_ra_game_id_by_title(
                    fallback_title, app_id=app_id, path=path, resolved=resolved
                )
                if game_id:
                    break

        if not game_id:
            return None
        self._data["ra_game_ids"][str(app_id)] = int(game_id)
        self._save_data()
        return self._fetch_ra_achievements_sync(app_id)

    def _resolve_ra_game_id_by_title(
        self,
        title: str,
        app_id: int = 0,
        path: str = "",
        resolved: Path | None = None,
    ) -> int | None:
        matches = self._search_retroachievements_games_sync(
            title, 1, app_id=app_id, path=path, resolved=resolved
        )
        if not matches:
            return None
        best = matches[0]
        return int(best["id"]) if float(best.get("score") or 0) >= 0.82 else None

    def _search_retroachievements_games_sync(
        self,
        query: str,
        limit: int = 8,
        app_id: int = 0,
        path: str = "",
        resolved: Path | None = None,
    ) -> list[dict[str, Any]]:
        self._load_data()
        ra = self._data["settings"].get("retroachievements") or {}
        if not ra.get("enabled"):
            return []
        api_key = str(ra.get("api_key") or "").strip()
        if not api_key:
            return []
        context = path
        if app_id and not context:
            context = self._shortcut_launch_text_for_app(app_id)
        console_ids = self._ra_console_ids_for_context(context, resolved, query)
        index = self._load_ra_title_index(api_key, console_ids=console_ids)
        if not index:
            return []

        target = self._normalise_match_title(query)
        if not target:
            return []

        matches: list[dict[str, Any]] = []
        for item in index:
            candidate = str(item.get("match_title") or "")
            if not candidate:
                continue
            score = self._title_match_score(target, candidate)
            if score < 0.45:
                continue
            matches.append(
                {
                    "id": int(item["id"]),
                    "title": item.get("title") or "",
                    "console": item.get("console") or "",
                    "score": round(score, 4),
                }
            )
        matches.sort(key=lambda item: float(item["score"]), reverse=True)
        return matches[: max(1, min(int(limit or 8), 20))]

    def _load_ra_title_index(
        self, api_key: str, console_ids: list[int] | None = None
    ) -> list[dict[str, Any]]:
        now_ts = now()
        api_key_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
        requested_console_ids = [
            int(console_id)
            for console_id in dict.fromkeys(console_ids or [])
            if int(console_id or 0) > 0
        ]
        try:
            if self._ra_title_index and not requested_console_ids:
                return self._ra_title_index
            cached: dict[str, Any] = {}
            if self._ra_index_file.exists():
                cached = json.loads(self._ra_index_file.read_text(encoding="utf-8"))
                games_by_console = cached.get("games_by_console") or {}
                if (
                    requested_console_ids
                    and cached.get("api_key_hash") == api_key_hash
                    and isinstance(games_by_console, dict)
                ):
                    games: list[dict[str, Any]] = []
                    missing: list[int] = []
                    for console_id in requested_console_ids:
                        entry = games_by_console.get(str(console_id)) or {}
                        if (
                            isinstance(entry, dict)
                            and now_ts - int(entry.get("updated_at") or 0)
                            < 7 * 24 * 60 * 60
                            and isinstance(entry.get("games"), list)
                        ):
                            games.extend(entry["games"])
                        else:
                            missing.append(console_id)
                    if not missing and games:
                        return games
                    fetched = self._fetch_ra_console_games(api_key, missing)
                    for console_id, console_games in fetched.items():
                        games_by_console[str(console_id)] = {
                            "updated_at": now_ts,
                            "games": console_games,
                        }
                        games.extend(console_games)
                    cached["updated_at"] = now_ts
                    cached["api_key_hash"] = api_key_hash
                    cached["games_by_console"] = games_by_console
                    self._save_ra_title_cache(cached)
                    return [game for game in games if game.get("match_title")]
                if (
                    not requested_console_ids
                    and cached.get("api_key_hash") == api_key_hash
                    and now_ts - int(cached.get("updated_at") or 0) < 7 * 24 * 60 * 60
                    and isinstance(cached.get("games"), list)
                ):
                    self._ra_title_index = cached["games"]
                    return self._ra_title_index
                if not requested_console_ids and isinstance(games_by_console, dict):
                    games = []
                    for entry in games_by_console.values():
                        if (
                            isinstance(entry, dict)
                            and now_ts - int(entry.get("updated_at") or 0)
                            < 7 * 24 * 60 * 60
                            and isinstance(entry.get("games"), list)
                        ):
                            games.extend(entry["games"])
                    if games:
                        self._ra_title_index = games
                        return self._ra_title_index
        except Exception as error:
            decky.logger.error(f"Failed loading RetroAchievements title cache: {error}")

        if requested_console_ids:
            games_by_console = {}
            fetched = self._fetch_ra_console_games(api_key, requested_console_ids)
            games: list[dict[str, Any]] = []
            for console_id, console_games in fetched.items():
                games_by_console[str(console_id)] = {
                    "updated_at": now_ts,
                    "games": console_games,
                }
                games.extend(console_games)
            self._save_ra_title_cache(
                {
                    "updated_at": now_ts,
                    "api_key_hash": api_key_hash,
                    "games_by_console": games_by_console,
                    "games": [],
                }
            )
            return [game for game in games if game.get("match_title")]

        # Building a global RetroAchievements title index means dozens of API calls and
        # quickly hits rate limits. Use cached console indexes unless a game context
        # tells us which console to fetch.
        return []

    def _fetch_ra_console_games(
        self, api_key: str, console_ids: list[int]
    ) -> dict[int, list[dict[str, Any]]]:
        games: list[dict[str, Any]] = []
        by_console: dict[int, list[dict[str, Any]]] = {}
        for console_id in console_ids:
            try:
                game_list = self._ra_request_json(
                    RETROACHIEVEMENTS_GAME_LIST_URL,
                    {"y": api_key, "i": int(console_id), "f": 1, "h": 0},
                    timeout=35,
                )
                if isinstance(game_list, dict):
                    game_list = game_list.get("Results") or game_list.get("Games") or []
                if not isinstance(game_list, list):
                    continue
                console_games = self._normalise_ra_game_list(int(console_id), game_list)
                by_console[int(console_id)] = console_games
            except Exception as error:
                decky.logger.error(
                    f"Failed loading RetroAchievements game list for console {console_id}: {error}"
                )
        return by_console

    def _normalise_ra_game_list(
        self, console_id: int, values: list[Any]
    ) -> list[dict[str, Any]]:
        games: list[dict[str, Any]] = []
        console_name = self._ra_console_name(console_id)
        for game in values:
            if not isinstance(game, dict):
                continue
            game_id = int(
                self._as_number(
                    game.get("ID")
                    or game.get("id")
                    or game.get("GameID")
                    or game.get("gameID"),
                    0,
                )
            )
            title = self._clean_game_title(
                str(game.get("Title") or game.get("title") or "")
            )
            if game_id <= 0 or not title:
                continue
            games.append(
                {
                    "id": game_id,
                    "title": title,
                    "console_id": console_id,
                    "console": str(
                        game.get("ConsoleName")
                        or game.get("consoleName")
                        or console_name
                    ),
                    "match_title": self._normalise_match_title(title),
                }
            )
        return [game for game in games if game.get("match_title")]

    def _save_ra_title_cache(self, payload: dict[str, Any]) -> None:
        try:
            self._settings_dir.mkdir(parents=True, exist_ok=True)
            self._ra_index_file.write_text(
                json.dumps(payload, ensure_ascii=False),
                encoding="utf-8",
            )
        except Exception as error:
            decky.logger.error(f"Failed saving RetroAchievements title cache: {error}")

    def _ra_request_json(
        self, url: str, params: dict[str, Any], timeout: int = 25
    ) -> Any:
        context = ssl._create_unverified_context()
        last_error: Exception | None = None
        for attempt in range(4):
            request = urllib.request.Request(
                f"{url}?{urllib.parse.urlencode(params)}",
                headers={"User-Agent": "PlayhubMetadata/0.1 (+Decky Loader)"},
            )
            try:
                with urllib.request.urlopen(
                    request, timeout=timeout, context=context
                ) as response:
                    return json.loads(
                        response.read().decode("utf-8", errors="ignore")
                    )
            except urllib.error.HTTPError as error:
                last_error = error
                if error.code != 429 or attempt == 3:
                    raise
                retry_after = error.headers.get("Retry-After")
                try:
                    delay = max(1.0, min(float(retry_after or 0), 8.0))
                except Exception:
                    delay = min(1.5 * (attempt + 1), 6.0)
                time.sleep(delay)
        if last_error:
            raise last_error
        return None

    @staticmethod
    def _ra_console_name(console_id: int) -> str:
        names = {
            1: "Genesis/Mega Drive",
            2: "Nintendo 64",
            3: "SNES/Super Famicom",
            4: "Game Boy",
            5: "Game Boy Advance",
            6: "Game Boy Color",
            7: "NES/Famicom",
            11: "Master System",
            12: "PlayStation",
            16: "GameCube",
            18: "Nintendo DS",
            21: "PlayStation 2",
            24: "PlayStation Portable",
            27: "Arcade",
            40: "Dreamcast",
        }
        return names.get(int(console_id), f"Console {console_id}")

    def _ra_console_ids_for_context(
        self, path: str = "", resolved: Path | None = None, title: str = ""
    ) -> list[int]:
        haystack = " ".join(
            [
                str(path or ""),
                str(resolved or ""),
                str(title or ""),
            ]
        ).casefold()
        haystack = haystack.replace("\\", "/")
        checks: list[tuple[int, list[str]]] = [
            (21, ["/roms/ps2/", "pcsx2", "playstation 2", " ps2 "]),
            (12, ["/roms/psx/", "/roms/ps1/", "duckstation", "swanstation", "playstation", " ps1 "]),
            (16, ["/roms/gc/", "/roms/gamecube/", "dolphin", "gamecube"]),
            (24, ["/roms/psp/", "ppsspp", "playstation portable"]),
            (2, ["/roms/n64/", "mupen", "parallel", "nintendo 64"]),
            (18, ["/roms/nds/", "/roms/ds/", "melonds", "desmume", "nintendo ds"]),
            (5, ["/roms/gba/", "mgba", "game boy advance"]),
            (6, ["/roms/gbc/", "game boy color"]),
            (4, ["/roms/gb/", "game boy"]),
            (3, ["/roms/snes/", "/roms/sfc/", "super nintendo", "snes"]),
            (7, ["/roms/nes/", "famicom", " nes "]),
            (40, ["/roms/dreamcast/", "/roms/dc/", "flycast", "redream", "dreamcast"]),
            (1, ["/roms/genesis/", "/roms/megadrive/", "genesis", "mega drive"]),
        ]
        ids: list[int] = []
        for console_id, needles in checks:
            if any(needle in haystack for needle in needles):
                ids.append(console_id)
        suffix = (resolved.suffix.lower() if resolved else "").casefold()
        if not ids:
            if suffix in {".cue", ".pbp"}:
                ids.append(12)
            elif suffix in {".z64", ".n64", ".v64"}:
                ids.append(2)
            elif suffix in {".gba"}:
                ids.append(5)
            elif suffix in {".gbc"}:
                ids.append(6)
            elif suffix in {".gb"}:
                ids.append(4)
            elif suffix in {".sfc", ".smc"}:
                ids.append(3)
            elif suffix in {".nes", ".fds"}:
                ids.append(7)
        return [value for value in dict.fromkeys(ids) if value]

    def _shortcut_launch_text_for_app(self, app_id: int) -> str:
        target = int(app_id) & 0xFFFFFFFF
        for shortcut in self._read_steam_shortcuts():
            shortcut_id = int(shortcut.get("appid") or 0) & 0xFFFFFFFF
            if shortcut_id != target:
                continue
            return " ".join(
                str(shortcut.get(key) or "")
                for key in ("exe", "launch_options", "start_dir", "shortcut_path")
            )
        return ""

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

    def _retroachievements_title_candidates(
        self, app_id: int, path: str, title: str, resolved: Path | None
    ) -> list[str]:
        values: list[str] = []
        metadata = self._data.get("metadata", {}).get(str(app_id)) or {}
        values.extend(
            [
                title,
                str(metadata.get("title") or ""),
                resolved.stem if resolved else "",
            ]
        )
        values.extend(self._rom_title_candidates_from_text(path))
        cleaned: list[str] = []
        for value in values:
            title_value = self._clean_game_title(self._rom_display_title(value))
            if title_value and title_value not in cleaned:
                cleaned.append(title_value)
        return cleaned

    def _rom_title_candidates_from_text(self, text: str) -> list[str]:
        candidates: list[str] = []
        for raw in self._path_candidates_from_text(text):
            value = raw.strip().strip('"')
            lowered = value.casefold()
            if not any(lowered.endswith(ext.casefold()) for ext in ROM_EXTENSIONS):
                continue
            candidates.append(Path(value).name)
        return candidates

    @staticmethod
    def _rom_display_title(value: str) -> str:
        text = str(value or "").strip().strip('"')
        if not text:
            return ""
        name = Path(text).name or text
        lowered = name.casefold()
        for ext in sorted(ROM_EXTENSIONS, key=len, reverse=True):
            if lowered.endswith(ext.casefold()):
                name = name[: -len(ext)]
                lowered = name.casefold()
                break
        name = re.sub(r"[_\.\-]+", " ", name)
        name = re.sub(r"\[[^\]]+\]|\([^\)]*\)", " ", name)
        return re.sub(r"\s+", " ", name).strip()

    def _load_hash_library(self) -> None:
        try:
            if self._ra_hash_file.exists():
                cached = json.loads(self._ra_hash_file.read_text(encoding="utf-8"))
                if (
                    now() - int(cached.get("updated_at") or 0) < 7 * 24 * 60 * 60
                    and isinstance(cached.get("hashes"), dict)
                ):
                    self._hash_library = {
                        str(key).lower(): int(value)
                        for key, value in cached["hashes"].items()
                        if str(key).strip() and str(value).isdigit()
                    }
                    if self._hash_library:
                        return
        except Exception as error:
            decky.logger.error(f"Failed loading cached RetroAchievements hashes: {error}")

        request = urllib.request.Request(
            RETROACHIEVEMENTS_HASH_LIBRARY_URL,
            headers={"User-Agent": "PlayhubMetadata/0.1 (+Decky Loader)"},
        )
        context = ssl._create_unverified_context()
        try:
            with urllib.request.urlopen(request, timeout=30, context=context) as response:
                payload = json.loads(response.read().decode("utf-8", errors="ignore"))
        except Exception as error:
            decky.logger.error(f"Failed loading RetroAchievements hash library: {error}")
            return
        md5list = payload.get("MD5List") or payload.get("md5list") or {}
        if isinstance(md5list, dict):
            self._hash_library = {
                str(key).lower(): int(value)
                for key, value in md5list.items()
                if str(key).strip() and str(value).isdigit()
            }
            try:
                self._settings_dir.mkdir(parents=True, exist_ok=True)
                self._ra_hash_file.write_text(
                    json.dumps(
                        {"updated_at": now(), "hashes": self._hash_library},
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )
            except Exception as error:
                decky.logger.error(f"Failed saving RetroAchievements hashes: {error}")

    def _retro_payload_to_steam(
        self, payload: dict[str, Any], game_id: int
    ) -> dict[str, Any] | None:
        achievements = payload.get("Achievements") or payload.get("achievements") or {}
        if not isinstance(achievements, dict) or not achievements:
            return None
        distinct_players = self._as_number(
            payload.get("NumDistinctPlayersCasual")
            or payload.get("numDistinctPlayersCasual")
            or 1,
            1,
        )
        achieved: dict[str, Any] = {}
        unachieved: dict[str, Any] = {}
        global_data: dict[str, float] = {}
        for raw in achievements.values():
            if not isinstance(raw, dict):
                continue
            steam = self._retro_achievement_to_steam(raw, distinct_players)
            if not steam["strID"]:
                continue
            if steam["bAchieved"]:
                achieved[steam["strID"]] = steam
            else:
                unachieved[steam["strID"]] = steam
            global_data[steam["strID"]] = steam["flAchieved"]
        total = len(achieved) + len(unachieved)
        return {
            "game_id": game_id,
            "provider": "retroachievements",
            "title": payload.get("Title") or payload.get("title") or "",
            "steam": {
                "nAchieved": len(achieved),
                "nTotal": total,
                "vecAchievedHidden": [],
                "vecHighlight": list(achieved.values())[:3],
                "vecUnachieved": list(unachieved.values())[:12],
            },
            "user": {
                "loading": False,
                "data": {
                    "achieved": achieved,
                    "hidden": {},
                    "unachieved": unachieved,
                },
            },
            "global": {"loading": False, "data": global_data},
            "progress": {
                "achieved": len(achieved),
                "total": total,
                "percentage": (len(achieved) / total) * 100 if total else 0,
            },
        }

    def _retro_achievement_to_steam(
        self, achievement: dict[str, Any], distinct_players: float
    ) -> dict[str, Any]:
        title = str(achievement.get("Title") or achievement.get("title") or "")
        description = str(
            achievement.get("Description") or achievement.get("description") or ""
        )
        badge = str(achievement.get("BadgeName") or achievement.get("badgeName") or "0")
        date_earned = (
            achievement.get("DateEarnedHardcore")
            or achievement.get("DateEarned")
            or achievement.get("dateEarnedHardcore")
            or achievement.get("dateEarned")
        )
        achieved = bool(date_earned)
        num_awarded = self._as_number(
            achievement.get("NumAwarded") or achievement.get("numAwarded") or 0, 0
        )
        percent = (num_awarded / distinct_players) * 100 if distinct_players else 0
        clean_id = re.sub(r"[^A-Z0-9_]+", "", title.upper().replace(" ", "_"))
        return {
            "bAchieved": achieved,
            "bHidden": False,
            "flAchieved": percent,
            "flCurrentProgress": 1 if achieved else 0,
            "flMaxProgress": 1,
            "flMinProgress": 0,
            "rtUnlocked": self._date_to_epoch(date_earned) if achieved else 0,
            "strDescription": description,
            "strID": clean_id,
            "strImage": f"https://media.retroachievements.org/Badge/{badge}{'' if achieved else '_lock'}.png",
            "strName": title,
        }

    def _read_steam_shortcuts(self) -> list[dict[str, Any]]:
        shortcuts: dict[int, dict[str, Any]] = {}
        for base in self._steam_userdata_roots():
            if not base.exists():
                continue
            try:
                for user_dir in base.iterdir():
                    shortcut_file = user_dir / "config" / "shortcuts.vdf"
                    if not shortcut_file.exists() or not shortcut_file.is_file():
                        continue
                    for shortcut in self._extract_shortcuts_from_vdf(shortcut_file):
                        name = self._clean_game_title(str(shortcut.get("name") or ""))
                        exe = str(shortcut.get("exe") or "")
                        start_dir = str(shortcut.get("start_dir") or "")
                        launch_options = str(shortcut.get("launch_options") or "")
                        shortcut_path = str(shortcut.get("shortcut_path") or "")
                        icon = str(shortcut.get("icon") or "")
                        app_id = shortcut.get("appid")
                        if isinstance(app_id, int):
                            app_id = int(app_id) & 0xFFFFFFFF
                        else:
                            app_id = self._shortcut_app_id(exe, name)
                        if app_id > 0 and name:
                            shortcuts[app_id] = {
                                "appid": app_id,
                                "name": name,
                                "exe": exe,
                                "start_dir": start_dir,
                                "launch_options": launch_options,
                                "shortcut_path": shortcut_path,
                                "icon": icon,
                                "isNonSteam": True,
                            }
            except Exception as error:
                decky.logger.error(f"Failed reading Steam shortcuts: {error}")
        return sorted(shortcuts.values(), key=lambda item: item["name"].casefold())

    def _steam_userdata_roots(self) -> list[Path]:
        candidates = [
            Path.home() / ".local" / "share" / "Steam" / "userdata",
            Path.home() / ".steam" / "steam" / "userdata",
        ]
        if os.name == "nt":
            windows_candidates: list[Path] = []
            for env_name in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA"):
                value = os.environ.get(env_name)
                if value:
                    windows_candidates.append(Path(value) / "Steam" / "userdata")
            steam_path = self._read_windows_steam_path()
            if steam_path:
                windows_candidates.append(steam_path / "userdata")
            candidates = windows_candidates + candidates
        return candidates

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
            data = path.read_bytes()
        except Exception as error:
            decky.logger.error(f"Failed reading shortcuts.vdf {path}: {error}")
            return []
        try:
            root, _pos = self._parse_binary_vdf_object(data, 0)
            container = root.get("shortcuts", root)
            if isinstance(container, dict):
                shortcuts: list[dict[str, Any]] = []
                for value in container.values():
                    if not isinstance(value, dict):
                        continue
                    name = str(
                        self._vdf_get(value, "appname", "AppName", "name") or ""
                    ).strip()
                    exe = str(self._vdf_get(value, "exe", "Exe") or "").strip()
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
                        shortcuts.append(
                            {
                                "name": name,
                                "exe": exe,
                                "start_dir": start_dir,
                                "launch_options": launch_options,
                                "shortcut_path": shortcut_path,
                                "icon": icon,
                                "appid": self._vdf_get(value, "appid", "AppID"),
                            }
                        )
                return shortcuts
        except Exception as error:
            decky.logger.error(f"Failed parsing shortcuts.vdf {path}: {error}")
        text = data.decode("utf-8", errors="ignore")
        names = re.findall(r"appname\x00([^\x00]+)", text, flags=re.IGNORECASE)
        exes = re.findall(r"exe\x00([^\x00]+)", text, flags=re.IGNORECASE)
        launch_options = re.findall(
            r"launchoptions\x00([^\x00]*)", text, flags=re.IGNORECASE
        )
        icons = re.findall(r"icon\x00([^\x00]*)", text, flags=re.IGNORECASE)
        return [
            {
                "name": name.strip(),
                "exe": exes[index].strip() if index < len(exes) else "",
                "launch_options": launch_options[index].strip()
                if index < len(launch_options)
                else "",
                "icon": icons[index].strip() if index < len(icons) else "",
            }
            for index, name in enumerate(names)
            if name.strip()
        ]

    @staticmethod
    def _vdf_get(values: dict[str, Any], *names: str) -> Any:
        lowered = {str(key).casefold(): value for key, value in values.items()}
        for name in names:
            if name.casefold() in lowered:
                return lowered[name.casefold()]
        return None

    def _parse_binary_vdf_object(
        self, data: bytes, pos: int
    ) -> tuple[dict[str, Any], int]:
        result: dict[str, Any] = {}
        while pos < len(data):
            value_type = data[pos]
            pos += 1
            if value_type == 0x08:
                break
            key, pos = self._read_vdf_cstring(data, pos)
            if value_type == 0x00:
                child, pos = self._parse_binary_vdf_object(data, pos)
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
        return data[pos:end].decode("utf-8", errors="ignore"), end + 1

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
    def _as_number(value: Any, fallback: float) -> float:
        try:
            return float(value)
        except Exception:
            return fallback

    def _extract_rom_path(self, value: str) -> Path | None:
        text = str(value or "").strip()
        for raw in self._path_candidates_from_text(text):
            path = Path(raw.strip().strip('"')).expanduser()
            if self._is_supported_rom_path(path) and path.exists() and path.is_file():
                return path.resolve()
        path = Path(text.strip('"')).expanduser()
        if self._is_supported_rom_path(path) and path.exists() and path.is_file():
            return path.resolve()
        return None

    def _path_candidates_from_text(self, text: str) -> list[str]:
        candidates: list[str] = []
        extensions = sorted(
            (re.escape(ext.lstrip(".")) for ext in ROM_EXTENSIONS),
            key=len,
            reverse=True,
        )
        extension_pattern = "|".join(extensions)

        quoted = re.findall(r'"([^"]+)"', text)
        candidates.extend(quoted)

        windows_pattern = rf"[A-Za-z]:\\.*?\.(?:{extension_pattern})"
        posix_pattern = rf"/[^\n\r\"']*?\.(?:{extension_pattern})"
        candidates.extend(re.findall(windows_pattern, text, flags=re.IGNORECASE))
        candidates.extend(re.findall(posix_pattern, text, flags=re.IGNORECASE))

        tokens = re.findall(r'"([^"]+)"|(\S+)', text)
        candidates.extend((quoted or bare) for quoted, bare in tokens)

        return [value for value in dict.fromkeys(candidates) if value]

    def _retroachievements_hash_candidates(self, path: Path) -> list[str]:
        hashes: list[str] = []

        helper_hash = self._hash_with_native_helper(path)
        if helper_hash:
            hashes.append(helper_hash)

        if path.suffix.lower() == ".zip":
            hashes.extend(self._zip_hash_candidates(path))
        else:
            hashes.extend(self._file_hash_candidates(path))

        return [value for value in dict.fromkeys(hashes) if value]

    def _hash_with_native_helper(self, path: Path) -> str:
        names = ["hash.exe", "hash"]
        folders = [
            self._plugin_dir / "bin",
            self._plugin_dir / "backend",
            self._plugin_dir,
        ]
        for folder in folders:
            for name in names:
                helper = folder / name
                if not helper.exists() or not helper.is_file():
                    continue
                try:
                    result = subprocess.run(
                        [str(helper), str(path)],
                        capture_output=True,
                        text=True,
                        timeout=60,
                        check=True,
                    )
                except Exception as error:
                    decky.logger.error(f"RetroAchievements hash helper failed: {error}")
                    continue
                match = re.search(r"[0-9a-fA-F]{32}", result.stdout or "")
                if match:
                    return match.group(0).lower()
        return ""

    def _zip_hash_candidates(self, path: Path) -> list[str]:
        try:
            with zipfile.ZipFile(path) as archive:
                entries = [
                    entry
                    for entry in archive.infolist()
                    if not entry.is_dir()
                    and self._is_supported_rom_path(Path(entry.filename))
                    and entry.file_size > 0
                ]
                if not entries:
                    return [self._md5_file(path)]
                entries.sort(key=lambda item: item.file_size, reverse=True)
                with archive.open(entries[0]) as file:
                    data = file.read()
                return self._bytes_hash_candidates(data, Path(entries[0].filename))
        except Exception as error:
            decky.logger.error(f"Failed hashing zip ROM {path}: {error}")
            return [self._md5_file(path)]

    def _file_hash_candidates(self, path: Path) -> list[str]:
        try:
            size = path.stat().st_size
            if size <= 512 * 1024 * 1024:
                return self._bytes_hash_candidates(path.read_bytes(), path)
        except Exception as error:
            decky.logger.error(f"Failed reading ROM for candidate hashes {path}: {error}")
        return [self._md5_file(path)]

    def _bytes_hash_candidates(self, data: bytes, path: Path) -> list[str]:
        candidates = [self._md5_bytes(data)]
        suffix = path.suffix.lower()

        if suffix == ".nes" and data.startswith(b"NES\x1a") and len(data) > 16:
            candidates.append(self._md5_bytes(data[16:]))

        if suffix in {".sfc", ".smc", ".fig", ".swx"} and len(data) > 512:
            if len(data) % 0x4000 == 512 or len(data) % 0x8000 == 512:
                candidates.append(self._md5_bytes(data[512:]))

        return [value for value in dict.fromkeys(candidates) if value]

    def _is_supported_rom_path(self, path: Path) -> bool:
        name = path.name.lower()
        if name.endswith(".nkit.iso"):
            return True
        return path.suffix.lower() in ROM_EXTENSIONS

    @staticmethod
    def _md5_file(path: Path) -> str:
        digest = hashlib.md5()
        with path.open("rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def _md5_bytes(data: bytes) -> str:
        return hashlib.md5(data).hexdigest()
