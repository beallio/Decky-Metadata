from __future__ import annotations

import asyncio
import io

import pytest

import main
from backend.providers import community
from tests._plugin import make_plugin


CARD = """
<div class="apphub_Card" data-modal-content-url="https://steamcommunity.com/sharedfiles/filedetails/?id=111">
  <img src="https://images.steamusercontent.com/ugc/abc123?imw=128&amp;imh=72" />
  <div class="apphub_CardContentTitle">A &amp; B</div>
  <div class="apphub_CardContentAuthorName"><a>Player &amp; One</a></div>
</div>
"""


def plugin_with_metadata(metadata: dict[str, dict]) -> main.Plugin:
    plugin = make_plugin()
    plugin._data = {"metadata": metadata}
    plugin._load_data = lambda: None
    plugin._save_data = lambda: None
    return plugin


def test_parser_keeps_visual_safe_unique_cards_and_decodes_entities() -> None:
    rows = community.parse_cards(
        CARD
        + CARD
        + '<div class="apphub_Card"><img src="https://evil.example/ugc/no.jpg"></div>'
    )
    assert rows == [
        {
            "id": "111",
            "url": "https://images.steamusercontent.com/ugc/abc123?imw=512&imh=72",
            "caption": "A & B",
            "width": 0,
            "height": 0,
            "author": "Player & One",
            "link": "https://steamcommunity.com/sharedfiles/filedetails/?id=111",
        }
    ]


def test_parser_rejects_malformed_links_and_caps_results() -> None:
    unsafe = CARD.replace("steamcommunity.com/sharedfiles", "evil.example/sharedfiles")
    assert community.parse_cards(unsafe) == []
    many = "".join(
        CARD.replace("111", str(index)).replace("abc123", f"abc{index}")
        for index in range(30)
    )
    assert len(community.parse_cards(many, 99)) == 20


def test_page_clamping_and_bounded_fetch_contract() -> None:
    calls: list[tuple[str, int, int]] = []

    def http_text(url: str, timeout: int, max_bytes: int) -> str:
        calls.append((url, timeout, max_bytes))
        return CARD

    items = community.fetch_steam_fallback_items(55150, 999, http_text)
    assert items[0]["image_url"].endswith("imw=512&imh=72")
    assert "p=100" in calls[0][0]
    assert calls[0][1:] == (15, 4 * 1024 * 1024)
    assert community.community_url(0, 1) == ""


def test_metadata_converter_accepts_ign_cdn_but_scraper_converter_rejects_it() -> None:
    image = "https://assets2.ignimgs.com/2009/05/04/x-men-origins-wolverine-shot.jpg"
    screenshot = {
        "id": "ign-1",
        "url": image,
        "caption": "",
        "width": 640,
        "height": 340,
    }
    assert community.metadata_screenshots_to_fallback_items([screenshot]) == [
        {
            "id": "ign-1",
            "title": "",
            "description": "",
            "image_url": image,
            "width": 640,
            "height": 340,
            "author": "",
        }
    ]
    assert (
        community.steam_cards_to_fallback_items(
            [
                {
                    **screenshot,
                    "link": "https://steamcommunity.com/sharedfiles/filedetails/?id=1",
                }
            ]
        )
        == []
    )


def test_metadata_pages_do_not_repeat_and_omit_unsafe_urls() -> None:
    screenshots = [
        {"id": str(i), "url": f"https://cdn.example/{i}.jpg"} for i in range(25)
    ]
    screenshots.insert(20, {"id": "bad", "url": "javascript:alert(1)"})
    screenshots.insert(20, {"id": "no-host", "url": "https://"})
    first = community.metadata_screenshots_to_fallback_items(screenshots, 1)
    second = community.metadata_screenshots_to_fallback_items(screenshots, 2)
    assert len(first) == 20
    assert [item["id"] for item in second] == ["20", "21", "22", "23", "24"]


@pytest.mark.parametrize("failure", [False, True])
def test_rpc_falls_back_from_scrape_to_metadata(monkeypatch, failure: bool) -> None:
    plugin = plugin_with_metadata(
        {
            "7": {
                "steam_appid": 55150,
                "source": "IGN",
                "screenshots": [
                    {
                        "url": "https://assets1.ignimgs.com/a.jpg",
                        "width": 640,
                        "height": 340,
                    }
                ],
            }
        }
    )

    def fetch(*args):
        if failure:
            raise RuntimeError("offline")
        return []

    monkeypatch.setattr(community, "fetch_steam_fallback_items", fetch)
    result = asyncio.run(plugin.get_community_fallback_page(7, 1))
    assert result["source"] == "metadata"
    assert result["items"][0]["author"] == "IGN"


def test_rpc_prioritizes_scrape_and_skips_network_without_id(monkeypatch) -> None:
    steam_item = {
        "id": "1",
        "title": "",
        "description": "",
        "image_url": "https://images.steamusercontent.com/ugc/1?imw=512",
        "width": 0,
        "height": 0,
        "author": "A",
    }
    plugin = plugin_with_metadata(
        {
            "8": {
                "steam_appid": 55150,
                "screenshots": [{"url": "https://cdn.example/a.jpg"}],
            },
            "9": {"screenshots": [{"url": "https://cdn.example/b.jpg"}]},
            "10": {"screenshots": []},
            "11": {
                "steam_appid": -1,
                "screenshots": [{"url": "https://cdn.example/c.jpg"}],
            },
        }
    )
    calls: list[int] = []
    monkeypatch.setattr(
        community,
        "fetch_steam_fallback_items",
        lambda appid, *_: calls.append(appid) or [steam_item],
    )
    assert (
        asyncio.run(plugin.get_community_fallback_page(8, 1))["source"]
        == "steam-scrape"
    )
    assert asyncio.run(plugin.get_community_fallback_page(9, 1))["source"] == "metadata"
    assert asyncio.run(plugin.get_community_fallback_page(10, 1))["source"] == "none"
    assert asyncio.run(plugin.get_community_fallback_page(11, 1))["source"] == "metadata"
    assert calls == [55150]


def test_fetched_metadata_merge_preserves_pinned_steam_fields() -> None:
    existing = {
        "steam_appid": 123,
        "steam_store_url": "https://store.steampowered.com/app/123/",
        "steam_store_state": "delisted",
        "deck_compat_category": 2,
        "steam_news": [{"id": "n"}],
        "steam_news_enriched_at": 99,
    }
    fetched = {
        "title": "IGN title",
        "steam_appid": None,
        "steam_store_url": "",
        "steam_store_state": "unknown",
        "deck_compat_category": None,
        "steam_news": [],
        "steam_news_enriched_at": 0,
    }
    merged = main.Plugin._merge_fetched_metadata(existing, fetched)
    assert merged["title"] == "IGN title"
    for key, value in existing.items():
        assert merged[key] == value


def test_fetched_metadata_merge_does_not_preserve_non_positive_steam_id() -> None:
    fetched = {"title": "IGN title", "steam_appid": None}
    assert main.Plugin._merge_fetched_metadata(
        {"steam_appid": -1, "steam_store_url": "https://example.invalid"}, fetched
    ) == fetched


def test_apply_and_auto_fetch_save_merged_records_once(monkeypatch) -> None:
    existing = {
        "title": "Old",
        "steam_appid": 123,
        "steam_store_url": "https://store.steampowered.com/app/123/",
        "steam_store_state": "available",
        "deck_compat_category": 3,
        "steam_news": [{"id": "news"}],
        "steam_news_enriched_at": 88,
    }
    plugin = plugin_with_metadata({"7": existing})
    fetched = {
        "title": "IGN title",
        "description": "IGN description",
        "store_categories": [],
        "steam_appid": None,
    }
    monkeypatch.setattr(plugin, "_fetch_metadata_sync", lambda _slug: fetched)
    monkeypatch.setattr(plugin, "_auto_fetch_metadata_sync", lambda _title: fetched)
    saved: list[dict] = []

    async def save(_app_id: int, metadata: dict) -> dict:
        saved.append(metadata)
        return metadata

    monkeypatch.setattr(plugin, "save_metadata", save)
    applied = asyncio.run(plugin.apply_fetched_metadata(7, "ign-slug"))
    automatic = asyncio.run(plugin.auto_fetch_metadata(7, "Game"))
    assert applied and automatic
    assert len(saved) == 2
    assert all(record["steam_appid"] == 123 for record in saved)
    assert all(record["title"] == "IGN title" for record in saved)


def test_existing_save_path_still_clears_explicit_null_pin() -> None:
    plugin = plugin_with_metadata({"7": {"steam_appid": 123}})
    saved = asyncio.run(
        plugin.save_metadata(
            7,
            {
                "title": "Manual",
                "description": "",
                "store_categories": [],
                "steam_appid": None,
            },
        )
    )
    assert saved["steam_appid"] is None
    assert plugin._data["metadata"]["7"]["steam_appid"] is None


def test_http_text_rejects_content_larger_than_bound(monkeypatch) -> None:
    class Response(io.BytesIO):
        headers = {}

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

    monkeypatch.setattr(
        main.urllib.request, "urlopen", lambda *_args, **_kwargs: Response(b"12345")
    )
    with pytest.raises(ValueError, match="bounded read"):
        make_plugin()._http_text("https://example.com", max_bytes=4)


def test_community_provider_does_not_import_html_parser() -> None:
    source = community.__file__ and open(community.__file__, encoding="utf-8").read()
    assert "html.parser" not in source
