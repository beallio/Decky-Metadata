from __future__ import annotations

import main


def make_plugin() -> main.Plugin:
    return main.Plugin.__new__(main.Plugin)


def stub_store_search(monkeypatch, plugin: main.Plugin, items: list[dict[str, object]]) -> list[str]:
    calls: list[str] = []

    def fake_http_json(url: str, timeout: int = 20):
        calls.append(url)
        assert "store.steampowered.com/api/storesearch/" in url
        assert timeout == 12
        return {"items": items}

    monkeypatch.setattr(plugin, "_http_json", fake_http_json)
    return calls


def test_steam_appid_matching_prefers_space_marine_base_game_over_demo_and_soundtrack(monkeypatch) -> None:
    plugin = make_plugin()
    stub_store_search(
        monkeypatch,
        plugin,
        [
            {"id": 55410, "name": "Warhammer 40,000: Space Marine Demo"},
            {"id": 55150, "name": "Warhammer 40,000: Space Marine - Anniversary Edition"},
            {"id": 2183900, "name": "Warhammer 40,000: Space Marine 2"},
            {"id": 3212020, "name": "Warhammer 40,000: Space Marine 2 - Original Soundtrack"},
        ],
    )

    appid, url = plugin._resolve_steam_appid_for_title("Warhammer 40,000: Space Marine")

    assert appid == 55150
    assert url == "https://store.steampowered.com/app/55150/"


def test_steam_appid_matching_resolves_valhalla_instead_of_series_or_dlc(monkeypatch) -> None:
    plugin = make_plugin()
    stub_store_search(
        monkeypatch,
        plugin,
        [
            {"id": 15100, "name": "Assassin's Creed: Director's Cut Edition"},
            {"id": 2210140, "name": "Assassin's Creed Valhalla - Dawn of Ragnarök"},
            {"id": 2208920, "name": "Assassin's Creed Valhalla"},
        ],
    )

    appid, url = plugin._resolve_steam_appid_for_title("Assassin's Creed Valhalla")

    assert appid == 2208920
    assert url == "https://store.steampowered.com/app/2208920/"


def test_steam_appid_matching_rejects_wrong_series_when_distinctive_tokens_are_missing(monkeypatch) -> None:
    plugin = make_plugin()
    stub_store_search(
        monkeypatch,
        plugin,
        [{"id": 15100, "name": "Assassin's Creed: Director's Cut Edition"}],
    )

    assert plugin._resolve_steam_appid_for_title("Assassin's Creed Valhalla") == (None, "")


def test_steam_appid_matching_rejects_variant_only_result(monkeypatch) -> None:
    plugin = make_plugin()
    stub_store_search(monkeypatch, plugin, [{"id": 123, "name": "Some Game Demo"}])

    assert plugin._resolve_steam_appid_for_title("Some Game") == (None, "")


def test_steam_appid_matching_ignores_generated_store_url_cache_but_trusts_source_url(monkeypatch) -> None:
    plugin = make_plugin()
    calls = stub_store_search(monkeypatch, plugin, [{"id": 123, "name": "X"}])

    assert plugin._resolve_steam_appid_for_title(
        "X",
        {"steam_store_url": "https://store.steampowered.com/app/999/"},
    ) == (123, "https://store.steampowered.com/app/123/")
    assert calls

    calls.clear()
    assert plugin._resolve_steam_appid_for_title(
        "X",
        {"source_url": "https://store.steampowered.com/app/999/"},
    ) == (999, "https://store.steampowered.com/app/999/")
    assert calls == []


def test_steam_appid_matching_retries_transient_store_search(monkeypatch) -> None:
    plugin = make_plugin()
    calls = []
    monkeypatch.setattr(main.time, "sleep", lambda _seconds: None)

    def fake_http_json(url: str, timeout: int = 20):
        calls.append((url, timeout))
        if len(calls) == 1:
            raise TimeoutError("temporary timeout")
        assert "store.steampowered.com/api/storesearch/" in url
        assert timeout == 12
        return {"items": [{"id": 1211020, "name": "Wobbly Life"}]}

    monkeypatch.setattr(plugin, "_http_json", fake_http_json)

    appid, url = plugin._resolve_steam_appid_for_title("Wobbly Life")

    assert appid == 1211020
    assert url == "https://store.steampowered.com/app/1211020/"
    assert len(calls) == 2


def test_non_primary_steam_title_detector_flags_variants_only() -> None:
    assert main.Plugin._is_non_primary_steam_title("Example Demo") is True
    assert main.Plugin._is_non_primary_steam_title("Example Original Soundtrack") is True
    assert main.Plugin._is_non_primary_steam_title("Example DLC") is True
    assert main.Plugin._is_non_primary_steam_title("Example Base Game") is False


def test_distinctive_tokens_present_requires_query_tokens() -> None:
    assert (
        main.Plugin._distinctive_tokens_present(
            "assassin s creed valhalla",
            "assassin s creed director s cut",
        )
        is False
    )
    assert (
        main.Plugin._distinctive_tokens_present(
            "warhammer 40 000 space marine",
            "warhammer 40 000 space marine anniversary",
        )
        is True
    )
