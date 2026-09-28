from __future__ import annotations

import html
import json
import re
import urllib.parse
from html.parser import HTMLParser
from typing import Any, Callable, TypedDict

from backend import matching

GraphqlFn = Callable[[str, dict[str, Any]], dict[str, Any]]

IGN_GRAPHQL_URL = "https://mollusk.apis.ign.com/graphql"
IGN_BASE_URL = "https://www.ign.com"
IGN_GRAPHQL_MAX_BYTES = 2 * 1024 * 1024
IGN_GRAPHQL_ERROR_MAX_BYTES = 8 * 1024

STORE_CATEGORY = {
    "multiplayer": 1,
    "single_player": 2,
    "co_op": 9,
    "mmo": 20,
    "achievements": 22,
    "split_screen": 24,
    "full_controller": 28,
    "online_multiplayer": 36,
    "local_multiplayer": 37,
    "online_co_op": 38,
    "local_co_op": 392,
}


def absolute_ign_url(value: str | None) -> str:
    if not value:
        return ""
    raw = str(value)
    if raw.startswith("http"):
        return raw
    if raw.startswith("/"):
        return f"{IGN_BASE_URL}{raw}"
    return f"{IGN_BASE_URL}/games/{raw}"


def slug_from_ign_value(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if raw.startswith("http"):
        parsed = urllib.parse.urlparse(raw)
        parts = [part for part in parsed.path.split("/") if part]
        if len(parts) >= 2 and parts[0] == "games":
            return parts[1]
        return ""
    raw = raw.strip("/")
    if raw.startswith("games/"):
        return raw.split("/", 1)[1].split("/", 1)[0]
    return raw.split("/", 1)[0]


def slug_candidates(title: str) -> list[str]:
    cleaned = matching.clean_game_title(title).lower()
    replacements = {
        "&": " and ",
        "+": " plus ",
        ":": " ",
        "'": "",
        "\u2019": "",
    }
    for old, new in replacements.items():
        cleaned = cleaned.replace(old, new)
    cleaned = re.sub(r"\b(the|game of the year|goty|deluxe|ultimate|complete|edition|remastered|remaster)\b", " ", cleaned)
    words = re.findall(r"[a-z0-9]+", cleaned)
    base = "-".join(words)
    candidates = [base]
    if base.startswith("james-bond-blood-stone"):
        candidates.insert(0, "james-bond-007-blood-stone")
    if base.endswith("-game"):
        candidates.append(base[:-5])
    return [candidate for candidate in dict.fromkeys(candidates) if candidate]


def attributes_to_people(values: list[Any]) -> list[dict[str, str]]:
    people: list[dict[str, str]] = []
    for value in values:
        if not isinstance(value, dict):
            continue
        name = str(value.get("name") or "").strip()
        slug = str(value.get("slug") or "").strip()
        if name:
            people.append(
                {
                    "name": name,
                    "url": f"{IGN_BASE_URL}/games/producer/{slug}" if slug else "",
                }
            )
    return people


def attributes_to_names(values: list[Any]) -> list[str]:
    return [
        str(value.get("name") or "").strip()
        for value in values
        if isinstance(value, dict) and str(value.get("name") or "").strip()
    ]


def first_release_date(regions: list[Any]) -> int | None:
    dates: list[str] = []
    for region in regions:
        if not isinstance(region, dict):
            continue
        for release in region.get("releases") or []:
            if isinstance(release, dict) and release.get("date"):
                dates.append(str(release["date"]))
    if not dates:
        return None
    return matching.date_to_epoch(sorted(dates)[0])


def ign_platforms(game: dict[str, Any]) -> list[str]:
    platforms: list[str] = []
    for region in game.get("objectRegions") or []:
        if not isinstance(region, dict):
            continue
        for release in region.get("releases") or []:
            if not isinstance(release, dict):
                continue
            for attribute in release.get("platformAttributes") or []:
                if not isinstance(attribute, dict):
                    continue
                platform = str(attribute.get("slug") or attribute.get("name") or "")
                platform = platform.strip().lower()
                if platform and platform not in platforms:
                    platforms.append(platform)
    return platforms


def infer_store_categories(text: str) -> list[int]:
    haystack = text.casefold()
    categories: list[int] = []
    if re.search(r"\bmmo\b", haystack) or "massively multiplayer" in haystack:
        categories.append(STORE_CATEGORY["mmo"])
    if "multiplayer" in haystack or "multi-player" in haystack:
        categories.extend(
            [STORE_CATEGORY["multiplayer"], STORE_CATEGORY["online_multiplayer"]]
        )
    if "co-op" in haystack or "coop" in haystack or "cooperative" in haystack:
        categories.extend([STORE_CATEGORY["co_op"], STORE_CATEGORY["online_co_op"]])
    if "split-screen" in haystack or "split screen" in haystack:
        categories.append(STORE_CATEGORY["split_screen"])
    if "controller" in haystack or "steam deck verified" in haystack:
        categories.append(STORE_CATEGORY["full_controller"])
    if STORE_CATEGORY["multiplayer"] not in categories and STORE_CATEGORY["mmo"] not in categories:
        categories.insert(0, STORE_CATEGORY["single_player"])
    return list(dict.fromkeys(categories))


def ign_images_to_screenshots(game: dict[str, Any]) -> list[dict[str, Any]]:
    images: list[dict[str, Any]] = []
    primary_id = str((game.get("primaryImage") or {}).get("id") or "")
    edges = ((game.get("images") or {}).get("edges") or [])[:30]
    for edge in edges:
        node = (edge or {}).get("node") or {}
        if not isinstance(node, dict):
            continue
        url = str(node.get("url") or "").strip()
        if not url:
            continue
        width = int(matching.as_number(node.get("width"), 0))
        height = int(matching.as_number(node.get("height"), 0))
        if node.get("state") and str(node.get("state")).casefold() != "published":
            continue
        # Prefer actual wide screenshots over box art/covers.
        if width and height and width < height:
            continue
        if primary_id and str(node.get("id") or "") == primary_id and width <= height:
            continue
        images.append(
            {
                "id": str(node.get("id") or url),
                "url": matching.https_url(url),
                "caption": matching.clean_html_text(str(node.get("caption") or "")),
                "width": width,
                "height": height,
            }
        )
        if len(images) >= 30:
            break
    return images


def game_to_metadata(game: dict[str, Any]) -> dict[str, Any]:
    meta = game.get("metadata") or {}
    names = meta.get("names") or {}
    descriptions = meta.get("descriptions") or {}
    title = names.get("name") or names.get("short") or game.get("slug") or ""
    long_desc = matching.clean_html_text(
        descriptions.get("long") or descriptions.get("short") or ""
    )
    short_desc = matching.clean_html_text(descriptions.get("short") or long_desc)
    producers = attributes_to_people(game.get("producers") or [])
    publishers = attributes_to_people(game.get("publishers") or [])
    genres = attributes_to_names(game.get("genres") or [])
    features = attributes_to_names(game.get("features") or [])
    rating = matching.rating_to_percent((game.get("primaryReview") or {}).get("score"))
    release_date = first_release_date(game.get("objectRegions") or [])
    categories = infer_store_categories(
        " ".join([title, long_desc, " ".join(genres), " ".join(features)])
    )
    screenshots = ign_images_to_screenshots(game)
    return {
        "title": title,
        "id": game.get("id") or game.get("slug") or title,
        "source": "IGN",
        "source_url": absolute_ign_url(game.get("url") or game.get("slug")),
        "description": long_desc or short_desc,
        "short_description": short_desc or long_desc,
        "developers": producers,
        "publishers": publishers,
        "release_date": release_date,
        "rating": rating,
        "store_categories": categories,
        "genres": genres,
        "features": features,
        "screenshots": screenshots,
        "platforms": ign_platforms(game),
    }


def search_metadata(query: str, limit: int, graphql: GraphqlFn) -> list[dict[str, Any]]:
    cleaned = matching.clean_game_title(query)
    if not cleaned:
        return []
    variables = {"name": cleaned, "count": max(1, min(int(limit or 8), 12)), "type": "Game"}
    gql = """
    query SearchObjectsByName($name: String!, $count: Int!, $type: ObjectType!) {
      searchObjectsByName(name: $name, count: $count, type: $type) {
        edges {
          node {
            id
            slug
            url
            type
            metadata {
              names { name short }
              descriptions { short }
            }
            primaryReview { score }
          }
        }
      }
    }
    """
    payload = graphql(gql, variables)
    edges = (
        payload.get("data", {})
        .get("searchObjectsByName", {})
        .get("edges", [])
    )
    results: list[dict[str, Any]] = []
    for edge in edges:
        node = (edge or {}).get("node") or {}
        meta = node.get("metadata") or {}
        names = meta.get("names") or {}
        descriptions = meta.get("descriptions") or {}
        title = names.get("name") or names.get("short") or node.get("slug")
        if not title:
            continue
        results.append(
            {
                "id": node.get("id"),
                "slug": node.get("slug"),
                "url": absolute_ign_url(node.get("url") or node.get("slug")),
                "title": title,
                "description": matching.clean_html_text(descriptions.get("short") or ""),
                "rating": matching.rating_to_percent(
                    ((node.get("primaryReview") or {}).get("score"))
                ),
            }
        )
    return results


def fetch_metadata(
    slug_or_url: str,
    graphql: GraphqlFn,
    game_to_metadata_fn: Callable[[dict[str, Any]], dict[str, Any]],
) -> dict[str, Any] | None:
    slug = slug_from_ign_value(slug_or_url)
    if not slug:
        return None
    variables = {"slug": slug, "objectType": "Game", "state": "Published"}
    gql = """
    query ObjectSelectByTypeAndSlug($objectType: ObjectType!, $slug: String!, $state: State) {
      objectSelectByTypeAndSlug(type: $objectType, slug: $slug, state: $state) {
        id
        slug
        url
        type
        metadata {
          names { name short alt }
          descriptions { short long }
        }
        producers { name slug }
        publishers { name slug }
        genres { name slug }
        features { name slug }
        primaryImage { id url caption state height width }
        images {
          edges {
            node { id url caption state height width }
          }
        }
        primaryReview { score scoreText scoreSummary }
        objectRegions {
          region
          releases {
            date
            platformAttributes { name slug }
          }
        }
      }
    }
    """
    payload = graphql(gql, variables)
    game = payload.get("data", {}).get("objectSelectByTypeAndSlug")
    if not isinstance(game, dict):
        return None
    return game_to_metadata_fn(game)


def auto_fetch_metadata(
    title: str,
    fetch_metadata_fn: Callable[[str], dict[str, Any] | None],
    search_metadata_fn: Callable[[str, int], list[dict[str, Any]]],
) -> dict[str, Any] | None:
    cleaned = matching.clean_game_title(title)
    if not cleaned:
        return None

    fallback: dict[str, Any] | None = None

    def consider(metadata: dict[str, Any] | None) -> dict[str, Any] | None:
        nonlocal fallback
        if not metadata or not matching.ign_title_acceptable(
            cleaned, metadata.get("title", "")
        ):
            return None
        platforms = metadata.get("platforms")
        if not platforms or matching.has_pc_platform(platforms):
            return metadata
        if fallback is None:
            fallback = metadata
        return None

    for slug in slug_candidates(cleaned):
        try:
            metadata = consider(fetch_metadata_fn(slug))
            if metadata:
                return metadata
        except Exception:
            continue

    results = search_metadata_fn(cleaned, 5)
    ranked = sorted(
        results,
        key=lambda candidate: matching.console_title_suffix(
            candidate.get("title", "")
        )
        is not None,
    )
    for candidate in ranked[:4]:
        try:
            metadata = consider(
                fetch_metadata_fn(candidate.get("slug") or candidate.get("url"))
            )
            if metadata:
                return metadata
        except Exception:
            continue
    return fallback


class IgnTrailerCandidate(TypedDict):
    format: str
    url: str
    height: int


class IgnTrailerResult(TypedDict):
    name: str
    candidates: list[IgnTrailerCandidate]


TrailerHtmlFetchFn = Callable[..., str]

TRAILER_HTML_MAX_BYTES = 1_048_576
TRAILER_LISTING_MAX_ITEMS = 24
TRAILER_VIDEO_MAX_PAGES = 12
TRAILER_VIDEO_MAX_ASSETS = 8

_IGN_GAME_ID_RE = re.compile(r"^[A-Za-z0-9:._-]{1,256}$")
_IGN_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,119}$")
_IGN_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_IGN_VIDEO_PATH_RE = re.compile(r"^/videos/[A-Za-z0-9_-]+$")
_IGN_ASSET_HOST_RE = re.compile(r"^assets(?:[0-9]+)?\.ign\.com$", re.IGNORECASE)
_TRAILER_ALLOWED_TITLE_WORDS = frozenset(
    {
        "ign",
        "official",
        "launch",
        "story",
        "gameplay",
        "reveal",
        "teaser",
        "cinematic",
        "announcement",
        "debut",
        "trailer",
        "red",
        "band",
        "extended",
        "final",
        "new",
        "first",
        "look",
        "world",
        "premiere",
        "video",
        "hd",
        "4k",
        "for",
        "the",
    }
)
_TRAILER_REJECT_TITLE_WORDS = frozenset(
    {
        "analysis",
        "behind",
        "breakdown",
        "commercial",
        "developer",
        "documentary",
        "dlc",
        "edition",
        "expansion",
        "feature",
        "guide",
        "interview",
        "lore",
        "making",
        "news",
        "patch",
        "pinball",
        "playstation",
        "plus",
        "podcast",
        "promo",
        "promotional",
        "recap",
        "remaster",
        "remastered",
        "review",
        "roundtable",
        "scenes",
        "stream",
        "update",
        "walkthrough",
        "movie",
        "film",
        "machine",
        "booster",
        "pass",
        "holiday",
        "holidays",
        "collection",
        "and",
        "ii",
        "iii",
        "iv",
    }
)


def is_ign_page_url(value: str) -> bool:
    """Return whether a URL stays on IGN's canonical HTTPS web origin."""
    try:
        parsed = urllib.parse.urlsplit(str(value or ""))
        return (
            parsed.scheme.casefold() == "https"
            and parsed.hostname is not None
            and parsed.hostname.casefold() == "www.ign.com"
            and parsed.username is None
            and parsed.password is None
            and parsed.port in (None, 443)
        )
    except (TypeError, ValueError):
        return False


def _canonical_game_slug(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if "://" in raw or raw.startswith("//"):
        if not is_ign_page_url(raw):
            return ""
        parsed = urllib.parse.urlsplit(raw)
        if parsed.query or parsed.fragment:
            return ""
        match = re.fullmatch(r"/games/([^/]+)/?", parsed.path)
        slug = match.group(1) if match else ""
    else:
        slug = raw.strip("/")
        if slug.startswith("games/"):
            slug = slug[6:]
        if "/" in slug:
            return ""
    slug = urllib.parse.unquote(slug).casefold()
    return slug if _IGN_SLUG_RE.fullmatch(slug) else ""


def _title_tokens(value: str) -> list[str]:
    text = html.unescape(str(value or "")).casefold().replace("&", " and ")
    tokens = re.findall(r"[a-z0-9]+", text)
    while tokens and tokens[0] in {"a", "an", "the"}:
        tokens.pop(0)
    return tokens


def _title_without_platform_suffix(value: str) -> str:
    if matching.console_title_suffix(value):
        return re.sub(r"\s*(?:\[[^\]]+\]|\([^)]+\))\s*$", "", value)
    return value


def _same_game_title(left: str, right: str) -> bool:
    left_tokens = _title_tokens(_title_without_platform_suffix(left))
    return bool(left_tokens) and left_tokens == _title_tokens(_title_without_platform_suffix(right))


def _game_titles(game: dict[str, Any]) -> list[str]:
    metadata = game.get("metadata")
    names = metadata.get("names") if isinstance(metadata, dict) else None
    if isinstance(names, dict):
        values = [names.get("name"), names.get("short"), names.get("alt")]
    elif isinstance(names, list):
        values = [
            value.get("name") if isinstance(value, dict) else value
            for value in names
        ]
    else:
        values = []
    return [str(value).strip() for value in values if isinstance(value, str) and value.strip()]


def _game_identity(
    game: Any, requested_slug: str, title: str
) -> dict[str, str] | None:
    if not isinstance(game, dict) or str(game.get("type") or "").casefold() != "game":
        return None
    game_id = game.get("id")
    if isinstance(game_id, bool) or not isinstance(game_id, (str, int)):
        return None
    if isinstance(game_id, int) and game_id <= 0:
        return None
    canonical_id = str(game_id).strip()
    if not _IGN_GAME_ID_RE.fullmatch(canonical_id):
        return None
    slug = _canonical_game_slug(game.get("slug"))
    if not slug or slug != requested_slug:
        return None
    canonical_url = game.get("url")
    if canonical_url:
        url_slug = _canonical_game_slug(str(canonical_url))
        if not url_slug or url_slug != slug:
            return None
    titles = _game_titles(game)
    if not titles or (title and not any(_same_game_title(title, candidate) for candidate in titles)):
        return None
    return {"id": canonical_id, "slug": slug, "title": _title_without_platform_suffix(titles[0])}


def _fetch_game_by_slug(
    slug: str, graphql: GraphqlFn, title: str
) -> dict[str, str] | None:
    if not _IGN_SLUG_RE.fullmatch(slug):
        return None
    query = """
    query ObjectSelectByTypeAndSlug($objectType: ObjectType!, $slug: String!, $state: State) {
      objectSelectByTypeAndSlug(type: $objectType, slug: $slug, state: $state) {
        id
        slug
        url
        type
        metadata { names { name short alt } }
      }
    }
    """
    payload = graphql(
        query,
        {"slug": slug, "objectType": "Game", "state": "Published"},
    )
    game = payload.get("data", {}).get("objectSelectByTypeAndSlug")
    return _game_identity(game, slug, title)


def _resolve_game_identity(
    title: str, game_url: str | None, graphql: GraphqlFn
) -> dict[str, str] | None:
    cleaned = matching.clean_game_title(title)
    if not cleaned or len(cleaned) > 200:
        return None

    saved_slug = _canonical_game_slug(game_url) if game_url else ""
    if game_url and (not is_ign_page_url(game_url) or not saved_slug):
        return None
    if saved_slug:
        return _fetch_game_by_slug(saved_slug, graphql, "")

    results = search_metadata(cleaned, 12, graphql)
    exact_results = [
        result for result in results if _same_game_title(cleaned, str(result.get("title") or ""))
    ]
    found: dict[str, dict[str, str]] = {}
    seen_slugs: set[str] = set()
    for result in exact_results:
        slug = _canonical_game_slug(result.get("slug") or result.get("url"))
        if not slug or slug in seen_slugs:
            continue
        seen_slugs.add(slug)
        identity = _fetch_game_by_slug(slug, graphql, cleaned)
        if not identity:
            continue
        result_id = result.get("id")
        if result_id is not None and str(result_id).strip() != identity["id"]:
            continue
        found[identity["id"]] = identity
    if len(found) == 1:
        return next(iter(found.values()))
    return None


class _TrailerListingParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.items: list[dict[str, str]] = []
        self._item: dict[str, Any] | None = None
        self._div_depth = 0
        self._anchor: dict[str, Any] | None = None

    def _finish_item(self) -> None:
        if self._item is None:
            return
        item_id = str(self._item.get("id") or "")
        if _IGN_ID_RE.fullmatch(item_id):
            for anchor in self._item.get("anchors", []):
                href = str(anchor.get("href") or "")
                page_url = _canonical_video_page_url(href)
                label = str(anchor.get("label") or "").strip()
                if page_url and label:
                    self.items.append(
                        {"id": item_id, "url": page_url, "label": label}
                    )
                    break
        self._item = None
        self._div_depth = 0
        if len(self.items) >= TRAILER_LISTING_MAX_ITEMS:
            self._item = {"id": "", "anchors": []}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "div":
            if attributes.get("data-cy") == "content-item":
                if self._item is not None:
                    self._finish_item()
                    if len(self.items) >= TRAILER_LISTING_MAX_ITEMS:
                        return
                self._item = {
                    "id": str(attributes.get("data-id") or ""),
                    "anchors": [],
                }
                self._div_depth = 1
            elif self._item is not None and self._div_depth:
                self._div_depth += 1
        if self._item is not None and self._div_depth and tag == "a" and self._anchor is None:
            self._anchor = {
                "href": str(attributes.get("href") or ""),
                "label": str(attributes.get("aria-label") or "").strip(),
                "text": [],
            }

    def handle_data(self, data: str) -> None:
        if self._anchor is not None and not self._anchor["label"]:
            self._anchor["text"].append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._anchor is not None:
            if not self._anchor["label"]:
                self._anchor["label"] = " ".join(self._anchor["text"])
            if self._item is not None:
                self._item["anchors"].append(self._anchor)
            self._anchor = None
        elif tag == "div" and self._item is not None and self._div_depth:
            self._div_depth -= 1
            if self._div_depth == 0:
                self._finish_item()


def _canonical_video_page_url(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        parsed_value = urllib.parse.urlsplit(raw)
        if parsed_value.scheme or parsed_value.netloc:
            absolute = raw
        elif raw.startswith("/"):
            absolute = urllib.parse.urljoin(IGN_BASE_URL, raw)
        else:
            return ""
        if not is_ign_page_url(absolute):
            return ""
        parsed = urllib.parse.urlsplit(absolute)
        if parsed.query or parsed.fragment or not _IGN_VIDEO_PATH_RE.fullmatch(parsed.path):
            return ""
    except (TypeError, ValueError):
        return ""
    return urllib.parse.urlunsplit(("https", "www.ign.com", parsed.path, "", ""))

def _parse_trailer_listing(document: str) -> list[dict[str, str]]:
    parser = _TrailerListingParser()
    parser.feed(document)
    parser.close()
    if parser._item is not None:
        parser._finish_item()
    return parser.items[:TRAILER_LISTING_MAX_ITEMS]


class _NextDataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.parts: list[str] = []
        self.length = 0
        self.oversize = False
        self._script_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "script" and dict(attrs).get("id") == "__NEXT_DATA__":
            self._script_depth = 1

    def handle_data(self, data: str) -> None:
        if not self._script_depth or self.oversize:
            return
        self.length += len(data)
        if self.length > TRAILER_HTML_MAX_BYTES:
            self.oversize = True
            self.parts.clear()
            return
        self.parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._script_depth:
            self._script_depth = 0


def _next_data_page(document: str) -> dict[str, Any] | None:
    parser = _NextDataParser()
    parser.feed(document)
    parser.close()
    if parser.oversize or not parser.parts:
        return None
    try:
        payload = json.loads("".join(parser.parts))
    except (TypeError, ValueError):
        return None
    if not isinstance(payload, dict):
        return None
    props = payload.get("props")
    if not isinstance(props, dict):
        return None
    page_props = props.get("pageProps")
    if not isinstance(page_props, dict):
        return None
    page = page_props.get("page")
    return page if isinstance(page, dict) else None


def _trailer_title_score(game_title: str, video_title: str) -> int | None:
    game_words = _title_tokens(game_title)
    video_words = _title_tokens(video_title)
    if not game_words or not video_words:
        return None
    if video_words[-1:] == ["ign"]:
        video_words.pop()

    start = next(
        (
            index
            for index in range(len(video_words) - len(game_words) + 1)
            if video_words[index : index + len(game_words)] == game_words
        ),
        None,
    )
    if start is None:
        return None
    before = video_words[:start]
    after = video_words[start + len(game_words) :]
    surrounding = before + after
    if not surrounding or _TRAILER_REJECT_TITLE_WORDS.intersection(surrounding):
        return None
    if any(word not in _TRAILER_ALLOWED_TITLE_WORDS for word in before):
        return None
    if not {"trailer", "teaser"}.intersection(surrounding):
        return None
    for index, word in enumerate(surrounding):
        if not word.isdecimal():
            continue
        previous = surrounding[index - 1] if index else ""
        if word == "360" and previous == "xbox":
            continue
        if previous == "part" or re.fullmatch(r"v\d+", previous):
            continue
        return None
    score = 50 if "trailer" in surrounding else 35
    score += 20 if "official" in surrounding else 0
    score += 20 if "launch" in surrounding else 0
    score += 15 if "gameplay" in surrounding else 0
    score += 12 if "story" in surrounding else 0
    score += 10 if "reveal" in surrounding else 0
    score += 5 if "cinematic" in surrounding else 0
    return score


def _page_assets(assets: Any) -> list[IgnTrailerCandidate]:
    if not isinstance(assets, list):
        return []
    candidates: list[IgnTrailerCandidate] = []
    seen_urls: set[str] = set()
    for asset in assets:
        if not isinstance(asset, dict):
            continue
        url = _canonical_mp4_url(asset.get("url"))
        height = asset.get("height")
        asset_format = str(asset.get("format") or "").casefold()
        if (
            not url
            or url in seen_urls
            or isinstance(height, bool)
            or not isinstance(height, int)
            or not 360 <= height <= 4320
            or (asset_format and "mp4" not in asset_format)
        ):
            continue
        seen_urls.add(url)
        candidates.append({"format": "mp4", "url": url, "height": height})
    candidates.sort(key=lambda candidate: candidate["height"], reverse=True)
    return candidates[:TRAILER_VIDEO_MAX_ASSETS]


def _canonical_mp4_url(value: Any) -> str:
    raw = str(value or "").strip()
    try:
        parsed = urllib.parse.urlsplit(raw)
        host = parsed.hostname or ""
        if (
            parsed.scheme.casefold() != "https"
            or not _IGN_ASSET_HOST_RE.fullmatch(host)
            or parsed.username is not None
            or parsed.password is not None
            or parsed.port not in (None, 443)
            or not parsed.path.casefold().endswith(".mp4")
            or parsed.fragment
            or len(parsed.query) > 2048
        ):
            return ""
    except (TypeError, ValueError):
        return ""
    return urllib.parse.urlunsplit(("https", parsed.netloc, parsed.path, parsed.query, ""))


def find_trailer(
    title: str,
    game_url: str | None,
    graphql: GraphqlFn,
    fetch_html: TrailerHtmlFetchFn,
) -> IgnTrailerResult | None:
    """Find a high-confidence game trailer and return its direct MP4 qualities."""
    try:
        cleaned_title = matching.clean_game_title(title)
        game = _resolve_game_identity(cleaned_title, game_url, graphql)
        if not game:
            return None

        listing_url = f"{IGN_BASE_URL}/games/{game['slug']}/trailers"
        listing_html = fetch_html(
            listing_url, timeout=12, max_bytes=TRAILER_HTML_MAX_BYTES
        )
        if (
            not isinstance(listing_html, str)
            or len(listing_html.encode("utf-8", errors="ignore")) > TRAILER_HTML_MAX_BYTES
        ):
            return None
        entries = _parse_trailer_listing(listing_html)
        ranked: list[tuple[int, int, str, list[IgnTrailerCandidate]]] = []
        attempted_pages = 0
        for index, entry in enumerate(entries):
            listed_score = _trailer_title_score(game["title"], entry["label"])
            if listed_score is None:
                continue
            if attempted_pages >= TRAILER_VIDEO_MAX_PAGES:
                break
            attempted_pages += 1
            try:
                video_html = fetch_html(
                    entry["url"], timeout=12, max_bytes=TRAILER_HTML_MAX_BYTES
                )
            except Exception:
                continue
            if (
                not isinstance(video_html, str)
                or len(video_html.encode("utf-8", errors="ignore"))
                > TRAILER_HTML_MAX_BYTES
            ):
                continue
            page = _next_data_page(video_html)
            if not page:
                continue
            page_id = str(page.get("objectId") or "")
            if not page_id or page_id.casefold() != game["id"].casefold():
                continue
            category = str(page.get("category") or "").strip().casefold()
            if category != "trailer":
                continue
            video = page.get("video")
            content = video.get("content") if isinstance(video, dict) else None
            if (
                not isinstance(content, dict)
                or str(content.get("id") or "").casefold() != entry["id"].casefold()
            ):
                continue
            primary = content.get("primaryObject")
            if (
                not isinstance(primary, dict)
                or str(primary.get("type") or "").casefold() != "game"
                or str(primary.get("id") or "").casefold() != game["id"].casefold()
            ):
                continue
            page_title = str(page.get("pageTitle") or "").strip()
            page_score = _trailer_title_score(game["title"], page_title)
            if page_score is None:
                continue
            assets = video.get("assets") if isinstance(video, dict) else None
            candidates = _page_assets(assets)
            if not candidates:
                continue
            name = html.unescape(page_title)
            name = re.sub(r"\s*(?:[-|:]\s*)?IGN$", "", name, flags=re.IGNORECASE).strip()
            if not name:
                name = entry["label"][:200]
            ranked.append(
                (min(listed_score, page_score), index, name[:200], candidates)
            )
        if not ranked:
            return None
        best = max(ranked, key=lambda item: (item[0], -item[1]))
        return {"name": best[2], "candidates": best[3]}
    except Exception:
        return None
