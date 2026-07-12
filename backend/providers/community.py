from __future__ import annotations

import html
import re
import urllib.parse
from typing import Any, Callable

from backend import matching


MAX_PAGE = 100
PAGE_SIZE = 20
MAX_RESPONSE_BYTES = 4 * 1024 * 1024
HttpTextFn = Callable[..., str]


def clamp_page(value: Any) -> int:
    try:
        page = int(value)
    except (TypeError, ValueError):
        page = 1
    return max(1, min(page, MAX_PAGE))


def community_url(appid: Any, page: Any = 1) -> str:
    try:
        clean_appid = int(appid)
    except (TypeError, ValueError):
        return ""
    if clean_appid <= 0:
        return ""
    clean_page = clamp_page(page)
    params = {
        "userreviewsoffset": 0,
        "p": clean_page,
        "workshopitemspage": clean_page,
        "readytouseitemspage": clean_page,
        "mtxitemspage": clean_page,
        "itemspage": clean_page,
        "screenshotspage": clean_page,
        "videospage": clean_page,
        "artpage": clean_page,
        "allguidepage": clean_page,
        "webguidepage": clean_page,
        "integratedguidepage": clean_page,
        "discussionspage": clean_page,
        "numperpage": PAGE_SIZE,
        "browsefilter": "trend",
        "appHubSubSection": 1,
        "l": "english",
        "filterLanguage": "default",
        "searchText": "",
        "forceanon": 1,
    }
    return f"https://steamcommunity.com/app/{clean_appid}/homecontent/?{urllib.parse.urlencode(params)}"


def steam_image_url(value: Any) -> str:
    raw = html.unescape(str(value or "").strip())
    if not raw.lower().startswith("https://"):
        return ""
    url = matching.https_url(raw)
    parsed = urllib.parse.urlsplit(url)
    if parsed.hostname != "images.steamusercontent.com" or not parsed.path.startswith(
        "/ugc/"
    ):
        return ""
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    resized = [(key, "512" if key == "imw" else raw) for key, raw in query]
    if not any(key == "imw" for key, _ in query):
        resized.append(("imw", "512"))
    return urllib.parse.urlunsplit(
        parsed._replace(query=urllib.parse.urlencode(resized))
    )


def sharedfile_id(value: Any) -> str:
    parsed = urllib.parse.urlsplit(str(value or ""))
    if parsed.scheme != "https" or parsed.hostname != "steamcommunity.com":
        return ""
    if parsed.path.rstrip("/") != "/sharedfiles/filedetails":
        return ""
    values = urllib.parse.parse_qs(parsed.query).get("id") or []
    return values[0] if values and values[0].isdigit() else ""


def sharedfile_url(value: Any) -> str:
    raw = html.unescape(str(value or "").strip())
    if not raw:
        return ""
    url = matching.https_url(urllib.parse.urljoin("https://steamcommunity.com/", raw))
    return url if sharedfile_id(url) else ""


def parse_cards(html_text: Any, limit: int = PAGE_SIZE) -> list[dict[str, Any]]:
    text = str(html_text or "")
    matches = list(
        re.finditer(
            r"""class\s*=\s*["'][^"']*\bapphub_Card\b[^"']*["']""", text, flags=re.I
        )
    )
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    cap = max(1, min(int(limit or PAGE_SIZE), PAGE_SIZE))
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[match.start() : end][:50000]
        image_url = ""
        for raw_image in re.findall(
            r"""https://images\.steamusercontent\.com/ugc/[^"'\s<>]+""",
            block,
            flags=re.I,
        ):
            image_url = steam_image_url(raw_image.rstrip("),.;"))
            if image_url:
                break
        if not image_url or image_url in seen:
            continue
        link = ""
        for pattern in (
            r"""data-modal-content-url\s*=\s*["']([^"']+)["']""",
            r"""href\s*=\s*["']([^"']*sharedfiles/filedetails/\?id=\d+[^"']*)["']""",
        ):
            for raw_link in re.findall(pattern, block, flags=re.I):
                link = sharedfile_url(raw_link)
                if link:
                    break
            if link:
                break
        if not link:
            continue
        author_match = re.search(
            r"""apphub_CardContentAuthorName[^>]*>\s*<a[^>]*>([^<]+)</a>""",
            block,
            flags=re.I | re.S,
        )
        caption_match = re.search(
            r"""apphub_(?:CardContentTitle|CardTextContent)[^>]*>(.*?)</(?:div|a|span)>""",
            block,
            flags=re.I | re.S,
        )
        author = (
            matching.clean_html_text(html.unescape(author_match.group(1)))
            if author_match
            else ""
        )
        caption = (
            matching.clean_html_text(html.unescape(caption_match.group(1)))
            if caption_match
            else ""
        )
        seen.add(image_url)
        rows.append(
            {
                "id": sharedfile_id(link),
                "url": image_url,
                "caption": caption,
                "width": 0,
                "height": 0,
                "author": author,
                "link": link,
            }
        )
        if len(rows) >= cap:
            break
    return rows


def steam_cards_to_fallback_items(cards: Any) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for card in cards if isinstance(cards, list) else []:
        if not isinstance(card, dict):
            continue
        image_url = steam_image_url(card.get("url"))
        link = sharedfile_url(card.get("link"))
        item_id = sharedfile_id(link)
        if not image_url or not item_id:
            continue
        caption = matching.clean_html_text(str(card.get("caption") or ""))
        items.append(
            {
                "id": item_id,
                "title": caption,
                "description": caption,
                "image_url": image_url,
                "width": 0,
                "height": 0,
                "author": matching.clean_html_text(str(card.get("author") or "")),
            }
        )
        if len(items) >= PAGE_SIZE:
            break
    return items


def metadata_screenshots_to_fallback_items(
    screenshots: Any, page: Any = 1
) -> list[dict[str, Any]]:
    clean_page = clamp_page(page)
    start = (clean_page - 1) * PAGE_SIZE
    values = screenshots if isinstance(screenshots, list) else []
    items: list[dict[str, Any]] = []
    for offset, screenshot in enumerate(values[start : start + PAGE_SIZE]):
        if not isinstance(screenshot, dict):
            continue
        image_url = matching.https_url(str(screenshot.get("url") or ""))
        parsed_image = urllib.parse.urlsplit(image_url)
        if parsed_image.scheme.lower() != "https" or not parsed_image.hostname:
            continue
        caption = matching.clean_html_text(str(screenshot.get("caption") or ""))
        items.append(
            {
                "id": str(screenshot.get("id") or f"metadata-{start + offset}"),
                "title": caption,
                "description": caption,
                "image_url": image_url,
                "width": max(0, int(matching.as_number(screenshot.get("width"), 0))),
                "height": max(0, int(matching.as_number(screenshot.get("height"), 0))),
                "author": "",
            }
        )
    return items


def fetch_steam_fallback_items(
    appid: Any, page: Any, http_text: HttpTextFn
) -> list[dict[str, Any]]:
    url = community_url(appid, page)
    if not url:
        return []
    text = http_text(url, timeout=15, max_bytes=MAX_RESPONSE_BYTES)
    return steam_cards_to_fallback_items(parse_cards(text))
