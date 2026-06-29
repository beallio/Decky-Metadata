from __future__ import annotations

import main


def make_plugin() -> main.Plugin:
    return main.Plugin.__new__(main.Plugin)


def test_steam_deck_compat_fetcher_returns_resolved_category(monkeypatch) -> None:
    plugin = make_plugin()

    def fake_http_json(url: str, timeout: int = 20):
        assert (
            url
            == "https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=123&l=english"
        )
        assert timeout == 12
        return {"success": 1, "results": {"resolved_category": 3}}

    monkeypatch.setattr(plugin, "_http_json", fake_http_json)

    assert plugin._steam_deck_compat_for_appid(123) == 3


def test_steam_deck_compat_fetcher_accepts_only_known_categories(monkeypatch) -> None:
    plugin = make_plugin()
    payload = {"success": 1, "results": {"resolved_category": 0}}

    monkeypatch.setattr(plugin, "_http_json", lambda _url, timeout=20: payload)

    for category in (0, 1, 2, 3):
        payload["results"]["resolved_category"] = category
        assert plugin._steam_deck_compat_for_appid(123) == category

    payload["results"]["resolved_category"] = 7
    assert plugin._steam_deck_compat_for_appid(123) is None


def test_steam_deck_compat_fetcher_returns_none_for_malformed_payload(monkeypatch) -> None:
    plugin = make_plugin()

    for payload in (
        {},
        {"success": 1},
        {"success": 1, "results": {}},
        {"success": 1, "results": {"resolved_category": "bad"}},
        {"success": 1, "results": {"resolved_category": None}},
    ):
        monkeypatch.setattr(plugin, "_http_json", lambda _url, timeout=20, payload=payload: payload)
        assert plugin._steam_deck_compat_for_appid(123) is None


def test_steam_deck_compat_fetcher_swallows_http_errors(monkeypatch) -> None:
    plugin = make_plugin()

    def raise_error(_url: str, timeout: int = 20):
        raise RuntimeError("network down")

    monkeypatch.setattr(plugin, "_http_json", raise_error)

    assert plugin._steam_deck_compat_for_appid(123) is None


def test_steam_deck_compat_fetcher_short_circuits_non_positive_appids(monkeypatch) -> None:
    plugin = make_plugin()
    calls: list[str] = []

    def fake_http_json(url: str, timeout: int = 20):
        calls.append(url)
        return {"success": 1, "results": {"resolved_category": 3}}

    monkeypatch.setattr(plugin, "_http_json", fake_http_json)

    assert plugin._steam_deck_compat_for_appid(0) is None
    assert plugin._steam_deck_compat_for_appid(-1) is None
    assert calls == []


def test_sanitize_metadata_round_trips_valid_deck_compat_category() -> None:
    plugin = make_plugin()

    sanitized = plugin._sanitize_metadata(
        {
            "title": "Example",
            "description": "",
            "store_categories": [],
            "deck_compat_category": "2",
        }
    )

    assert sanitized["deck_compat_category"] == 2


def test_sanitize_metadata_drops_invalid_deck_compat_category() -> None:
    plugin = make_plugin()

    sanitized = plugin._sanitize_metadata(
        {
            "title": "Example",
            "description": "",
            "store_categories": [],
            "deck_compat_category": 7,
        }
    )

    assert sanitized["deck_compat_category"] is None


def test_metadata_with_steam_news_sync_adds_deck_compat_for_resolved_appid(monkeypatch) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(
        plugin,
        "_steam_news_for_metadata",
        lambda metadata, title, limit=6: (123, "https://store.steampowered.com/app/123", []),
    )
    monkeypatch.setattr(plugin, "_steam_deck_compat_for_appid", lambda steam_appid: 1)

    enriched = plugin._metadata_with_steam_news_sync(
        {"title": "Example", "description": "", "store_categories": []},
        "Example",
    )

    assert enriched["steam_appid"] == 123
    assert enriched["deck_compat_category"] == 1
