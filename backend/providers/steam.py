from __future__ import annotations

import difflib
import html
import json
import logging
import re
import time
import urllib.parse
from typing import Any, Callable

import decky

from backend import matching

HttpJsonFn = Callable[..., Any]
HttpTextFn = Callable[..., str]
PlogFn = Callable[..., None]

STEAM_STORE_SEARCH_URL = "https://store.steampowered.com/api/storesearch/"
STEAM_APP_DETAILS_URL = "https://store.steampowered.com/api/appdetails"
STEAM_NEWS_URL = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/"
STEAM_EVENTS_URL = "https://store.steampowered.com/events/ajaxgetpartnereventspageable/"
STEAM_DECK_COMPAT_URL = "https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport"
STEAM_STORE_APP_URL = "https://store.steampowered.com/app/{appid}/"
STEAM_ACTIVITY_EVENT_TYPES = {12, 13, 14, 15, 23, 24, 25, 28, 35}


def steam_event_json(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not value.strip():
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def steam_localized_value(value: Any) -> str:
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


def steam_event_clan_id(event: dict[str, Any]) -> str:
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


def steam_partner_asset_url(raw: str, clan_id: str = "") -> str:
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
        return matching.https_url(value)
    # Steam partner-event JSON often stores only the asset filename in
    # localized_*_image fields. Rebuild the CDN URL from the announcement clan id.
    if clan_id and re.search(r"\.(?:jpg|jpeg|png|webp|gif|avif)(?:[?#].*)?$", value, re.I):
        return f"https://clan.cloudflare.steamstatic.com/images/{clan_id}/{value.lstrip('/')}"
    return ""


def steam_news_image_candidates(contents: str, steam_appid: int = 0) -> list[str]:
    text = urllib.parse.unquote(html.unescape(str(contents or ""))).replace("\\/", "/")
    if not text:
        return []

    candidates: list[tuple[int, int, str]] = []

    def add(raw: str, position: int = 0, context: str = "", base_score: int = 0) -> None:
        url = steam_partner_asset_url(str(raw or "")) or matching.https_url(str(raw or "").strip())
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


def steam_partner_event_images(event: dict[str, Any], steam_appid: int) -> list[str]:
    jsondata = steam_event_json(event.get("jsondata"))
    clan_id = steam_event_clan_id(event)
    announcement = event.get("announcement_body") if isinstance(event.get("announcement_body"), dict) else {}
    body = str((announcement or {}).get("body") or event.get("event_notes") or "")

    images: list[str] = []
    seen: set[str] = set()

    def add(raw: Any) -> None:
        raw_value = steam_localized_value(raw)
        if not raw_value:
            return
        # raw_value can be a complete body fragment, a Steam clan placeholder,
        # or a bare asset filename from localized_*_image.
        expanded = steam_news_image_candidates(str(raw_value), steam_appid)
        if not expanded:
            direct = steam_partner_asset_url(str(raw_value), clan_id) or matching.https_url(str(raw_value).strip())
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


def clean_steam_news_text(value: str) -> str:
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
    text = matching.clean_html_text(text)
    return re.sub(r"\s+", " ", text).strip()


def steam_news_raw_body(value: str) -> str:
    text = urllib.parse.unquote(html.unescape(str(value or ""))).replace("\\/", "/").strip()
    # Steam's native event renderer understands Steam BBCode. Keep links,
    # images and previewyoutube blocks intact for the detail viewer, but
    # normalize paragraph-only noise and clamp to a sane size so metadata
    # files cannot grow without bound.
    text = re.sub(r"\s+", " ", text) if len(text) < 4000 else text
    return text[:16000].strip()


def steam_news_summary(contents: str) -> str:
    return clean_steam_news_text(contents)[:600]


def steam_announcement_page_image(url: str, http_text: HttpTextFn) -> str:
    url = matching.https_url(str(url or ""))
    if not url:
        return ""
    try:
        text = http_text(url, timeout=7)
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
        image = matching.https_url(raw)
        if image:
            return image
    return ""


def steam_deck_compat_for_appid(steam_appid: int, http_json: HttpJsonFn, plog: PlogFn) -> int | None:
    try:
        appid = int(steam_appid)
    except Exception:
        return None
    if appid <= 0:
        return None

    params = urllib.parse.urlencode({"nAppID": appid, "l": "english"})
    try:
        payload = http_json(f"{STEAM_DECK_COMPAT_URL}?{params}", timeout=12)
        if not isinstance(payload, dict):
            raise ValueError("unexpected deck compatibility payload")
        results = payload.get("results")
        if not isinstance(results, dict):
            raise ValueError("missing deck compatibility results")
        category = int(results.get("resolved_category"))
    except Exception:
        plog(
            "steam",
            "deck compat fetch failed",
            level=logging.WARNING,
            exc=True,
            steam_appid=appid,
        )
        return None

    if category not in {0, 1, 2, 3}:
        return None
    plog(
        "steam",
        "deck compat resolved",
        level=logging.DEBUG,
        steam_appid=appid,
        category=category,
    )
    return category


def steam_appdetails_for_appid(steam_appid: int, http_json: HttpJsonFn, plog: PlogFn) -> dict[str, Any] | None:
    try:
        appid = int(steam_appid)
    except Exception:
        return None
    if appid <= 0:
        return None

    try:
        params = urllib.parse.urlencode({"appids": appid, "l": "english"})
        payload = http_json(f"{STEAM_APP_DETAILS_URL}?{params}", timeout=12)
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

        description = matching.clean_html_text(
            str(
                data.get("detailed_description")
                or data.get("about_the_game")
                or data.get("short_description")
                or ""
            )
        )
        if description:
            details["description"] = description

        short_description = matching.clean_html_text(
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
            release_epoch = matching.date_to_epoch(release_date.get("date"))
            if release_epoch > 0:
                details["release_date"] = release_epoch

        metacritic = data.get("metacritic") or {}
        if isinstance(metacritic, dict):
            rating = matching.rating_to_percent(metacritic.get("score"))
            if rating is not None:
                details["rating"] = rating

        store_categories = [
            category_id
            for category_id in (
                matching.safe_int(category.get("id"))
                for category in (data.get("categories") or [])
                if isinstance(category, dict)
            )
            if category_id
        ]
        if store_categories:
            details["store_categories"] = store_categories

        steam_dlc_appids: list[int] = []
        raw_dlc_appids = data.get("dlc")
        if isinstance(raw_dlc_appids, list):
            for value in raw_dlc_appids:
                if isinstance(value, bool):
                    continue
                dlc_appid = matching.safe_int(value)
                if dlc_appid and dlc_appid > 0 and dlc_appid not in steam_dlc_appids:
                    steam_dlc_appids.append(dlc_appid)
        details["steam_dlc_appids"] = steam_dlc_appids
        details["has_points_shop"] = 29 in store_categories

        details["screenshots"] = [
            {
                "id": screenshot.get("id"),
                "url": screenshot.get("path_full"),
                "thumbnail": screenshot.get("path_thumbnail"),
            }
            for screenshot in (data.get("screenshots") or [])
            if isinstance(screenshot, dict) and screenshot.get("path_full")
        ]

        plog(
            "steam",
            "appdetails resolved",
            level=logging.DEBUG,
            steam_appid=appid,
            name=title,
        )
        return details
    except Exception:
        plog(
            "steam",
            "appdetails fetch failed",
            level=logging.WARNING,
            exc=True,
            steam_appid=appid,
        )
        return None


def steam_partner_events_for_appid(
    steam_appid: int, limit: int, http_json: HttpJsonFn, plog: PlogFn
) -> list[dict[str, Any]]:
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
        payload = http_json(f"{STEAM_EVENTS_URL}?{params}", timeout=12)
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
        event_type = int(matching.as_number(event.get("event_type") or event.get("type"), 0))
        if event_type not in STEAM_ACTIVITY_EVENT_TYPES:
            continue
        announcement = event.get("announcement_body") if isinstance(event.get("announcement_body"), dict) else {}
        event_gid = str(event.get("gid") or "").strip()
        announcement_gid = str((announcement or {}).get("gid") or "").strip()
        gid = event_gid or announcement_gid
        title_text = matching.clean_html_text(str((announcement or {}).get("headline") or event.get("event_name") or ""))
        if not gid or not title_text:
            continue
        body = str((announcement or {}).get("body") or event.get("event_notes") or "")
        date = int(matching.as_number((announcement or {}).get("posttime") or event.get("rtime32_start_time") or event.get("rtime_created"), 0))
        url = (
            f"https://steamcommunity.com/games/{int(steam_appid)}/announcements/detail/{announcement_gid}"
            if announcement_gid
            else f"https://store.steampowered.com/news/app/{int(steam_appid)}/view/{event_gid}"
        )
        image_sources = steam_partner_event_images(event, int(steam_appid))
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
                "url": matching.https_url(url),
                "summary": steam_news_summary(body or title_text),
                "body": clean_steam_news_text(body)[:4000],
                "raw_body": body,
                "image": image_sources[0] if image_sources else "",
                "image_sources": image_sources,
                "author": "Steam",
                "feedLabel": matching.clean_html_text(str(event.get("event_type_name") or "Steam")),
                "date": date,
            }
        )
        if len(rows) >= max(1, min(int(limit or 10), 12)):
            break
    return rows


def resolve_steam_appid_for_title(
    title: str,
    metadata: dict[str, Any] | None,
    http_json: HttpJsonFn,
) -> tuple[int | None, str]:
    metadata = metadata or {}
    for value in (metadata.get("source_url"), metadata.get("id")):
        match = re.search(r"store\.steampowered\.com/app/(\d+)", str(value or ""), re.I)
        if match:
            appid = matching.safe_int(match.group(1))
            if appid:
                return appid, STEAM_STORE_APP_URL.format(appid=appid)
    clean_title = matching.clean_game_title(title)
    if not clean_title:
        return None, ""
    try:
        params = urllib.parse.urlencode({"term": clean_title, "cc": "US", "l": "english"})
        url = f"{STEAM_STORE_SEARCH_URL}?{params}"
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                payload = http_json(url, timeout=12)
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
    normalised_query = matching.normalise_match_title(clean_title)
    best: tuple[int, int, str, str] | None = None
    for index, item in enumerate(items[:12]):
        if not isinstance(item, dict):
            continue
        appid = matching.safe_int(item.get("id") or item.get("appid"))
        name = matching.clean_game_title(str(item.get("name") or ""))
        if not appid or not name:
            continue
        score = 0
        normalised_name = matching.normalise_match_title(name)
        if not normalised_name or not matching.distinctive_tokens_present(normalised_query, normalised_name):
            continue
        if normalised_name == normalised_query:
            score += 1000
        else:
            ratio = difflib.SequenceMatcher(None, normalised_query, normalised_name).ratio()
            if ratio < 0.72:
                continue
            score += int(ratio * 500)
        if matching.is_non_primary_steam_title(name):
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
