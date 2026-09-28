#!/usr/bin/env python3
"""Check that IGN game lookup, trailer selection, and direct MP4 delivery still work."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable

if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.providers import ign


PROBE_GAMES = (
    ("Deadpool", "https://www.ign.com/games/deadpool"),
    ("Bloodborne", None),
)
USER_AGENT = "DeckyMetadata/0.1 (+Decky Loader)"


class ProbeFailure(RuntimeError):
    pass


class _RestrictedRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, allowed: Callable[[str], bool]):
        self.allowed = allowed

    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        if not self.allowed(new_url):
            raise ProbeFailure("IGN response redirected to an unexpected host")
        return super().redirect_request(request, file_pointer, code, message, headers, new_url)


_PAGE_OPENER = urllib.request.build_opener(_RestrictedRedirect(ign.is_ign_page_url))
_GRAPHQL_OPENER = urllib.request.build_opener(
    _RestrictedRedirect(lambda url: url == ign.IGN_GRAPHQL_URL)
)
_MEDIA_OPENER = urllib.request.build_opener(
    _RestrictedRedirect(lambda url: bool(ign._canonical_mp4_url(url)))
)


def fetch_graphql(query: str, variables: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        ign.IGN_GRAPHQL_URL,
        data=json.dumps({"query": query, "variables": variables}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Origin": ign.IGN_BASE_URL,
            "Referer": f"{ign.IGN_BASE_URL}/",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    with _GRAPHQL_OPENER.open(request, timeout=15) as response:
        maximum = ign.IGN_GRAPHQL_MAX_BYTES
        length = response.headers.get("Content-Length")
        if length is not None and (not length.isdecimal() or int(length) > maximum):
            raise ProbeFailure("IGN game search response is too large")
        payload = response.read(maximum + 1)
        if len(payload) > maximum:
            raise ProbeFailure("IGN game search response is too large")
    result = json.loads(payload)
    if not isinstance(result, dict) or result.get("errors"):
        raise ProbeFailure("IGN game search returned errors")
    return result


def fetch_html(url: str, *, timeout: int, max_bytes: int) -> str:
    if not ign.is_ign_page_url(url):
        raise ProbeFailure("IGN trailer page has an invalid origin")
    maximum = min(max_bytes, ign.TRAILER_HTML_MAX_BYTES)
    request = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9"}
    )
    with _PAGE_OPENER.open(request, timeout=min(timeout, 12)) as response:
        length = response.headers.get("Content-Length")
        if length is not None and (not length.isdecimal() or int(length) > maximum):
            raise ProbeFailure("IGN trailer page is too large")
        payload = response.read(maximum + 1)
        if len(payload) > maximum:
            raise ProbeFailure("IGN trailer page is too large")
    return payload.decode("utf-8", errors="replace")


def probe_mp4(url: str, *, open_url: Callable[..., Any] | None = None) -> None:
    if not ign._canonical_mp4_url(url):
        raise ProbeFailure("IGN trailer MP4 has an invalid URL")
    request = urllib.request.Request(
        url,
        headers={
            "Range": "bytes=0-31",
            "Origin": "https://steamloopback.host",
            "User-Agent": USER_AGENT,
        },
    )
    fetch = open_url or _MEDIA_OPENER.open
    with fetch(request, timeout=12) as response:
        content_type = str(response.headers.get("Content-Type") or "").split(";", 1)[0].casefold()
        if response.status not in (200, 206) or content_type != "video/mp4":
            raise ProbeFailure("IGN trailer MP4 response is not video")
        header = response.read(32)
        if len(header) < 12 or header[4:8] != b"ftyp":
            raise ProbeFailure("IGN trailer MP4 header is invalid")


def check_sources(
    graphql: ign.GraphqlFn,
    fetch_page: ign.TrailerHtmlFetchFn,
    inspect_media: Callable[[str], None],
) -> list[str]:
    checked: list[str] = []
    for title, game_url in PROBE_GAMES:
        result = ign.find_trailer(title, game_url, graphql, fetch_page)
        if not result:
            raise ProbeFailure(f"{title}: no verified IGN game trailer was found")
        # The 720p file matches a Deck-sized display; try other qualities if it is down.
        candidates = sorted(result["candidates"], key=lambda item: abs(item["height"] - 720))[:4]
        last_error = "none"
        for candidate in candidates:
            try:
                inspect_media(candidate["url"])
            except Exception as error:
                last_error = f"HTTP {error.code}" if isinstance(error, urllib.error.HTTPError) else type(error).__name__
                continue
            checked.append(f"{title}: {result['name']} ({candidate['height']}p MP4)")
            break
        else:
            raise ProbeFailure(f"{title}: no accessible IGN MP4 ({len(candidates)} qualities; last error: {last_error})")
    return checked


def main() -> int:
    try:
        results = check_sources(fetch_graphql, fetch_html, probe_mp4)
    except ProbeFailure as error:
        print(f"IGN trailer capability check failed: {error}", file=sys.stderr)
        return 1
    for result in results:
        print(f"OK: {result}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
