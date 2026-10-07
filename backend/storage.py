from __future__ import annotations

import copy
import datetime
import json
import logging
import os
from pathlib import Path
from typing import Any, Callable

from backend import matching

RELEASE_DATE_FORMAT = "date-only-v1"

PlogFn = Callable[..., None]

DEFAULT_TRAILER_SETTINGS: dict[str, Any] = {
    "enabled": False,
    "audioEnabled": False,
    "quality": "auto",
    "hideLogoDuringTrailer": False,
    "fadeInDelaySeconds": 3,
}
TRAILER_QUALITIES = ("auto", 720, 1080, 1440, 2160)

DEFAULT_PROTONDB_BADGE_SETTINGS: dict[str, Any] = {
    "enabled": False,
    "home": True,
    "library": True,
    "gameView": True,
    "store": True,
    "focusOnly": False,
    "coverPosition": "bottom-left",
}
PROTONDB_COVER_POSITIONS = ("bottom-left", "top-left", "top-right")


def normalize_protondb_badge_settings(value: Any) -> dict[str, Any]:
    settings = value if isinstance(value, dict) else {}
    normalized = {
        key: settings[key] if type(settings.get(key)) is bool else default
        for key, default in DEFAULT_PROTONDB_BADGE_SETTINGS.items()
        if type(default) is bool
    }
    position = settings.get("coverPosition")
    normalized["coverPosition"] = (
        position if isinstance(position, str) and position in PROTONDB_COVER_POSITIONS
        else DEFAULT_PROTONDB_BADGE_SETTINGS["coverPosition"]
    )
    return normalized


def normalize_trailer_settings(value: Any) -> dict[str, Any]:
    """Normalize saved trailer preferences without coercing incorrect types."""
    settings = value if isinstance(value, dict) else {}
    quality = settings.get("quality")
    if type(quality) is not str and type(quality) is not int:
        quality = "auto"
    if quality not in TRAILER_QUALITIES:
        quality = "auto"
    return {
        "enabled": settings.get("enabled") if type(settings.get("enabled")) is bool else False,
        "audioEnabled": settings.get("audioEnabled") if type(settings.get("audioEnabled")) is bool else False,
        "quality": quality,
        "hideLogoDuringTrailer": (
            settings.get("hideLogoDuringTrailer")
            if type(settings.get("hideLogoDuringTrailer")) is bool
            else False
        ),
        "fadeInDelaySeconds": (
            settings["fadeInDelaySeconds"]
            if type(settings.get("fadeInDelaySeconds")) is int and 0 <= settings["fadeInDelaySeconds"] <= 10
            else 3
        ),
    }


def compatibility_default(value: Any) -> int | None:
    """Return a valid global compatibility category, with Automatic as null."""
    if value is None or isinstance(value, bool):
        return None
    return value if isinstance(value, int) and value in {0, 1, 2, 3} else None


def compatibility_default_scope(value: Any) -> str | None:
    """Return a persisted compatibility scope only when it is canonical."""
    return value if isinstance(value, str) and value in {"steam", "no-steam", "metadata", "all"} else None


def default_data() -> dict[str, Any]:
    return {
        "release_date_format": RELEASE_DATE_FORMAT,
        "metadata": {},
        # Name-management history is intentionally separate from editable
        # metadata. Removing or refreshing metadata must never strand a user
        # without the exact name required to restore a shortcut.
        "shortcut_names": {},
        "settings": {
            "debug_logging": False,
            "deck_compat_default": None,
            "game_trailers": dict(DEFAULT_TRAILER_SETTINGS),
            "mini_achievements_enabled": False,
            "protondb_badges": dict(DEFAULT_PROTONDB_BADGE_SETTINGS),
        },
        "update_settings": {},
        "update_check_cache": {},
    }


def migrate_release_dates(payload: dict[str, Any]) -> bool:
    if payload.get("release_date_format") == RELEASE_DATE_FORMAT:
        return False
    for record in (payload.get("metadata") or {}).values():
        if not isinstance(record, dict) or "release_date" not in record:
            continue
        value = record["release_date"]
        canonical = matching.normalize_release_date(value)
        if isinstance(value, str) and value == canonical:
            continue
        try:
            if isinstance(value, bool) or not isinstance(value, (str, int, float)):
                raise ValueError("Not a legacy timestamp")
            timestamp = int(value)
            if timestamp <= 0:
                raise ValueError("Absent legacy timestamp")
            record["release_date"] = datetime.datetime.fromtimestamp(timestamp).date().isoformat()
        except (ValueError, TypeError, OverflowError, OSError):
            record["release_date"] = None
    payload["release_date_format"] = RELEASE_DATE_FORMAT
    return True



def load_data(
    data_file: Path,
    cache: dict[str, Any] | None,
    cache_mtime_ns: int | None,
    plog: PlogFn,
) -> tuple[dict[str, Any], dict[str, Any] | None, int | None] | None:
    try:
        mtime_ns = data_file.stat().st_mtime_ns
    except OSError as error:
        plog("load", "failed stat metadata settings", level=logging.ERROR, exc=True, path=data_file, error=error)
        return None
    if cache is not None and cache_mtime_ns == mtime_ns and cache.get("release_date_format") == RELEASE_DATE_FORMAT:
        return copy.deepcopy(cache), cache, cache_mtime_ns
    try:
        payload = json.loads(data_file.read_text(encoding="utf-8"))
    except Exception as error:
        plog("load", "failed reading metadata settings", level=logging.ERROR, exc=True, path=data_file, error=error)
        return None
    if not isinstance(payload, dict):
        return None
    # Persist the raw payload first. A failed replacement must not publish
    # converted dates, and unrelated fields must survive byte-for-value.
    if migrate_release_dates(payload):
        _, mtime_ns = save_data(data_file, payload)
    merged = default_data()
    merged.update(payload)
    merged["metadata"] = dict(payload.get("metadata") or {})
    shortcut_names = payload.get("shortcut_names")
    merged["shortcut_names"] = {}
    if isinstance(shortcut_names, dict):
        merged["shortcut_names"].update(shortcut_names)
    payload_settings = payload.get("settings")
    merged["settings"] = dict(default_data()["settings"])
    if isinstance(payload_settings, dict):
        merged["settings"].update(payload_settings)
    merged["update_settings"] = dict(payload.get("update_settings") or {})
    merged["update_check_cache"] = dict(payload.get("update_check_cache") or {})
    merged["settings"]["debug_logging"] = bool(merged["settings"].get("debug_logging", False))
    if isinstance(payload_settings, dict) and "game_trailers" in payload_settings:
        merged["settings"]["game_trailers"] = normalize_trailer_settings(
            payload_settings.get("game_trailers")
        )
    else:
        # Keep legacy files unchanged when an unrelated setting is saved.
        # get_trailer_settings supplies the defaults until a user saves this setting.
        merged["settings"].pop("game_trailers", None)
    if isinstance(payload_settings, dict) and "deck_compat_default" in payload_settings:
        merged["settings"]["deck_compat_default"] = compatibility_default(
            merged["settings"].get("deck_compat_default")
        )
    else:
        # Missing means Automatic, but do not rewrite legacy settings merely
        # because a newer key was introduced.
        merged["settings"].pop("deck_compat_default", None)
    if isinstance(payload_settings, dict) and "mini_achievements_enabled" in payload_settings:
        value = merged["settings"].get("mini_achievements_enabled")
        merged["settings"]["mini_achievements_enabled"] = value if type(value) is bool else False
    else:
        # Keep legacy files unchanged until this preference is explicitly saved.
        merged["settings"].pop("mini_achievements_enabled", None)
    if isinstance(payload_settings, dict) and "protondb_badges" in payload_settings:
        merged["settings"]["protondb_badges"] = normalize_protondb_badge_settings(
            payload_settings["protondb_badges"]
        )
    else:
        merged["settings"].pop("protondb_badges", None)

    has_scope = isinstance(payload_settings, dict) and "deck_compat_default_scope" in payload_settings
    has_legacy_scope = isinstance(payload_settings, dict) and "deck_compat_default_matched_only" in payload_settings
    canonical_scope = compatibility_default_scope(merged["settings"].get("deck_compat_default_scope")) if has_scope else None
    fallback_scope = "metadata" if has_legacy_scope and merged["settings"].get("deck_compat_default_matched_only") is True else "all"
    if has_scope or has_legacy_scope:
        merged["settings"]["deck_compat_default_scope"] = canonical_scope or fallback_scope
    else:
        # Leave a file with neither old nor new scope key untouched in memory;
        # callers provide the all-shortcuts default without causing a rewrite.
        merged["settings"].pop("deck_compat_default_scope", None)
    if has_legacy_scope:
        merged["settings"].pop("deck_compat_default_matched_only", None)
    return merged, copy.deepcopy(merged), mtime_ns


def save_data(data_file: Path, data: dict[str, Any]) -> tuple[dict[str, Any], int]:
    data_file.parent.mkdir(parents=True, exist_ok=True)
    temp_path = data_file.with_name(f"{data_file.name}.tmp")
    temp_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(temp_path, data_file)
    return copy.deepcopy(data), data_file.stat().st_mtime_ns
