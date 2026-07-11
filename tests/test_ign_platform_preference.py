from __future__ import annotations

from typing import Any

import pytest

from backend import matching
from backend.providers import ign


def metadata(title: str, platforms: list[str] | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {"title": title}
    if platforms is not None:
        result["platforms"] = platforms
    return result


def test_search_fallback_prefers_pc_over_console_suffix() -> None:
    fetched: list[str] = []
    records = {
        "x-men-origins-wolverine-ds": metadata(
            "X-Men Origins: Wolverine [DS]", ["nintendo-ds"]
        ),
        "x-men-origins-wolverine-pc": metadata(
            "X-Men Origins: Wolverine", ["pc"]
        ),
    }

    def fetch(value: str) -> dict[str, Any] | None:
        fetched.append(value)
        return records.get(value)

    result = ign.auto_fetch_metadata(
        "X-Men Origins: Wolverine",
        fetch,
        lambda _query, _limit: [
            {
                "title": "X-Men Origins: Wolverine [DS]",
                "slug": "x-men-origins-wolverine-ds",
            },
            {
                "title": "X-Men Origins: Wolverine",
                "slug": "x-men-origins-wolverine-pc",
            },
        ],
    )

    assert result == records["x-men-origins-wolverine-pc"]
    assert fetched[-1] == "x-men-origins-wolverine-pc"
    assert "x-men-origins-wolverine-ds" not in fetched


def test_search_skips_console_only_top_rank_for_later_pc_candidate() -> None:
    records = {
        "console": metadata("Example Game", ["playstation-5"]),
        "pc": metadata("Example Game", ["windows-pc"]),
    }

    result = ign.auto_fetch_metadata(
        "Example Game",
        records.get,
        lambda _query, _limit: [
            {"title": "Example Game", "slug": "console"},
            {"title": "Example Game", "slug": "pc"},
        ],
    )

    assert result == records["pc"]


def test_console_only_candidate_remains_the_fallback() -> None:
    console = metadata("Example Game [DS]", ["nintendo-ds"])

    result = ign.auto_fetch_metadata(
        "Example Game",
        lambda value: console if value == "console" else None,
        lambda _query, _limit: [
            {"title": "Example Game [DS]", "slug": "console"}
        ],
    )

    assert result == console


@pytest.mark.parametrize("platforms", [[], None])
def test_unknown_or_empty_platforms_are_accepted(
    platforms: list[str] | None,
) -> None:
    candidate = metadata("Example Game", platforms)

    result = ign.auto_fetch_metadata(
        "Example Game",
        lambda value: candidate if value == "candidate" else None,
        lambda _query, _limit: [
            {"title": "Example Game", "slug": "candidate"}
        ],
    )

    assert result == candidate


def test_console_slug_candidate_yields_to_searched_pc_candidate() -> None:
    console = metadata("Example Game", ["xbox-one"])
    pc = metadata("Example Game", ["pc"])

    result = ign.auto_fetch_metadata(
        "Example Game",
        lambda value: {
            "example-game": console,
            "example-game-pc": pc,
        }.get(value),
        lambda _query, _limit: [
            {"title": "Example Game", "slug": "example-game-pc"}
        ],
    )

    assert result == pc


def test_pc_slug_candidate_returns_without_searching() -> None:
    pc = metadata("Example Game", ["steamos"])

    def unexpected_search(_query: str, _limit: int) -> list[dict[str, Any]]:
        raise AssertionError("search should not run for a verified PC slug candidate")

    result = ign.auto_fetch_metadata(
        "Example Game",
        lambda value: pc if value == "example-game" else None,
        unexpected_search,
    )

    assert result == pc


@pytest.mark.parametrize(
    "platform",
    [
        "pc",
        "Windows",
        "linux",
        "Mac",
        "macintosh",
        "SteamOS",
        "steam-deck",
        "Steam Deck",
        "windows-pc",
    ],
)
def test_has_pc_platform_recognizes_pc_names_and_slugs(platform: str) -> None:
    assert matching.has_pc_platform([platform]) is True


def test_has_pc_platform_rejects_console_only_and_empty_lists() -> None:
    assert matching.has_pc_platform(["nintendo-ds", "playstation-5"]) is False
    assert matching.has_pc_platform([]) is False


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Game [DS]", "DS"),
        ("Game (Xbox 360)", "Xbox 360"),
        ("Game [PS Vita]", "PS Vita"),
        ("Wobbly Life", None),
        ("Game [A Dark Subtitle]", None),
        ("Game [DS] Definitive Edition", None),
    ],
)
def test_console_title_suffix_only_detects_trailing_console_platforms(
    title: str,
    expected: str | None,
) -> None:
    assert matching.console_title_suffix(title) == expected


def test_ign_platforms_collects_slug_or_name_defensively() -> None:
    game = {
        "objectRegions": [
            {
                "releases": [
                    {
                        "platformAttributes": [
                            {"slug": " PC ", "name": "Windows PC"},
                            {"slug": "pc", "name": "PC"},
                            {"slug": "", "name": " Linux "},
                            None,
                            "not-a-dict",
                        ]
                    },
                    None,
                ]
            },
            {"releases": "malformed"},
            None,
        ]
    }

    assert ign.ign_platforms(game) == ["pc", "linux"]


def test_game_to_metadata_surfaces_platforms() -> None:
    result = ign.game_to_metadata(
        {
            "slug": "example-game",
            "objectRegions": [
                {
                    "releases": [
                        {"platformAttributes": [{"slug": "windows-pc"}]}
                    ]
                }
            ],
        }
    )

    assert result["platforms"] == ["windows-pc"]
