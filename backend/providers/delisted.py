from __future__ import annotations

import difflib
import html
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Callable

from backend import matching

PlogFn = Callable[..., None]
HttpTextFn = Callable[..., str]

STEAM_TRACKER_DELISTED_URL = "https://steam-tracker.com/apps/delisted"
DELISTED_INDEX_TTL_SECONDS = 7 * 24 * 3600
DELISTED_INDEX_MAX_BYTES = 30 * 1024 * 1024
DELISTED_INDEX_FILENAME = "delisted_index.json"


def index_path(settings_dir: Path) -> str:
    return str(Path(settings_dir) / DELISTED_INDEX_FILENAME)


def parse_delisted_html(html_text: str) -> list[list[Any]]:
    pattern = re.compile(
        r"href='https://steam-tracker\.com/app/(\d+)/'[^>]*>\s*([^<]+?)\s*</a>",
        re.I,
    )
    rows: list[list[Any]] = []
    seen: set[int] = set()
    for match in pattern.finditer(str(html_text or "")):
        appid = matching.safe_int(match.group(1))
        name = html.unescape(match.group(2)).strip()
        if not appid or not name or appid in seen:
            continue
        seen.add(appid)
        rows.append([appid, name])
    return rows


def download_delisted_index(http_text: HttpTextFn, plog: PlogFn) -> dict[str, Any] | None:
    try:
        text = http_text(STEAM_TRACKER_DELISTED_URL, timeout=30)
        if len(text.encode("utf-8", errors="ignore")) > DELISTED_INDEX_MAX_BYTES:
            plog(
                "steam",
                "delisted index download exceeded size cap",
                level=logging.WARNING,
                bytes=len(text),
                max_bytes=DELISTED_INDEX_MAX_BYTES,
            )
            return None
        apps = parse_delisted_html(text)
        if len(apps) < 100:
            plog(
                "steam",
                "delisted index parse returned implausible count",
                level=logging.WARNING,
                count=len(apps),
            )
            return None
        return {
            "fetched_at": int(time.time()),
            "source": STEAM_TRACKER_DELISTED_URL,
            "apps": apps,
        }
    except Exception as error:
        plog("steam", "failed to download delisted index", level=logging.WARNING, error=error)
        return None


def save_delisted_index(path: str, index: dict[str, Any], plog: PlogFn) -> None:
    target = Path(path)
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        temp_path = target.with_name(f"{target.name}.tmp")
        temp_path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temp_path, target)
    except Exception as error:
        plog("steam", "failed to save delisted index", level=logging.WARNING, path=target, error=error)


def load_delisted_index(path: str) -> dict[str, Any] | None:
    target = Path(path)
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
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
        appid = matching.safe_int(row[0])
        name = matching.clean_game_title(str(row[1] or ""))
        if appid and name:
            cleaned_apps.append([appid, name])
    if not cleaned_apps:
        return None
    return {
        "fetched_at": matching.safe_int(payload.get("fetched_at")) or 0,
        "source": str(payload.get("source") or STEAM_TRACKER_DELISTED_URL),
        "apps": cleaned_apps,
    }


def index_is_fresh(index: dict[str, Any] | None) -> bool:
    if not isinstance(index, dict):
        return False
    fetched_at = matching.safe_int(index.get("fetched_at")) or 0
    return bool(fetched_at and int(time.time()) - fetched_at < DELISTED_INDEX_TTL_SECONDS)


def ensure_delisted_index(
    memory_index: dict[str, Any] | None,
    path: str,
    force: bool,
    http_text: HttpTextFn,
    plog: PlogFn,
) -> dict[str, Any] | None:
    if isinstance(memory_index, dict) and not force and index_is_fresh(memory_index):
        return memory_index

    disk_index = load_delisted_index(path)
    if isinstance(disk_index, dict) and not force and index_is_fresh(disk_index):
        return disk_index

    downloaded = download_delisted_index(http_text, plog)
    if isinstance(downloaded, dict):
        save_delisted_index(path, downloaded, plog)
        return downloaded

    fallback = disk_index if isinstance(disk_index, dict) else memory_index
    if isinstance(fallback, dict):
        return fallback
    return None


def resolve_delisted_appid_for_title(title: str, apps: list[Any] | None) -> int:
    if not isinstance(apps, list) or not apps:
        return 0
    clean = matching.clean_game_title(title)
    if not clean:
        return 0
    query = matching.normalise_match_title(clean)
    if not query:
        return 0
    best: tuple[int, int, str] | None = None
    query_numbers = set(re.findall(r"\d+", query))
    for row in apps:
        if not isinstance(row, (list, tuple)) or len(row) < 2:
            continue
        appid = matching.safe_int(row[0])
        name = matching.clean_game_title(str(row[1] or ""))
        if not appid or not name:
            continue
        candidate = matching.normalise_match_title(name)
        if not candidate or not matching.distinctive_tokens_present(query, candidate):
            continue
        if candidate == query:
            score = 1000
        else:
            ratio = difflib.SequenceMatcher(None, query, candidate).ratio()
            if ratio < 0.72:
                continue
            score = int(ratio * 500)
        if matching.is_non_primary_steam_title(name):
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
