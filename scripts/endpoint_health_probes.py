"""Live fixtures for the external response contracts consumed by Decky-Metadata."""
from __future__ import annotations

import hashlib
import json
import re
import urllib.parse
from types import SimpleNamespace
from typing import Any

from backend.providers import community, delisted, ign
from backend.updater.discovery import prevalidate_release_candidate, validate_release_candidate
from backend.updater.models import JsonResponse, parse_plugin_version
from scripts import check_ign_trailers
from scripts.endpoint_health import Client, ContractError, MAX_RESPONSE_BYTES, Probe, require
from scripts.endpoint_trailer_manifests import hls_tracks, validate_dash, validate_hls_media

# Use known games so missing data is easy to detect.
HADES_APP_ID = 1145360
STORE_BASE = "https://store.steampowered.com"
GITHUB_BASE = "repos/beallio/Decky-Metadata"


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def https_url(value: Any) -> bool:
    return nonempty(value) and urllib.parse.urlsplit(value).scheme == "https" and bool(urllib.parse.urlsplit(value).hostname)


def graphql(client: Client, query: str, variables: dict[str, Any]) -> dict[str, Any]:
    payload = client.json(ign.IGN_GRAPHQL_URL, method="POST", body={"query": query, "variables": variables},
                          headers={"Accept": "application/json", "Origin": ign.IGN_BASE_URL,
                                   "Referer": f"{ign.IGN_BASE_URL}/"}, max_bytes=ign.IGN_GRAPHQL_MAX_BYTES)
    require(isinstance(payload, dict) and not payload.get("errors"), "IGN GraphQL returned errors or a non-object response")
    return payload


def ign_search(client: Client) -> None:
    results = ign.search_metadata("Bloodborne", 8, lambda query, variables: graphql(client, query, variables))
    require(any(row.get("slug") == "bloodborne" and row.get("title") == "Bloodborne" for row in results),
            "data.searchObjectsByName.edges has no usable Bloodborne match")


def ign_metadata(client: Client) -> None:
    # Check what the plugin's parser produces, not just the raw response.
    metadata = ign.fetch_metadata("hades", lambda query, variables: graphql(client, query, variables), ign.game_to_metadata)
    require(isinstance(metadata, dict), "data.objectSelectByTypeAndSlug is not a game object")
    require(metadata.get("title") == "Hades", "IGN Hades metadata has no matching title")
    require(nonempty(metadata.get("description")) or nonempty(metadata.get("short_description")),
            "IGN Hades metadata has no usable description")
    for key in ("developers", "publishers"):
        require(isinstance(metadata.get(key), list) and any(nonempty(row.get("name")) for row in metadata[key]),
                f"IGN Hades metadata has no usable {key}")
    require(isinstance(metadata.get("screenshots"), list)
            and any(https_url(row.get("url")) for row in metadata["screenshots"]),
            "IGN Hades metadata has no usable screenshots")


def ign_trailers(client: Client) -> None:
    try:
        check_ign_trailers.check_sources(
            lambda query, variables: graphql(client, query, variables),
            lambda url, **kwargs: client.text(url, allowed_url=ign.is_ign_page_url, **kwargs),
            client.mp4,
        )
    except check_ign_trailers.ProbeFailure as error:
        raise ContractError(str(error)) from error


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


def steam_community(client: Client) -> None:
    items = community.fetch_steam_fallback_items(570, 1, client.text)
    require(bool(items), "Steam Community homecontent no longer yields usable screenshot cards")
    require(all(nonempty(row.get("id")) and https_url(row.get("image_url")) and https_url(row.get("link"))
                for row in items), "Steam Community parsed cards lack id/image_url/link")


def steam_tracker(client: Client) -> None:
    text = client.text(delisted.STEAM_TRACKER_DELISTED_URL, timeout=30, max_bytes=delisted.DELISTED_INDEX_MAX_BYTES)
    rows = delisted.parse_delisted_html(text)
    require(len(rows) >= 100, "Steam Tracker delisted parser returned fewer than the required 100 games")
    require(any(appid == 43110 and nonempty(name) for appid, name in rows),
            "Steam Tracker delisted index has no usable Metro 2033 fixture")


def latest_stable(client: Client) -> dict[str, Any]:
    releases = client.github_json(f"{GITHUB_BASE}/releases")
    require(isinstance(releases, list), "GitHub releases response is not an array")
    # Check the newest stable release, not the rolling development build.
    stable = []
    for release in releases:
        if not isinstance(release, dict) or release.get("draft") or release.get("prerelease"):
            continue
        tag = release.get("tag_name")
        version = parse_plugin_version(tag[1:]) if isinstance(tag, str) and tag.startswith("v") else None
        if version and not version.is_dev:
            stable.append((version, release))
    require(bool(stable), "GitHub releases has no published stable semver release")
    return max(stable, key=lambda item: item[0])[1]


def github_releases(client: Client) -> None:
    release = latest_stable(client)
    require(prevalidate_release_candidate(release) is not None, "Latest stable release lacks one updater manifest and one ZIP")
    tag = release["tag_name"]
    tagged = client.github_json(f"{GITHUB_BASE}/releases/tags/{urllib.parse.quote(tag, safe='')}")
    require(isinstance(tagged, dict) and tagged.get("tag_name") == tag
            and prevalidate_release_candidate(tagged) is not None, "GitHub tagged release does not satisfy updater discovery")


def download_asset(client: Client, asset: dict[str, Any]) -> bytes:
    require(type(asset.get("id")) is int and type(asset.get("size")) is int and 0 < asset["size"] <= MAX_RESPONSE_BYTES,
            "GitHub release asset has no valid bounded id/size")
    return client.github_bytes(f"{GITHUB_BASE}/releases/assets/{asset['id']}", accept="application/octet-stream")


def github_release_assets(client: Client) -> None:
    release = latest_stable(client)
    pre = prevalidate_release_candidate(release)
    require(pre is not None, "Latest stable release lacks updater assets")
    manifest_bytes = download_asset(client, dict(pre.manifest_asset))
    try:
        manifest = json.loads(manifest_bytes)
    except (ValueError, UnicodeError) as error:
        raise ContractError("GitHub updater manifest is not valid JSON") from error
    # Use the updater's own rules to check the downloaded manifest.
    candidate = validate_release_candidate(release, SimpleNamespace(get_manifest=lambda _url: JsonResponse(200, {}, manifest)))
    require(candidate is not None, "GitHub updater manifest identity/version/tag/channel/asset/SHA contract is invalid")
    archive = download_asset(client, dict(pre.zip_asset))
    require(archive.startswith(b"PK\x03\x04"), "GitHub updater asset is not a ZIP file")
    # A working download must also match the manifest's checksum.
    require(hashlib.sha256(archive).hexdigest() == candidate.sha256.lower(),
            "GitHub updater ZIP SHA-256 does not match the manifest")


PROBES = (
    Probe("ign-search", "IGN game search", "Bloodborne", ign_search),
    Probe("ign-metadata", "IGN game metadata", "Hades", ign_metadata),
    Probe("ign-trailers", "IGN trailer discovery and MP4 delivery", "Deadpool and Bloodborne", ign_trailers),
    Probe("steam-search", "Steam Store search", "Hades (1145360)", steam_search),
    Probe("steam-appdetails", "Steam game metadata", "Hades (1145360)", steam_metadata),
    Probe("steam-trailers", "Steam trailer lookup and delivery", "Hades (1145360)", steam_trailers),
    Probe("steam-news", "Steam News", "Hades (1145360)", steam_news),
    Probe("steam-events", "Steam partner events", "Hades (1145360)", steam_events),
    Probe("steam-deck-compatibility", "Steam Deck compatibility", "Hades (1145360)", steam_deck_compatibility),
    Probe("protondb-summary", "ProtonDB rating summaries", "Hades (1145360)", protondb_summary),
    Probe("protondb-algolia", "ProtonDB Algolia title search", "TRANSFORMERS: Devastation", protondb_algolia),
    Probe("steam-community", "Steam Community screenshot cards", "Dota 2 (570), page 1", steam_community),
    Probe("steam-tracker", "Steam Tracker delisted index", "At least 100 games, including Metro 2033 (43110)", steam_tracker),
    Probe("github-releases", "GitHub updater release discovery", "Latest published stable release", github_releases),
    Probe("github-release-assets", "GitHub updater manifest and ZIP delivery", "Latest published stable release", github_release_assets),
)
