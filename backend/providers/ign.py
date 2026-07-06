from __future__ import annotations

import re
import urllib.parse
from typing import Any, Callable

from backend import matching

GraphqlFn = Callable[[str, dict[str, Any]], dict[str, Any]]

IGN_GRAPHQL_URL = "https://mollusk.apis.ign.com/graphql"
IGN_BASE_URL = "https://www.ign.com"

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

    for slug in slug_candidates(cleaned):
        try:
            metadata = fetch_metadata_fn(slug)
            if metadata and matching.ign_title_acceptable(cleaned, metadata.get("title", "")):
                return metadata
        except Exception:
            continue

    results = search_metadata_fn(cleaned, 5)
    if not results:
        return None
    best = results[0]
    if not matching.ign_title_acceptable(cleaned, best.get("title", "")):
        return None
    return fetch_metadata_fn(best["slug"] or best["url"])
