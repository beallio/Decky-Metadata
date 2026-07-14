from __future__ import annotations

from typing import Any

import pytest

import main


def make_plugin() -> main.Plugin:
    return main.Plugin.__new__(main.Plugin)


def test_steam_appdetails_for_appid_maps_store_payload(monkeypatch) -> None:
    plugin = make_plugin()
    calls: list[tuple[str, int]] = []
    appid = 15100

    def fake_http_json(url: str, timeout: int = 20):
        calls.append((url, timeout))
        return {
            str(appid): {
                "success": True,
                "data": {
                    "name": " Assassin's Creed: Director's Cut Edition ",
                    "short_description": "<p>Short store description.</p>",
                    "detailed_description": "<p>Detailed <b>Steam</b> description.</p>",
                    "developers": ["Ubisoft Montreal", ""],
                    "publishers": ["Ubisoft"],
                    "genres": [{"id": "1", "description": "Action"}, {"description": ""}],
                    "release_date": {"date": "Apr 9, 2008"},
                    "screenshots": [
                        {
                            "id": 1,
                            "path_thumbnail": "https://cdn.example/thumb.jpg",
                            "path_full": "https://cdn.example/full.jpg",
                        },
                        {"id": 2, "path_thumbnail": "https://cdn.example/empty.jpg"},
                    ],
                    "metacritic": {"score": 79},
                    "categories": [
                        {"id": 2},
                        {"id": "22"},
                        {"id": 29},
                        {"id": "bad"},
                        {"id": 0},
                    ],
                    "dlc": [15101, "15102", 15101, 0, -1, "bad", True],
                },
            }
        }

    monkeypatch.setattr(plugin, "_http_json", fake_http_json)

    details = plugin._steam_appdetails_for_appid(appid)

    assert calls == [
        (
            "https://store.steampowered.com/api/appdetails?appids=15100&l=english",
            12,
        )
    ]
    assert details == {
        "title": "Assassin's Creed: Director's Cut Edition",
        "description": "Detailed Steam description.",
        "short_description": "Short store description.",
        "developers": [{"name": "Ubisoft Montreal", "url": ""}],
        "publishers": [{"name": "Ubisoft", "url": ""}],
        "genres": ["Action"],
        "release_date": plugin._date_to_epoch("Apr 9, 2008"),
        "rating": 79,
        "store_categories": [2, 22, 29],
        "steam_dlc_appids": [15101, 15102],
        "has_points_shop": True,
        "screenshots": [
            {
                "id": "1",
                "url": "https://cdn.example/full.jpg",
                "caption": "",
                "width": 0,
                "height": 0,
            }
        ],
    }


def test_steam_appdetails_success_emits_empty_availability_fields(monkeypatch) -> None:
    plugin = make_plugin()
    appid = 15100
    monkeypatch.setattr(
        plugin,
        "_http_json",
        lambda _url, timeout=20: {
            str(appid): {"success": True, "data": {"name": "No extras"}}
        },
    )

    assert plugin._steam_appdetails_for_appid(appid) == {
        "title": "No extras",
        "steam_dlc_appids": [],
        "has_points_shop": False,
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"123": {"success": False, "data": {"name": "Nope"}}},
        {"123": {"success": True}},
        {"123": {"success": True, "data": None}},
        {"123": "bad"},
        {},
        [],
    ],
)
def test_steam_appdetails_for_appid_returns_none_for_unusable_payloads(
    monkeypatch, payload: Any
) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(plugin, "_http_json", lambda _url, timeout=20: payload)

    assert plugin._steam_appdetails_for_appid(123) is None


def test_steam_appdetails_for_appid_swallows_http_errors(monkeypatch) -> None:
    plugin = make_plugin()

    def raise_error(_url: str, timeout: int = 20):
        raise RuntimeError("network down")

    monkeypatch.setattr(plugin, "_http_json", raise_error)

    assert plugin._steam_appdetails_for_appid(123) is None


def test_steam_appdetails_for_appid_short_circuits_non_positive_appids(monkeypatch) -> None:
    plugin = make_plugin()
    calls: list[str] = []

    def fake_http_json(url: str, timeout: int = 20):
        calls.append(url)
        return {"1": {"success": True, "data": {"name": "Example"}}}

    monkeypatch.setattr(plugin, "_http_json", fake_http_json)

    assert plugin._steam_appdetails_for_appid(0) is None
    assert plugin._steam_appdetails_for_appid(-1) is None
    assert calls == []


def test_metadata_with_steam_news_sync_prefers_steam_appdetails_over_ign(
    monkeypatch,
) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(
        plugin,
        "_steam_news_for_metadata",
        lambda metadata, title, limit=6: (15100, "https://store.steampowered.com/app/15100/", []),
    )
    monkeypatch.setattr(plugin, "_steam_deck_compat_for_appid", lambda steam_appid: None)
    monkeypatch.setattr(
        plugin,
        "_steam_appdetails_for_appid",
        lambda steam_appid: {"title": "Steam Name", "description": "Steam desc"},
    )

    enriched = plugin._metadata_with_steam_news_sync(
        {
            "title": "IGN Name",
            "source": "IGN",
            "description": "IGN desc",
            "store_categories": [],
        },
        "IGN Name",
    )

    assert enriched["title"] == "Steam Name"
    assert enriched["description"] == "Steam desc"
    assert enriched["source"] == "Steam"


def test_metadata_with_steam_news_sync_preserves_ign_when_appdetails_missing(
    monkeypatch,
) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(
        plugin,
        "_steam_news_for_metadata",
        lambda metadata, title, limit=6: (15100, "https://store.steampowered.com/app/15100/", []),
    )
    monkeypatch.setattr(plugin, "_steam_deck_compat_for_appid", lambda steam_appid: None)
    monkeypatch.setattr(plugin, "_steam_appdetails_for_appid", lambda steam_appid: None)

    enriched = plugin._metadata_with_steam_news_sync(
        {
            "title": "IGN Name",
            "source": "IGN",
            "description": "IGN desc",
            "store_categories": [],
        },
        "IGN Name",
    )

    assert enriched["title"] == "IGN Name"
    assert enriched["description"] == "IGN desc"
    assert enriched["source"] == "IGN"


def test_sanitize_metadata_normalizes_availability_and_legacy_points_shop() -> None:
    plugin = make_plugin()

    sanitized = plugin._sanitize_metadata(
        {
            "store_categories": [2, 29],
            "steam_dlc_appids": [10, "11", 10, 0, -2, "bad", True, None],
        }
    )

    assert sanitized["steam_dlc_appids"] == [10, 11]
    assert sanitized["has_points_shop"] is True


@pytest.mark.parametrize("malformed", [None, {}, "10", 10, True])
def test_sanitize_metadata_rejects_malformed_dlc_collections(malformed: Any) -> None:
    plugin = make_plugin()

    assert plugin._sanitize_metadata({"steam_dlc_appids": malformed})[
        "steam_dlc_appids"
    ] == []


def test_sanitize_metadata_explicit_false_wins_over_legacy_categories() -> None:
    plugin = make_plugin()

    sanitized = plugin._sanitize_metadata(
        {"store_categories": [29], "has_points_shop": False}
    )

    assert sanitized["has_points_shop"] is False


def test_metadata_with_steam_news_sync_clears_stale_availability_on_success(
    monkeypatch,
) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(
        plugin,
        "_steam_news_for_metadata",
        lambda metadata, title, limit=6: (
            15100,
            "https://store.steampowered.com/app/15100/",
            [],
        ),
    )
    monkeypatch.setattr(plugin, "_steam_deck_compat_for_appid", lambda steam_appid: None)
    monkeypatch.setattr(
        plugin,
        "_steam_appdetails_for_appid",
        lambda steam_appid: {"steam_dlc_appids": [], "has_points_shop": False},
    )

    enriched = plugin._metadata_with_steam_news_sync(
        {
            "title": "Old Steam Data",
            "steam_dlc_appids": [15101],
            "has_points_shop": True,
            "store_categories": [29],
        },
        "Old Steam Data",
    )

    assert enriched["steam_dlc_appids"] == []
    assert enriched["has_points_shop"] is False


def test_metadata_with_steam_news_sync_preserves_availability_on_transient_failure(
    monkeypatch,
) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(
        plugin,
        "_steam_news_for_metadata",
        lambda metadata, title, limit=6: (
            15100,
            "https://store.steampowered.com/app/15100/",
            [],
        ),
    )
    monkeypatch.setattr(plugin, "_steam_deck_compat_for_appid", lambda steam_appid: None)
    monkeypatch.setattr(plugin, "_steam_appdetails_for_appid", lambda steam_appid: None)

    enriched = plugin._metadata_with_steam_news_sync(
        {
            "title": "Old Steam Data",
            "steam_dlc_appids": [15101],
            "has_points_shop": True,
            "store_categories": [],
        },
        "Old Steam Data",
    )

    assert enriched["steam_dlc_appids"] == [15101]
    assert enriched["has_points_shop"] is True
