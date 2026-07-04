from __future__ import annotations

import copy
import json
import logging
from pathlib import Path
from typing import Any, Callable

PlogFn = Callable[..., None]


def default_data() -> dict[str, Any]:
    return {
        "metadata": {},
        "settings": {
            "debug_logging": False,
        },
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
    merged["settings"].update(payload.get("settings") or {})
    merged["settings"]["debug_logging"] = bool(merged["settings"].get("debug_logging", False))
    return merged, copy.deepcopy(merged), mtime_ns


def save_data(data_file: Path, data: dict[str, Any]) -> tuple[dict[str, Any], int]:
    data_file.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return copy.deepcopy(data), data_file.stat().st_mtime_ns
