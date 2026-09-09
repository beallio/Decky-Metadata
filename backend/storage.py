from __future__ import annotations

import copy
import json
import logging
import os
from pathlib import Path
from typing import Any, Callable

PlogFn = Callable[..., None]


def compatibility_default(value: Any) -> int | None:
    """Return a valid global compatibility category, with Automatic as null."""
    if value is None or isinstance(value, bool):
        return None
    return value if isinstance(value, int) and value in {0, 1, 2, 3} else None


def compatibility_default_matched_only(value: Any) -> bool:
    """Return the persisted default scope; anything but True means all shortcuts."""
    return value is True


def default_data() -> dict[str, Any]:
    return {
        "metadata": {},
        # Name-management history is intentionally separate from editable
        # metadata. Removing or refreshing metadata must never strand a user
        # without the exact name required to restore a shortcut.
        "shortcut_names": {},
        "settings": {
            "debug_logging": False,
            "deck_compat_default": None,
            "deck_compat_default_matched_only": False,
        },
        "update_settings": {},
        "update_check_cache": {},
    }


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
    if cache is not None and cache_mtime_ns == mtime_ns:
        return copy.deepcopy(cache), cache, cache_mtime_ns
    try:
        payload = json.loads(data_file.read_text(encoding="utf-8"))
    except Exception as error:
        plog("load", "failed reading metadata settings", level=logging.ERROR, exc=True, path=data_file, error=error)
        return None
    if not isinstance(payload, dict):
        return None
    merged = default_data()
    merged["metadata"].update(payload.get("metadata") or {})
    shortcut_names = payload.get("shortcut_names")
    if isinstance(shortcut_names, dict):
        merged["shortcut_names"].update(shortcut_names)
    payload_settings = payload.get("settings")
    if isinstance(payload_settings, dict):
        merged["settings"].update(payload_settings)
    merged["update_settings"].update(payload.get("update_settings") or {})
    merged["update_check_cache"].update(payload.get("update_check_cache") or {})
    merged["settings"]["debug_logging"] = bool(merged["settings"].get("debug_logging", False))
    for key, sanitize in (
        ("deck_compat_default", compatibility_default),
        ("deck_compat_default_matched_only", compatibility_default_matched_only),
    ):
        if isinstance(payload_settings, dict) and key in payload_settings:
            merged["settings"][key] = sanitize(merged["settings"].get(key))
        else:
            # Missing means Automatic/all shortcuts, but do not rewrite legacy
            # settings merely because a newer key was introduced.
            merged["settings"].pop(key, None)
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
