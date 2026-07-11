from __future__ import annotations

import asyncio
import functools
import html
import json
import logging
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Awaitable, Callable, TypedDict


class MetadataRecord(TypedDict, total=False):
    """Typed shape of a single metadata record stored in decky_metadata.json.

    The ``total=False`` flag makes all keys optional so that both fully
    populated records and sparse "shell" records (e.g. freshly created
    manual entries) are valid.  In practice, ``title``, ``id``,
    ``description``, and ``store_categories`` are always present after
    ``_sanitize_metadata`` runs.
    """

    title: str
    id: str | int
    source: str
    source_url: str
    description: str
    short_description: str
    developers: list[dict[str, str]]
    publishers: list[dict[str, str]]
    release_date: int | None
    rating: int | None
    steam_store_state: str
    deck_compat_category: int | None
    store_categories: list[int]
    genres: list[str]
    features: list[str]
    screenshots: list[dict[str, Any]]
    steam_appid: int | None
    steam_store_url: str
    steam_news: list[dict[str, Any]]
    steam_news_enriched_at: int
    updated_at: int

import decky

# Decky exec's main.py via importlib without adding the plugin directory to
# sys.path, so the local ``backend`` package is not importable by default on
# device (unlike pytest, which runs from the repo root). Ensure our own
# directory is importable before pulling in the backend package.
sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))

from backend import matching, scan_runner, shortcuts_vdf, storage, steam_paths
from backend.providers import delisted as delisted_provider
from backend.providers import ign as ign_provider
from backend.providers import steam as steam_provider
from backend.providers.delisted import STEAM_TRACKER_DELISTED_URL
from backend.scan_runner import ScanPipelineResult, ScanPipelineTarget
from backend.steam_paths import SteamInstall

PLUGIN_BASE_VERSION = "0.1.0"
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
            decky.logger.log(level, text, exc_info=True)
        else:
            decky.logger.log(level, text)
    except Exception:
        pass


_FRONTEND_LOG_LEVELS = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "warn": logging.WARNING,
    "error": logging.ERROR,
}


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


def _read_version_file(path: Path) -> str:
    try:
        value = json.loads(path.read_text(encoding="utf-8")).get("version")
        return value.strip() if isinstance(value, str) and value.strip() else ""
    except Exception as error:
        _plog("version", "version file unreadable", level=logging.DEBUG, path=path, error=error)
        return ""


def _resolve_plugin_root() -> Path | None:
    try:
        current = Path(__file__).resolve().parent
    except Exception as error:
        _plog("version", "plugin root resolution failed", level=logging.DEBUG, error=error)
        return None

    for _ in range(6):
        if (current / "plugin.json").is_file() or (current / "package.json").is_file():
            return current
        parent = current.parent
        if parent == current:
            break
        current = parent
    return None


def _resolve_plugin_version() -> str:
    root = _resolve_plugin_root()
    if root is None:
        return PLUGIN_BASE_VERSION

    for filename in ("plugin.json", "package.json"):
        version = _read_version_file(root / filename)
        if version:
            return version
    return PLUGIN_BASE_VERSION


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
        self._data_cache: dict[str, Any] | None = None
        self._data_cache_mtime_ns: int | None = None
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

    def _is_steamos(self) -> bool:
        return steam_paths.is_steamos()

    def _detect_steam_roots(self) -> list[Path]:
        return steam_paths.detect_steam_roots(_plog)

    def _detect_steam_installs(self) -> list[SteamInstall]:
        return steam_paths.detect_steam_installs(self._detect_steam_roots(), _plog)

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

    async def get_plugin_version(self) -> str:
        return _resolve_plugin_version()

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

    async def get_metadata(self, app_id: int) -> MetadataRecord | None:
        self._load_data()
        return self._data["metadata"].get(str(app_id))

    async def get_all_metadata(self) -> dict[str, Any]:
        self._load_data()
        return self._data["metadata"]

    async def save_metadata(
        self, app_id: int, metadata: dict[str, Any]
    ) -> MetadataRecord:
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

    async def frontend_log(self, area="ui", message="", fields=None, level="debug") -> bool:
        try:
            clean_fields = fields if isinstance(fields, dict) else {}
            resolved_level = _FRONTEND_LOG_LEVELS.get(
                str(level or "").strip().lower(), logging.DEBUG
            )
            _plog(str(area or "ui"), str(message or ""), **clean_fields, level=resolved_level)
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

    async def get_missing_metadata_count(self, games: list[dict[str, Any]]) -> int:
        self._load_data()
        count = 0
        for game in games or []:
            if not isinstance(game, dict):
                continue
            raw_appid = str(game.get("appid", "")).strip()
            if not raw_appid:
                continue
            try:
                app_id = int(raw_appid)
            except (TypeError, ValueError):
                continue
            if self._metadata_needs_scan(app_id):
                count += 1
        return count

    async def start_refresh_steam_activities(self, games: list[dict[str, Any]]) -> dict[str, Any]:
        if self._activity_refresh_task and not self._activity_refresh_task.done():
            return self._activity_refresh_progress
        self._activity_refresh_progress = self._new_scan_progress("running")
        self._activity_refresh_task = asyncio.create_task(self._refresh_steam_activities(games or []))
        return self._activity_refresh_progress

    async def refresh_steam_activity_for_app(self, app_id: int) -> dict[str, Any] | None:
        # Passive per-app stale-while-revalidate refresh. A running batch refresh
        # already covers this data and uses the same persistence path.
        if self._activity_refresh_task and not self._activity_refresh_task.done():
            return None
        self._load_data()
        metadata = self._data["metadata"].get(str(app_id))
        if not isinstance(metadata, dict):
            return None
        target: ScanPipelineTarget = {
            "app_id": int(app_id),
            "title": self._clean_game_title(str(metadata.get("title") or "")),
            "metadata": dict(metadata),
        }
        result = await asyncio.to_thread(self._activity_refresh_match_sync, target)
        if result["metadata"]:
            await self._save_activity_pipeline_metadata(int(app_id), result["metadata"])
        return result["metadata"] if result["status"] == "matched" else None

    async def get_activity_refresh_progress(self) -> dict[str, Any]:
        return self._activity_refresh_progress

    async def get_local_shortcuts(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._read_steam_shortcuts)

    def _default_data(self) -> dict[str, Any]:
        return storage.default_data()

    def _load_data(self) -> None:
        if not self._data_file.exists():
            self._save_data()
            return
        result = storage.load_data(self._data_file, self._data_cache, self._data_cache_mtime_ns, _plog)
        if result is None:
            return
        self._data, self._data_cache, self._data_cache_mtime_ns = result
        try:
            if self._normalize_loaded_store_states():
                self._save_data()
        except Exception as error:
            _plog(
                "load",
                "failed normalizing loaded Steam store states",
                level=logging.ERROR,
                exc=True,
                error=error,
            )

    def _normalize_loaded_store_states(self) -> bool:
        metadata = self._data.get("metadata")
        if not isinstance(metadata, dict):
            return False

        changed = False
        valid_states = {"available", "delisted", "unknown"}
        for record in metadata.values():
            if not isinstance(record, dict):
                continue
            raw_state = record.get("steam_store_state")
            normalized_state = str(raw_state or "").strip().lower()
            if normalized_state not in valid_states:
                steam_appid = self._safe_int(record.get("steam_appid"))
                normalized_state = (
                    "delisted"
                    if steam_appid and self._appid_is_delisted_cached(steam_appid)
                    else "unknown"
                )
            if raw_state != normalized_state:
                record["steam_store_state"] = normalized_state
                changed = True
        return changed

    def _save_data(self) -> None:
        self._settings_dir.mkdir(parents=True, exist_ok=True)
        self._data_cache, self._data_cache_mtime_ns = storage.save_data(self._data_file, self._data)

    def _new_scan_progress(self, status: str) -> dict[str, Any]:
        return scan_runner.new_scan_progress(status)

    def _metadata_is_complete(self, metadata: dict[str, Any] | None) -> bool:
        if not isinstance(metadata, dict):
            return False
        title = self._clean_game_title(str(metadata.get("title") or ""))
        source = str(metadata.get("source") or "").strip().casefold()
        has_description = bool(self._clean_html_text(str(metadata.get("description") or metadata.get("short_description") or "")))
        return bool(title and (source not in {"", "manual"} or has_description))

    def _metadata_needs_scan(self, app_id: int) -> bool:
        metadata = self._data["metadata"].get(str(app_id))
        # Treat empty/manual shells as missing so the metadata scan can repair them,
        # but do not use missing Steam Activity/news as a reason to scan metadata.
        return not self._metadata_is_complete(metadata)

    def _steam_scan_match_sync(self, title: str) -> ScanPipelineResult:
        steam_shell = {"title": title, "source": "Manual", "id": title}
        metadata = self._metadata_with_steam_news_sync(steam_shell, title, 10)
        if self._metadata_is_complete(metadata):
            return {"status": "matched", "metadata": metadata, "source": "steam"}
        if self._safe_int(metadata.get("steam_appid")) or metadata.get("steam_news"):
            return {"status": "miss", "metadata": metadata, "source": "steam"}
        return {"status": "miss", "metadata": None, "source": "steam"}

    def _delisted_scan_match_sync(self, title: str) -> ScanPipelineResult:
        delisted_appid = self._resolve_delisted_appid_for_title(title)
        if not delisted_appid:
            return {"status": "miss", "metadata": None, "source": "delisted"}
        pinned = {
            "title": title,
            "source": "Manual",
            "id": title,
            "steam_appid": delisted_appid,
            "steam_store_state": "delisted",
        }
        metadata = self._metadata_with_steam_news_sync(pinned, title, 10)
        if self._metadata_is_complete(metadata):
            return {"status": "matched", "metadata": metadata, "source": "delisted"}
        return {"status": "miss", "metadata": metadata, "source": "delisted"}

    def _ign_scan_match_sync(self, title: str) -> ScanPipelineResult:
        metadata = self._auto_fetch_metadata_sync(title)
        if not metadata:
            return {"status": "miss", "metadata": None, "source": "ign"}
        enriched = self._metadata_with_steam_news_sync(metadata, title, 10)
        return {"status": "matched", "metadata": enriched, "source": "ign"}

    def _metadata_scan_match_sync(self, target: ScanPipelineTarget) -> ScanPipelineResult:
        best_partial = None
        title = target["title"]

        for resolver in (self._steam_scan_match_sync, self._delisted_scan_match_sync):
            result = resolver(title)
            if result["status"] == "matched":
                return result
            if result["metadata"]:
                if not best_partial or self._safe_int(result["metadata"].get("steam_appid")):
                    best_partial = result["metadata"]

        if best_partial:
            ign_metadata = self._auto_fetch_metadata_sync(title)
            if ign_metadata:
                merged = dict(best_partial)
                for key, value in ign_metadata.items():
                    if value or key not in merged:
                        merged[key] = value
                enriched = self._metadata_with_steam_news_sync(merged, title, 10)
                if self._metadata_is_complete(enriched):
                    return {"status": "matched", "metadata": enriched, "source": "ign"}
                best_partial = enriched
        else:
            result = self._ign_scan_match_sync(title)
            if result["status"] == "matched":
                return result
            if result["metadata"]:
                best_partial = result["metadata"]

        return {"status": "miss", "metadata": best_partial, "source": "metadata"}

    def _activity_refresh_match_sync(self, target: ScanPipelineTarget) -> ScanPipelineResult:
        metadata = dict(target["metadata"] or {})
        refreshed = self._metadata_with_steam_news_sync(
            metadata,
            target["title"],
            10,
            include_details=False,
        )
        if refreshed and self._sanitize_steam_news(refreshed.get("steam_news")):
            return {"status": "matched", "metadata": refreshed, "source": "steam_activity"}
        if refreshed:
            return {"status": "miss", "metadata": refreshed, "source": "steam_activity"}
        return {"status": "miss", "metadata": None, "source": "steam_activity"}

    async def _save_scan_pipeline_metadata(
        self, app_id: int, metadata: dict[str, Any]
    ) -> None:
        await self.save_metadata(app_id, metadata)

    async def _save_activity_pipeline_metadata(
        self, app_id: int, metadata: dict[str, Any]
    ) -> None:
        self._data["metadata"][str(app_id)] = metadata
        self._save_data()

    async def _run_scan_pipeline(
        self,
        targets: list[ScanPipelineTarget],
        progress: dict[str, Any],
        resolver: Callable[[ScanPipelineTarget], ScanPipelineResult],
        saver: Callable[[int, dict[str, Any]], Awaitable[None]],
        *,
        initial_message: str,
        matched_messages: dict[str, str],
        miss_message: str,
        error_message: str,
        log_message: str,
    ) -> None:
        await scan_runner.run_scan_pipeline(
            targets,
            progress,
            resolver,
            saver,
            initial_message=initial_message,
            matched_messages=matched_messages,
            miss_message=miss_message,
            error_message=error_message,
            log_message=log_message,
            plog=_plog,
        )

    async def _scan_missing(self, games: list[dict[str, Any]]) -> None:
        self._load_data()
        missing = [
            {
                "app_id": int(game.get("appid")),
                "title": self._clean_game_title(str(game.get("name") or "")),
                "metadata": None,
            }
            for game in games
            if isinstance(game, dict)
            and str(game.get("appid", "")).strip()
            and self._metadata_needs_scan(int(game.get("appid")))
        ]
        if missing:
            await asyncio.to_thread(self._ensure_delisted_index_sync, False)
        await self._run_scan_pipeline(
            missing,
            self._scan_progress,
            self._metadata_scan_match_sync,
            self._save_scan_pipeline_metadata,
            initial_message="Matching metadata for {title}",
            matched_messages={
                "steam": "Matched Steam for {title}",
                "delisted": "Matched delisted Steam app for {title}",
                "ign": "Saved metadata for {title}",
            },
            miss_message="No metadata match for {title}",
            error_message="Failed: {title}",
            log_message="metadata scan failed",
        )

    async def _refresh_steam_activities(self, games: list[dict[str, Any]]) -> None:
        self._load_data()
        targets: list[ScanPipelineTarget] = []
        for game in games:
            if not isinstance(game, dict) or not str(game.get("appid", "")).strip():
                continue
            metadata = self._data["metadata"].get(str(int(game.get("appid"))))
            if isinstance(metadata, dict):
                targets.append(
                    {
                        "app_id": int(game.get("appid")),
                        "title": self._clean_game_title(str(game.get("name") or metadata.get("title") or "")),
                        "metadata": dict(metadata),
                    }
                )
        await self._run_scan_pipeline(
            targets,
            self._activity_refresh_progress,
            self._activity_refresh_match_sync,
            self._save_activity_pipeline_metadata,
            initial_message="Refreshing Steam Activity for {title}",
            matched_messages={"steam_activity": "Updated Steam Activity for {title}"},
            miss_message="No Steam Activity found for {title}",
            error_message="Failed: {title}",
            log_message="Steam Activity refresh failed",
        )

    def _search_metadata_sync(self, query: str, limit: int = 8) -> list[dict[str, Any]]:
        return ign_provider.search_metadata(query, limit, self._graphql)

    def _auto_fetch_metadata_sync(self, title: str) -> dict[str, Any] | None:
        return ign_provider.auto_fetch_metadata(title, self._fetch_metadata_sync, self._search_metadata_sync)

    def _ign_title_acceptable(self, query: str, candidate_title: str) -> bool:
        return matching.ign_title_acceptable(query, candidate_title)

    def _fetch_metadata_sync(self, slug_or_url: str) -> dict[str, Any] | None:
        return ign_provider.fetch_metadata(slug_or_url, self._graphql, self._game_to_metadata)

    def _game_to_metadata(self, game: dict[str, Any]) -> dict[str, Any]:
        return self._sanitize_metadata(ign_provider.game_to_metadata(game))

    def _sanitize_metadata(self, metadata: dict[str, Any]) -> MetadataRecord:
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

        steam_appid = self._safe_int(metadata.get("steam_appid"))
        steam_store_state = str(metadata.get("steam_store_state") or "").strip().lower()
        if steam_store_state not in {"available", "delisted", "unknown"}:
            steam_store_state = "unknown"
        if steam_store_state == "unknown" and steam_appid:
            if self._appid_is_delisted_cached(steam_appid):
                steam_store_state = "delisted"
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
            "steam_appid": steam_appid,
            "steam_store_state": steam_store_state,
            "steam_store_url": self._https_url(str(metadata.get("steam_store_url") or "")),
            "steam_news": self._sanitize_steam_news(metadata.get("steam_news")),
            "steam_news_enriched_at": int(
                self._as_number(metadata.get("steam_news_enriched_at"), 0)
            ),
        }

    def _metadata_with_steam_news_sync(
        self,
        metadata: dict[str, Any],
        title: str,
        limit: int = 6,
        *,
        include_details: bool = True,
    ) -> MetadataRecord:
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
            if include_details:
                deck_compat_category = self._steam_deck_compat_for_appid(steam_appid)
                if deck_compat_category is not None:
                    next_metadata["deck_compat_category"] = deck_compat_category
                steam_details = self._steam_appdetails_for_appid(steam_appid)
                if steam_details:
                    for key, value in steam_details.items():
                        if value:
                            next_metadata[key] = value
                    next_metadata["source"] = "Steam"
                    if str(metadata.get("steam_store_state") or "").strip().lower() != "delisted":
                        next_metadata["steam_store_state"] = "available"
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
        return steam_appid, steam_store_url or steam_provider.STEAM_STORE_APP_URL.format(appid=steam_appid), news

    def _steam_partner_asset_url(self, raw: str, clan_id: str = "") -> str:
        return steam_provider.steam_partner_asset_url(raw, clan_id)

    def _steam_news_image_candidates(self, contents: str, steam_appid: int = 0) -> list[str]:
        return steam_provider.steam_news_image_candidates(contents, steam_appid)

    def _steam_deck_compat_for_appid(self, steam_appid: int) -> int | None:
        return steam_provider.steam_deck_compat_for_appid(steam_appid, self._http_json, _plog)

    def _steam_appdetails_for_appid(self, steam_appid: int) -> dict[str, Any] | None:
        details = steam_provider.steam_appdetails_for_appid(steam_appid, self._http_json, _plog)
        if details is None:
            return None
        sanitized_screenshots = self._sanitize_screenshots(details.pop("screenshots", []))
        if sanitized_screenshots:
            details["screenshots"] = sanitized_screenshots
        return details or None

    def _steam_partner_events_for_appid(self, steam_appid: int, limit: int = 10) -> list[dict[str, Any]]:
        rows = steam_provider.steam_partner_events_for_appid(steam_appid, limit, self._http_json, _plog)
        return self._sanitize_steam_news(rows)

    def _resolve_steam_appid_for_title(
        self,
        title: str,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[int | None, str]:
        return steam_provider.resolve_steam_appid_for_title(title, metadata, self._http_json)

    def _parse_delisted_html(self, html_text: str) -> list[list[Any]]:
        return delisted_provider.parse_delisted_html(html_text)

    def _delisted_index_path(self) -> str:
        return delisted_provider.index_path(self._settings_dir)

    def _download_delisted_index_sync(self) -> dict[str, Any] | None:
        return delisted_provider.download_delisted_index(self._http_text, _plog)

    def _load_delisted_index_sync(self) -> dict[str, Any] | None:
        return delisted_provider.load_delisted_index(self._delisted_index_path())

    def _ensure_delisted_index_sync(self, force: bool = False) -> dict[str, Any] | None:
        result = delisted_provider.ensure_delisted_index(
            getattr(self, "_delisted_index", None),
            self._delisted_index_path(),
            force,
            self._http_text,
            _plog,
        )
        if isinstance(result, dict):
            self._delisted_index = result
        return result

    def _resolve_delisted_appid_for_title(self, title: str) -> int:
        index = self._ensure_delisted_index_sync(False)
        apps = index.get("apps") if isinstance(index, dict) else None
        return delisted_provider.resolve_delisted_appid_for_title(title, apps)

    def _appid_is_delisted_cached(self, appid: int) -> bool:
        index = getattr(self, "_delisted_index", None)
        if not isinstance(index, dict):
            try:
                index = self._load_delisted_index_sync()
            except Exception:
                pass
            if isinstance(index, dict):
                self._delisted_index = index
        apps = index.get("apps") if isinstance(index, dict) else None
        if not isinstance(apps, list):
            return False
        for row in apps:
            if isinstance(row, (list, tuple)) and len(row) > 0 and self._safe_int(row[0]) == appid:
                return True
        return False

    def _appid_is_delisted_sync(self, appid: int) -> bool:
        try:
            index = self._ensure_delisted_index_sync(False)
        except Exception:
            return False
        apps = index.get("apps") if isinstance(index, dict) else None
        if not isinstance(apps, list):
            return False
        for row in apps:
            if isinstance(row, (list, tuple)) and len(row) > 0 and self._safe_int(row[0]) == appid:
                return True
        return False

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
            payload = self._http_json(f"{steam_provider.STEAM_NEWS_URL}?{params}", timeout=12)
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

    def _steam_announcement_page_image(self, url: str) -> str:
        return steam_provider.steam_announcement_page_image(url, self._http_text)

    def _clean_steam_news_text(self, value: str) -> str:
        return steam_provider.clean_steam_news_text(value)

    def _steam_news_raw_body(self, value: str) -> str:
        return steam_provider.steam_news_raw_body(value)

    def _steam_news_summary(self, contents: str) -> str:
        return steam_provider.steam_news_summary(contents)

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

    def _collected_steam_news_image_sources(self, item: dict[str, Any]) -> list[str]:
        raw_sources = item.get("image_sources") if isinstance(item.get("image_sources"), list) else []
        image_sources: list[str] = []
        for candidate in [*raw_sources, item.get("image"), item.get("image_url"), item.get("preview_image_url")]:
            image = self._steam_partner_asset_url(str(candidate or "")) or self._https_url(str(candidate or "").strip())
            if image and image not in image_sources:
                image_sources.append(image)
        return image_sources

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
            image_sources = self._collected_steam_news_image_sources(item)
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
    def _https_url(value: str) -> str:
        return matching.https_url(value)

    def _graphql(self, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
        request = urllib.request.Request(
            ign_provider.IGN_GRAPHQL_URL,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Origin": ign_provider.IGN_BASE_URL,
                "Referer": f"{ign_provider.IGN_BASE_URL}/",
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

    @staticmethod
    def _is_non_primary_steam_title(name: str) -> bool:
        return matching.is_non_primary_steam_title(name)

    @staticmethod
    def _distinctive_tokens_present(query_norm: str, candidate_norm: str) -> bool:
        return matching.distinctive_tokens_present(query_norm, candidate_norm)

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
        return steam_paths.userdata_roots_from_candidates(self._detect_steam_roots(), _plog)

    def _extract_shortcuts_from_vdf(self, path: Path) -> list[dict[str, Any]]:
        return shortcuts_vdf.extract_shortcuts_from_vdf(path, _plog)

    def _normalize_shortcut_app_id(self, value: Any, exe: str, name: str) -> int:
        return shortcuts_vdf.normalize_shortcut_app_id(value, exe, name)

    def _slug_candidates(self, title: str) -> list[str]:
        return ign_provider.slug_candidates(title)

    @staticmethod
    def _clean_html_text(value: str) -> str:
        return matching.clean_html_text(value)

    @staticmethod
    def _clean_game_title(name: str) -> str:
        return matching.clean_game_title(name)

    @staticmethod
    def _date_to_epoch(value: Any) -> int:
        return matching.date_to_epoch(value)

    @staticmethod
    def _safe_int(value: Any) -> int | None:
        return matching.safe_int(value)

    @staticmethod
    def _as_number(value: Any, fallback: float) -> float:
        return matching.as_number(value, fallback)
