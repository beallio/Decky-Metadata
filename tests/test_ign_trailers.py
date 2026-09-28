from __future__ import annotations

import io
import json
import urllib.error

import pytest
import main

from backend.providers import ign


def _game(
    title: str = "Deadpool",
    slug: str = "deadpool",
    game_id: str = "game-deadpool",
) -> dict[str, Any]:
    return {
        "id": game_id,
        "slug": slug,
        "url": f"https://www.ign.com/games/{slug}",
        "type": "Game",
        "metadata": {"names": {"name": title, "short": title}},
    }


def _listing(items: list[tuple[str, str, str]]) -> str:
    cards = []
    for video_id, href, label in items:
        cards.append(
            f'<div data-cy="content-item" data-id="{video_id}">'
            f'<a href="{href}" aria-label="{label}"></a></div>'
        )
    return "<!doctype html><html><body>" + "".join(cards) + "</body></html>"


def _video_page(
    game: dict[str, Any],
    video_id: str,
    title: str,
    *,
    associated_game_id: str | None = None,
    category: str = "Trailer",
    assets: list[dict[str, Any]] | None = None,
) -> str:
    payload = {
        "props": {
            "pageProps": {
                "page": {
                    "objectId": game["id"],
                    "pageTitle": title,
                    "category": category,
                    "video": {
                        "content": {
                            "id": video_id,
                            "primaryObject": {
                                "id": associated_game_id or game["id"],
                                "type": "Game",
                            }
                        },
                        "assets": assets
                        if assets is not None
                        else [
                            {
                                "url": "https://assets14.ign.com/video/deadpool-1080.mp4",
                                "width": 1920,
                                "height": 1080,
                                "format": "mp4",
                            },
                            {
                                "url": "https://assets14.ign.com/video/deadpool-720.mp4",
                                "width": 1280,
                                "height": 720,
                                "format": "mp4",
                            },
                        ],
                    },
                }
            }
        }
    }
    return (
        '<html><head><script id="__NEXT_DATA__" type="application/json">'
        + json.dumps(payload)
        + "</script></head><body></body></html>"
    )


@pytest.fixture
def ign_case_factory():
    def build(
        game: dict[str, Any],
        items: list[tuple[str, str, str]],
        video_pages: dict[str, str],
        *,
        search_nodes: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        slug = game["slug"]
        listing_url = f"https://www.ign.com/games/{slug}/trailers"
        pages = {listing_url: _listing(items), **video_pages}
        node = {
            "id": game["id"],
            "slug": slug,
            "url": game["url"],
            "type": "Game",
            "metadata": {"names": {"name": game["metadata"]["names"]["name"]}},
        }
        return {
            "game": game,
            "listing_url": listing_url,
            "pages": pages,
            "search_nodes": search_nodes if search_nodes is not None else [node],
            "html_requests": [],
            "graphql_requests": [],
        }

    return build


def _find(
    case: dict[str, Any],
    title: str,
    game_url: str | None = None,
    *,
    html_fetch: Any | None = None,
) -> dict[str, Any] | None:
    def graphql(query: str, variables: dict[str, Any]) -> dict[str, Any]:
        case["graphql_requests"].append((query, variables))
        if "searchObjectsByName" in query:
            return {
                "data": {
                    "searchObjectsByName": {
                        "edges": [{"node": node} for node in case["search_nodes"]]
                    }
                }
            }
        if "objectSelectByTypeAndSlug" in query:
            game = case["game"]
            result = game if variables["slug"] == game["slug"] else None
            return {"data": {"objectSelectByTypeAndSlug": result}}
        raise AssertionError("unexpected IGN GraphQL request")

    def fetch_fixture_html(
        url: str, *, timeout: int, max_bytes: int
    ) -> str:
        case["html_requests"].append((url, timeout, max_bytes))
        return case["pages"].get(url, "")

    return ign.find_trailer(
        title, game_url, graphql, html_fetch or fetch_fixture_html
    )


@pytest.fixture
def deadpool_fixture(ign_case_factory):
    game = _game()
    video_id = "11111111-1111-4111-8111-111111111111"
    video_url = "https://www.ign.com/videos/deadpool-official-launch-trailer"
    page = _video_page(game, video_id, "Deadpool Official Launch Trailer")
    return ign_case_factory(
        game,
        [
            (
                video_id,
                "/videos/deadpool-official-launch-trailer",
                "Deadpool Official Launch Trailer",
            )
        ],
        {video_url: page},
    )


@pytest.fixture
def bloodborne_fixture(ign_case_factory):
    game = _game("Bloodborne", "bloodborne", "game-bloodborne")
    promo_id = "22222222-2222-4222-8222-222222222222"
    trailer_id = "33333333-3333-4333-8333-333333333333"
    promo_url = "https://www.ign.com/videos/bloodborne-playstation-plus-promo"
    trailer_url = "https://www.ign.com/videos/bloodborne-story-trailer"
    promo = _video_page(
        game,
        promo_id,
        "PlayStation Plus Promo for Bloodborne",
    )
    trailer = _video_page(game, trailer_id, "Bloodborne Story Trailer")
    return ign_case_factory(
        game,
        [
            (
                promo_id,
                "/videos/bloodborne-playstation-plus-promo",
                "PlayStation Plus Promo for Bloodborne",
            ),
            (
                trailer_id,
                "/videos/bloodborne-story-trailer",
                "Bloodborne Story Trailer",
            ),
        ],
        {promo_url: promo, trailer_url: trailer},
    )


def test_deadpool_search_returns_direct_mp4_qualities(deadpool_fixture) -> None:
    result = _find(deadpool_fixture, "Deadpool")

    assert result is not None
    assert result["name"] == "Deadpool Official Launch Trailer"
    assert {candidate["height"] for candidate in result["candidates"]} == {720, 1080}
    assert result["candidates"][0] == {
        "format": "mp4",
        "url": "https://assets14.ign.com/video/deadpool-1080.mp4",
        "height": 1080,
    }
    assert any(candidate["height"] == 720 for candidate in result["candidates"])
    assert deadpool_fixture["html_requests"][0][0] == deadpool_fixture["listing_url"]


def test_saved_canonical_game_url_uses_matching_game_and_finds_bloodborne_story(
    bloodborne_fixture,
) -> None:
    result = _find(
        bloodborne_fixture,
        "Bloodborne",
        "https://www.ign.com/games/bloodborne",
    )

    assert result is not None
    assert result["name"] == "Bloodborne Story Trailer"
    assert any(candidate["height"] == 720 for candidate in result["candidates"])
    assert all(
        "playstation-plus-promo" not in request[0]
        for request in bloodborne_fixture["html_requests"]
    )
    assert not any(
        "searchObjectsByName" in query
        for query, _ in bloodborne_fixture["graphql_requests"]
    )


def test_platform_suffix_on_shortcut_still_finds_the_same_game(bloodborne_fixture) -> None:
    result = _find(bloodborne_fixture, "Bloodborne (PS4)")

    assert result is not None
    assert result["name"] == "Bloodborne Story Trailer"


def test_remastered_suffix_cannot_be_treated_as_the_original_game(ign_case_factory) -> None:
    case = ign_case_factory(_game("Metroid Prime", "metroid-prime"), [], {})

    assert _find(case, "Metroid Prime [Remastered]") is None


def test_ign_platform_suffix_does_not_hide_an_associated_base_trailer(ign_case_factory) -> None:
    game = _game("Bloodborne [PS4]", "bloodborne", "game-bloodborne")
    video_id = "abababab-abab-4bab-8bab-abababababab"
    video_url = "https://www.ign.com/videos/bloodborne-story-trailer"
    case = ign_case_factory(
        game,
        [(video_id, "/videos/bloodborne-story-trailer", "Bloodborne Story Trailer")],
        {video_url: _video_page(game, video_id, "Bloodborne Story Trailer")},
    )

    result = _find(case, "Bloodborne")
    assert result is not None
    assert result["name"] == "Bloodborne Story Trailer"


def test_listing_keeps_video_link_when_game_link_is_nested(deadpool_fixture) -> None:
    video_id = "11111111-1111-4111-8111-111111111111"
    deadpool_fixture["pages"][deadpool_fixture["listing_url"]] = (
        f'<div data-cy="content-item" data-id="{video_id}">'
        '<a href="/videos/deadpool-official-launch-trailer" aria-label="Deadpool Official Launch Trailer">'
        '<div><a href="/games/deadpool">Deadpool</a></div></a></div>'
    )

    result = _find(deadpool_fixture, "Deadpool")
    assert result is not None
    assert result["name"] == "Deadpool Official Launch Trailer"


def test_saved_game_match_survives_shortcut_rename(deadpool_fixture) -> None:
    result = _find(
        deadpool_fixture,
        "A custom shortcut name",
        "https://www.ign.com/games/deadpool",
    )

    assert result is not None
    assert result["name"] == "Deadpool Official Launch Trailer"


@pytest.mark.parametrize(
    "game_title,video_title",
    [
        ("Sonic Unleashed", "Sonic Unleashed Xbox 360 Trailer - New Sonic"),
        ("F-Zero GX", "F-Zero GX GameCube Trailer - New F-Zero Trailer (Part 1)"),
        ("Hades", "Hades - v1.0 Launch Trailer"),
    ],
)
def test_original_game_platform_and_version_trailers_remain_eligible(
    ign_case_factory, game_title: str, video_title: str
) -> None:
    slug = game_title.casefold().replace(" ", "-")
    game = _game(game_title, slug, f"game-{slug}")
    video_id = "abababab-abab-4bab-8bab-abababababab"
    video_url = f"https://www.ign.com/videos/{slug}-trailer"
    case = ign_case_factory(
        game,
        [(video_id, f"/videos/{slug}-trailer", video_title)],
        {video_url: _video_page(game, video_id, video_title)},
    )

    assert _find(case, game_title) is not None


def test_search_does_not_match_deadpool_pinball_to_deadpool(ign_case_factory) -> None:
    pinball = _game("Deadpool Pinball", "deadpool-pinball", "game-deadpool-pinball")
    case = ign_case_factory(pinball, [], {})

    result = _find(case, "Deadpool")
    assert result is None
    assert len(case["graphql_requests"]) == 1
    assert "searchObjectsByName" in case["graphql_requests"][0][0]
    assert case["html_requests"] == []


def test_video_page_id_must_match_trailers_listing(deadpool_fixture) -> None:
    deadpool_fixture["pages"][
        "https://www.ign.com/videos/deadpool-official-launch-trailer"
    ] = _video_page(
        deadpool_fixture["game"],
        "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        "Deadpool Official Launch Trailer",
    )

    assert _find(deadpool_fixture, "Deadpool") is None


def test_empty_trailer_listing_returns_no_result(ign_case_factory) -> None:
    case = ign_case_factory(_game(), [], {})

    assert _find(case, "Deadpool") is None
    assert len(case["html_requests"]) == 1


def test_unrelated_cards_do_not_consume_the_video_page_limit(ign_case_factory) -> None:
    game = _game()
    video_id = "12121212-1212-4212-8212-121212121212"
    video_url = "https://www.ign.com/videos/deadpool-official-trailer"
    cards = [
        (f"promo-{number}", f"/videos/unrelated-promo-{number}", "Publisher sale announcement")
        for number in range(ign.TRAILER_VIDEO_MAX_PAGES)
    ]
    cards.append((video_id, "/videos/deadpool-official-trailer", "Deadpool Official Trailer"))
    case = ign_case_factory(
        game, cards, {video_url: _video_page(game, video_id, "Deadpool Official Trailer")}
    )

    result = _find(case, "Deadpool")
    assert result is not None
    assert result["name"] == "Deadpool Official Trailer"


def test_malformed_video_metadata_does_not_hide_a_later_valid_trailer(ign_case_factory) -> None:
    game = _game()
    first_id = "13131313-1313-4313-8313-131313131313"
    second_id = "14141414-1414-4414-8414-141414141414"
    first_url = "https://www.ign.com/videos/deadpool-teaser"
    second_url = "https://www.ign.com/videos/deadpool-launch-trailer"
    case = ign_case_factory(
        game,
        [
            (first_id, "/videos/deadpool-teaser", "Deadpool Official Teaser"),
            (second_id, "/videos/deadpool-launch-trailer", "Deadpool Launch Trailer"),
        ],
        {
            first_url: '<script id="__NEXT_DATA__">{"props":{"pageProps":null}}</script>',
            second_url: _video_page(game, second_id, "Deadpool Launch Trailer"),
        },
    )

    result = _find(case, "Deadpool")
    assert result is not None
    assert result["name"] == "Deadpool Launch Trailer"


def test_video_associated_with_another_game_is_rejected(ign_case_factory) -> None:
    game = _game()
    video_id = "44444444-4444-4444-8444-444444444444"
    video_url = "https://www.ign.com/videos/deadpool-trailer"
    page = _video_page(
        game,
        video_id,
        "Deadpool Official Trailer",
        associated_game_id="game-not-deadpool",
    )
    case = ign_case_factory(
        game,
        [(video_id, "/videos/deadpool-trailer", "Deadpool Official Trailer")],
        {video_url: page},
    )

    assert _find(case, "Deadpool") is None


@pytest.mark.parametrize(
    "game_title,video_title,label",
    [
        ("Hades", "Hades Developer Lore Breakdown", "Hades Developer Lore Breakdown"),
        (
            "Metroid Prime",
            "Metroid Prime Remastered Reveal Trailer",
            "Metroid Prime Remastered Reveal Trailer",
        ),
        (
            "Bloodborne",
            "PlayStation Plus Promo for Bloodborne",
            "PlayStation Plus Promo for Bloodborne",
        ),
        ("Deadpool", "Deadpool Pinball Trailer", "Deadpool Pinball Trailer"),
        ("Deadpool", "Deadpool DLC Trailer", "Deadpool DLC Trailer"),
        ("Metroid Prime", "Metroid Prime 4 Reveal Trailer", "Metroid Prime 4 Reveal Trailer"),
        ("Deadpool", "Deadpool and Wolverine Official Trailer", "Deadpool and Wolverine Official Trailer"),
        ("Bloodborne", "Bloodborne Official Movie Trailer", "Bloodborne Official Movie Trailer"),
    ],
)
def test_related_or_ambiguous_video_titles_are_rejected(
    ign_case_factory, game_title: str, video_title: str, label: str
) -> None:
    slug = game_title.casefold().replace(" ", "-")
    game = _game(game_title, slug, f"game-{slug}")
    video_id = "55555555-5555-4555-8555-555555555555"
    video_url = f"https://www.ign.com/videos/{slug}-related-video"
    page = _video_page(game, video_id, video_title)
    case = ign_case_factory(
        game,
        [(video_id, f"/videos/{slug}-related-video", label)],
        {video_url: page},
    )

    assert _find(case, game_title) is None


def test_remastered_game_accepts_its_own_reveal_trailer(ign_case_factory) -> None:
    game = _game(
        "Metroid Prime Remastered",
        "metroid-prime-remastered",
        "game-metroid-prime-remastered",
    )
    video_id = "99999999-9999-4999-8999-999999999999"
    video_url = "https://www.ign.com/videos/metroid-prime-remastered-reveal"
    page = _video_page(game, video_id, "Metroid Prime Remastered Reveal Trailer")
    case = ign_case_factory(
        game,
        [
            (
                video_id,
                "/videos/metroid-prime-remastered-reveal",
                "Metroid Prime Remastered Reveal Trailer",
            )
        ],
        {video_url: page},
    )

    result = _find(case, "Metroid Prime Remastered")

    assert result is not None
    assert result["name"] == "Metroid Prime Remastered Reveal Trailer"


def test_malformed_video_json_returns_no_result(deadpool_fixture) -> None:
    deadpool_fixture["pages"][
        "https://www.ign.com/videos/deadpool-official-launch-trailer"
    ] = '<script id="__NEXT_DATA__">{broken}</script>'

    assert _find(deadpool_fixture, "Deadpool") is None


def test_oversize_listing_and_video_pages_are_rejected(ign_case_factory) -> None:
    game = _game()
    case = ign_case_factory(game, [], {})
    case["pages"][case["listing_url"]] = "x" * (ign.TRAILER_HTML_MAX_BYTES + 1)
    assert _find(case, "Deadpool") is None
    assert len(case["html_requests"]) == 1

    video_id = "66666666-6666-4666-8666-666666666666"
    video_url = "https://www.ign.com/videos/deadpool-trailer"
    case = ign_case_factory(
        game,
        [(video_id, "/videos/deadpool-trailer", "Deadpool Official Trailer")],
        {video_url: "x" * (ign.TRAILER_HTML_MAX_BYTES + 1)},
    )
    assert _find(case, "Deadpool") is None


def test_invalid_saved_game_urls_and_non_ign_video_links_are_rejected(
    ign_case_factory,
) -> None:
    case = ign_case_factory(_game(), [], {})
    for invalid_url in (
        "http://www.ign.com/games/deadpool",
        "https://www.ign.com.evil.example/games/deadpool",
        "https://user@www.ign.com/games/deadpool",
        "https://www.ign.com/games/deadpool/../bloodborne",
        "https://www.ign.com/games/deadpool?redirect=evil",
    ):
        assert _find(case, "Deadpool", invalid_url) is None
    assert case["graphql_requests"] == []
    assert case["html_requests"] == []

    video_id = "77777777-7777-4777-8777-777777777777"
    case = ign_case_factory(
        _game(),
        [
            (
                video_id,
                "https://evil.example/videos/deadpool-trailer",
                "Deadpool Official Trailer",
            )
        ],
        {},
    )
    assert _find(case, "Deadpool") is None
    assert case["html_requests"] == [
        (case["listing_url"], 12, ign.TRAILER_HTML_MAX_BYTES)
    ]


def test_non_mp4_and_untrusted_mp4_assets_are_rejected(ign_case_factory) -> None:
    game = _game()
    video_id = "88888888-8888-4888-8888-888888888888"
    video_url = "https://www.ign.com/videos/deadpool-trailer"
    page = _video_page(
        game,
        video_id,
        "Deadpool Official Trailer",
        assets=[
            {"url": "https://evil.example/trailer.mp4", "height": 720, "format": "mp4"},
            {"url": "http://assets14.ign.com/trailer.mp4", "height": 720, "format": "mp4"},
            {"url": "https://assets14.ign.com/trailer.m3u8", "height": 720, "format": "hls"},
        ],
    )
    case = ign_case_factory(
        game,
        [(video_id, "/videos/deadpool-trailer", "Deadpool Official Trailer")],
        {video_url: page},
    )

    assert _find(case, "Deadpool") is None


def test_network_errors_return_no_result(ign_case_factory) -> None:
    case = ign_case_factory(_game(), [], {})

    def fail_graphql(_query: str, _variables: dict[str, Any]) -> dict[str, Any]:
        raise OSError("offline")

    def fail_html(_url: str, *, timeout: int, max_bytes: int) -> str:
        raise OSError("offline")

    assert ign.find_trailer("Deadpool", None, fail_graphql, fail_html) is None
    assert _find(case, "Deadpool", html_fetch=fail_html) is None


def test_strict_ign_url_validators_reject_unsafe_origins_and_paths() -> None:
    assert ign.is_ign_page_url("https://www.ign.com/games/deadpool")
    assert not ign.is_ign_page_url("https://www.ign.com.evil.example/games/deadpool")
    assert not ign.is_ign_page_url("http://www.ign.com/games/deadpool")
    assert ign._canonical_game_slug("https://www.ign.com/games/deadpool") == "deadpool"
    assert ign._canonical_game_slug("https://www.ign.com.evil.example/games/deadpool") == ""
    assert ign._canonical_game_slug("https://www.ign.com/games/deadpool/../bloodborne") == ""
    assert ign._canonical_video_page_url("https://evil.example/videos/deadpool") == ""


def test_graphql_rejects_declared_and_streamed_oversized_payloads(monkeypatch) -> None:
    limit = 2 * 1024 * 1024

    class Response:
        def __init__(self, declared: bool):
            self.headers = {"Content-Length": str(limit + 1)} if declared else {}

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self, size: int = -1) -> bytes:
            assert size == limit + 1
            return b"x" * size

    for declared in (True, False):
        monkeypatch.setattr(main.urllib.request, "urlopen", lambda *_args, **_kwargs: Response(declared))
        with pytest.raises(ValueError, match="IGN GraphQL response is too large"):
            main.Plugin.__new__(main.Plugin)._graphql("query { __typename }", {})


def test_graphql_rejects_oversized_http_error_body(monkeypatch) -> None:
    limit = 2 * 1024 * 1024

    def fail(request, **_kwargs):
        raise urllib.error.HTTPError(
            request.full_url, 503, "Unavailable", {},
            io.BytesIO(b"x" * (limit + 1)),
        )

    monkeypatch.setattr(main.urllib.request, "urlopen", fail)
    with pytest.raises(ValueError, match="IGN GraphQL error response is too large"):
        main.Plugin.__new__(main.Plugin)._graphql("query { __typename }", {})
