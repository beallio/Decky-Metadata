import asyncio

import main
from tests._plugin import make_plugin


def _plugin_with_metadata(metadata: dict[str, dict]) -> main.Plugin:
    plugin = make_plugin()
    plugin._data = {"metadata": metadata}
    plugin._load_data = lambda: None
    plugin._save_data = lambda: None
    return plugin


def test_parse_steam_community_ugc_keeps_visual_cards_only() -> None:
    plugin = make_plugin()
    html_text = """
      <div class="apphub_Card" data-modal-content-url="https://steamcommunity.com/sharedfiles/filedetails/?id=111">
        <a class="apphub_CardContentLink" href="https://steamcommunity.com/sharedfiles/filedetails/?id=111">
          <img class="apphub_CardContentPreviewImage" src="https://images.steamusercontent.com/ugc/abc123?imw=128&amp;imh=72" />
        </a>
        <div class="apphub_CardContentTitle">A better screenshot</div>
        <div class="apphub_CardContentAuthorName"><a href="/id/player">Player &amp; One</a></div>
      </div>
      <div class="apphub_Card">
        <a href="https://steamcommunity.com/app/55150/discussions/0/123">Discussion</a>
        <div class="apphub_CardContentTitle">Question</div>
      </div>
    """

    assert plugin._parse_steam_community_ugc(html_text) == [
        {
            "id": "111",
            "url": "https://images.steamusercontent.com/ugc/abc123?imw=512&imh=72",
            "caption": "A better screenshot",
            "width": 0,
            "height": 0,
            "author": "Player & One",
            "link": "https://steamcommunity.com/sharedfiles/filedetails/?id=111",
        }
    ]


def test_enrich_community_media_uses_steam_ugc_for_matched_game(monkeypatch) -> None:
    steam_items = [
        {
            "id": "111",
            "url": "https://images.steamusercontent.com/ugc/one?imw=512",
            "caption": "Shot one",
            "width": 0,
            "height": 0,
            "author": "Alice",
            "link": "https://steamcommunity.com/sharedfiles/filedetails/?id=111",
        },
        {
            "id": "222",
            "url": "https://images.steamusercontent.com/ugc/two?imw=512",
            "caption": "Shot two",
            "width": 0,
            "height": 0,
            "author": "Bob",
            "link": "https://steamcommunity.com/sharedfiles/filedetails/?id=222",
        },
    ]
    plugin = _plugin_with_metadata(
        {
            "7": {
                "title": "Steam Game",
                "steam_appid": 55150,
                "community_videos": [{"id": "abcdefghijk"}],
            }
        }
    )
    monkeypatch.setattr(main, "now", lambda: 1000)
    monkeypatch.setattr(plugin, "_steam_community_ugc_for_appid", lambda appid, page=1, limit=20: steam_items)
    monkeypatch.setattr(plugin, "_youtube_videos_for_title", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("YouTube should not be called")))
    monkeypatch.setattr(plugin, "_rawg_images_for_title", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("RAWG should not be called")))

    saved = plugin._enrich_community_media_sync(7, "", "")

    assert saved is not None
    assert saved["community_images"] == steam_items
    assert saved["community_videos"] == []
    assert saved["community_enriched_at"] == 1000


def test_enrich_community_media_falls_back_to_stored_steam_screenshots(monkeypatch) -> None:
    screenshot = {
        "id": "stored-shot",
        "url": "https://cdn.example/stored.jpg",
        "caption": "Stored",
        "width": 1280,
        "height": 720,
    }
    plugin = _plugin_with_metadata(
        {
            "8": {
                "title": "Steam Game",
                "steam_appid": 55150,
                "screenshots": [screenshot],
                "community_images": [{"id": "old", "url": "https://cdn.example/old.jpg"}],
            }
        }
    )
    monkeypatch.setattr(main, "now", lambda: 2000)
    monkeypatch.setattr(plugin, "_steam_community_ugc_for_appid", lambda appid, page=1, limit=20: [])

    saved = plugin._enrich_community_media_sync(8, "", "")

    assert saved is not None
    assert saved["community_images"] == [screenshot]
    assert saved["community_videos"] == []


def test_enrich_community_media_clears_unmatched_game_without_legacy_calls(monkeypatch) -> None:
    plugin = _plugin_with_metadata(
        {
            "9": {
                "title": "Unmatched Game",
                "community_images": [{"id": "old", "url": "https://cdn.example/old.jpg"}],
                "community_videos": [{"id": "abcdefghijk"}],
            }
        }
    )
    monkeypatch.setattr(main, "now", lambda: 3000)
    monkeypatch.setattr(plugin, "_youtube_videos_for_title", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("YouTube should not be called")))
    monkeypatch.setattr(plugin, "_rawg_images_for_title", lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("RAWG should not be called")))

    saved = plugin._enrich_community_media_sync(9, "", "")

    assert saved is not None
    assert saved["community_images"] == []
    assert saved["community_videos"] == []


def test_get_steam_community_page_returns_empty_for_unknown_app() -> None:
    plugin = _plugin_with_metadata({})

    assert asyncio.run(plugin.get_steam_community_page(123, 2)) == {"items": []}


def test_get_steam_community_page_fetches_requested_page(monkeypatch) -> None:
    steam_items = [
        {
            "id": "333",
            "url": "https://images.steamusercontent.com/ugc/three?imw=512",
            "caption": "Third",
            "width": 0,
            "height": 0,
            "author": "Carol",
            "link": "https://steamcommunity.com/sharedfiles/filedetails/?id=333",
        }
    ]
    plugin = _plugin_with_metadata({"10": {"title": "Steam Game", "steam_appid": 55150}})
    calls: list[tuple[int, int, int]] = []

    def fake_fetch(appid: int, page: int = 1, limit: int = 20) -> list[dict]:
        calls.append((appid, page, limit))
        return steam_items

    monkeypatch.setattr(plugin, "_steam_community_ugc_for_appid", fake_fetch)

    assert asyncio.run(plugin.get_steam_community_page(10, 3)) == {
        "items": steam_items,
        "page": 3,
    }
    assert calls == [(55150, 3, 20)]
