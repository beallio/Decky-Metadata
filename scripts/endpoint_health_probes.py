"""Live fixtures for the external response contracts consumed by Decky-Metadata."""
from __future__ import annotations

import re
import urllib.parse
from typing import Any

from scripts.endpoint_health import Client, ContractError, Probe, require
from scripts.endpoint_trailer_manifests import hls_tracks, validate_dash, validate_hls_media

# Use known games so missing data is easy to detect.
HADES_APP_ID = 1145360
STORE_BASE = "https://store.steampowered.com"


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def https_url(value: Any) -> bool:
    return nonempty(value) and urllib.parse.urlsplit(value).scheme == "https" and bool(urllib.parse.urlsplit(value).hostname)



def steam_search(client: Client) -> None:
    params = urllib.parse.urlencode({"term": "Hades", "cc": "US", "l": "english"})
    payload = client.json(f"{STORE_BASE}/api/storesearch/?{params}")
    require(isinstance(payload, dict) and isinstance(payload.get("items"), list), "Steam Store search items is not an array")
    require(any(isinstance(row, dict) and row.get("id") == HADES_APP_ID and row.get("name") == "Hades"
                and row.get("type") == "app" for row in payload["items"]), "Steam Store search has no usable Hades app match")


def appdetails(client: Client, *, movies: bool = False) -> dict[str, Any]:
    params = {"appids": HADES_APP_ID, "filters": "movies"} if movies else {"appids": HADES_APP_ID, "l": "english"}
    payload = client.json(f"{STORE_BASE}/api/appdetails?{urllib.parse.urlencode(params)}")
    row = payload.get(str(HADES_APP_ID)) if isinstance(payload, dict) else None
    require(isinstance(row, dict) and row.get("success") is True and isinstance(row.get("data"), dict),
            "Steam appdetails Hades success/data contract is missing")
    return row["data"]


def steam_metadata(client: Client) -> None:
    data = appdetails(client)
    require(data.get("name") == "Hades", "Steam appdetails has no matching Hades name")
    require(any(nonempty(data.get(key)) for key in ("detailed_description", "about_the_game", "short_description")),
            "Steam appdetails has no usable description")
    for key in ("developers", "publishers"):
        require(isinstance(data.get(key), list) and any(nonempty(name) for name in data[key]),
                f"Steam appdetails has no usable {key}")
    require(isinstance(data.get("screenshots"), list)
            and any(isinstance(row, dict) and https_url(row.get("path_full")) for row in data["screenshots"]),
            "Steam appdetails has no usable screenshot path_full")


def steam_trailers(client: Client) -> None:
    data = appdetails(client, movies=True)
    movies = data.get("movies")
    require(isinstance(movies, list) and bool(movies), "Steam appdetails movies is not a populated array")
    movie = next((row for row in movies if isinstance(row, dict) and row.get("highlight")), movies[0])
    require(isinstance(movie, dict) and movie.get("id") is not None, "Selected Steam movie has no id")
    candidates: list[tuple[str, str]] = []
    for key in ("hls_h264", "dash_h264", "dash_av1"):
        if https_url(movie.get(key)):
            candidates.append((key, movie[key]))
    for key in ("mp4", "webm"):
        formats = movie.get(key)
        if isinstance(formats, dict):
            candidates.extend((key, url) for url in formats.values() if https_url(url))
    require(bool(candidates), "Selected Steam movie has no supported HTTPS media URL")
    last_error = "none"
    # One broken video format is acceptable if another format works.
    for kind, url in candidates:
        try:
            if kind == "hls_h264":
                for track_url in hls_tracks(client.text(url), url):
                    validate_hls_media(client.text(track_url), track_url)
            elif kind.startswith("dash"):
                validate_dash(client.text(url), url)
            else:
                response = client.fetch(url, headers={"Range": "bytes=0-31"}, prefix=True, max_bytes=32)
                require(response.content_type in ("video/mp4", "video/webm"), "Steam trailer response is not video")
                require((kind == "mp4" and response.body[4:8] == b"ftyp") or
                        (kind == "webm" and response.body.startswith(b"\x1aE\xdf\xa3")),
                        "Steam trailer media header is invalid")
            return
        except ContractError as error:
            last_error = str(error)
    raise ContractError(f"No usable Steam trailer manifest/media response: {last_error}")


def steam_news(client: Client) -> None:
    languages = ("", "_koreana", "_japanese", "_schinese", "_tchinese", "_french", "_german",
                 "_spanish", "_italian", "_polish", "_portuguese", "_russian")
    params = urllib.parse.urlencode({"appid": HADES_APP_ID, "count": 6, "maxlength": 600, "format": "json",
                                    "feeds": ",".join("steam_community_announcements" + language for language in languages)})
    payload = client.json(f"https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?{params}")
    news = payload.get("appnews") if isinstance(payload, dict) else None
    require(isinstance(news, dict) and news.get("appid") == HADES_APP_ID and isinstance(news.get("newsitems"), list),
            "Steam News appnews/appid/newsitems contract is missing")
    require(any(isinstance(row, dict) and nonempty(row.get("title")) and https_url(row.get("url"))
                for row in news["newsitems"]), "Steam News has no usable Hades announcement title/URL")


def steam_events(client: Client) -> None:
    params = urllib.parse.urlencode({"appid": HADES_APP_ID, "offset": 0, "count": 30, "l": "english", "origin": STORE_BASE})
    payload = client.json(f"{STORE_BASE}/events/ajaxgetpartnereventspageable/?{params}")
    require(isinstance(payload, dict) and isinstance(payload.get("events"), list), "Steam partner events is not an array")
    allowed = {12, 13, 14, 15, 23, 24, 25, 28, 35}
    for row in payload["events"]:
        if not isinstance(row, dict) or row.get("event_type") not in allowed:
            continue
        announcement = row.get("announcement_body")
        announcement = announcement if isinstance(announcement, dict) else {}
        if nonempty(str(row.get("gid") or announcement.get("gid") or "")) and (
            nonempty(announcement.get("headline")) or nonempty(row.get("event_name"))):
            return
    raise ContractError("Steam partner events has no usable Hades activity event (type, gid, headline)")


def steam_deck_compatibility(client: Client) -> None:
    params = urllib.parse.urlencode({"nAppID": HADES_APP_ID, "l": "english"})
    payload = client.json(f"{STORE_BASE}/saleaction/ajaxgetdeckappcompatibilityreport?{params}")
    results = payload.get("results") if isinstance(payload, dict) else None
    require(isinstance(results, dict), "Steam Deck compatibility results is not an object")
    require(type(results.get("resolved_category")) is int and results["resolved_category"] in (0, 1, 2, 3),
            "Steam Deck compatibility results.resolved_category is unavailable or invalid for Hades")


def protondb_summary(client: Client) -> None:
    payload = client.json(f"https://www.protondb.com/api/v1/reports/summaries/{HADES_APP_ID}.json")
    require(isinstance(payload, dict) and payload.get("tier") in ("platinum", "gold", "silver", "bronze", "borked"),
            "ProtonDB Hades summary has no supported rating tier")


def protondb_algolia(client: Client) -> None:
    # Public search credentials shipped by src/protondb/steamSearch.ts, not a user API key.
    payload = client.json("https://94he6yatei-dsn.algolia.net/1/indexes/steamdb/query", method="POST",
                          headers={"Content-Type": "application/x-www-form-urlencoded",
                                   "X-Algolia-Application-Id": "94HE6YATEI",
                                   "X-Algolia-API-Key": "9ba0e69fb2974316cdaec8f5f257088f",
                                   "Origin": "https://www.protondb.com", "Referer": "https://www.protondb.com/"},
                          body={"query": "TRANSFORMERS: Devastation", "facetFilters": [["appType:Game"]],
                                "restrictSearchableAttributes": ["name"], "attributesToRetrieve": ["name", "objectID"],
                                "attributesToHighlight": [], "attributesToSnippet": [], "hitsPerPage": 10})
    require(isinstance(payload, dict) and isinstance(payload.get("hits"), list), "Algolia steamdb hits is not an array")
    require(any(isinstance(row, dict) and nonempty(row.get("name")) and row["name"].casefold() == "transformers: devastation"
                and isinstance(row.get("objectID"), str) and re.fullmatch(r"[1-9]\d*", row["objectID"])
                for row in payload["hits"]), "Algolia steamdb has no usable TRANSFORMERS: Devastation name/objectID match")



NATIVE_PROBES = (
    ("ign-search", "IGN game search", "Bloodborne"),
    ("ign-metadata", "IGN game metadata", "Hades"),
    ("ign-trailers", "IGN trailer discovery and MP4 delivery", "Deadpool and Bloodborne"),
    ("steam-community", "Steam Community screenshot cards", "Dota 2 (570), page 1"),
    ("steam-tracker", "Steam Tracker delisted index", "At least 100 games, including Metro 2033 (43110)"),
    ("github-releases", "GitHub updater release discovery", "Latest published stable release"),
    ("github-release-assets", "GitHub updater manifest and ZIP delivery", "Latest published stable release"),
    ("hltb-lookup", "HowLongToBeat search and game page", "Portal 2 (Steam 620, HLTB 7231)"),
)

PROBES = (
    Probe("steam-search", "Steam Store search", "Hades (1145360)", steam_search),
    Probe("steam-appdetails", "Steam game metadata", "Hades (1145360)", steam_metadata),
    Probe("steam-trailers", "Steam trailer lookup and delivery", "Hades (1145360)", steam_trailers),
    Probe("steam-news", "Steam News", "Hades (1145360)", steam_news),
    Probe("steam-events", "Steam partner events", "Hades (1145360)", steam_events),
    Probe("steam-deck-compatibility", "Steam Deck compatibility", "Hades (1145360)", steam_deck_compatibility),
    Probe("protondb-summary", "ProtonDB rating summaries", "Hades (1145360)", protondb_summary),
    Probe("protondb-algolia", "ProtonDB Algolia title search", "TRANSFORMERS: Devastation", protondb_algolia),
)
