import main
from tests._plugin import make_plugin


def test_steam_appdetails_for_appid_returns_community_images_from_screenshots(monkeypatch) -> None:
    plugin = make_plugin()
    appid = 15100

    def fake_http_json(url: str, timeout: int = 20):
        assert url == "https://store.steampowered.com/api/appdetails?appids=15100&l=english"
        assert timeout == 12
        return {
            str(appid): {
                "success": True,
                "data": {
                    "name": "Steam Game",
                    "screenshots": [
                        {
                            "id": 1,
                            "path_thumbnail": "https://cdn.example/thumb.jpg",
                            "path_full": "https://cdn.example/full.jpg",
                        },
                        {
                            "id": 2,
                            "path_thumbnail": "https://cdn.example/missing.jpg",
                        },
                    ],
                },
            }
        }

    monkeypatch.setattr(plugin, "_http_json", fake_http_json)

    details = plugin._steam_appdetails_for_appid(appid)

    assert details is not None
    assert details["community_images"] == details["screenshots"]
    assert details["community_images"] == [
        {
            "id": "1",
            "url": "https://cdn.example/full.jpg",
            "caption": "",
            "width": 0,
            "height": 0,
        }
    ]


def test_metadata_with_steam_news_sync_uses_steam_images_and_clears_videos(monkeypatch) -> None:
    plugin = make_plugin()
    steam_image = {
        "id": "steam-shot",
        "url": "https://cdn.example/steam-full.jpg",
        "caption": "",
        "width": 0,
        "height": 0,
    }

    monkeypatch.setattr(main, "now", lambda: 1234567890)
    monkeypatch.setattr(
        plugin,
        "_steam_news_for_metadata",
        lambda metadata, title, limit=6: (15100, "https://store.steampowered.com/app/15100/", []),
    )
    monkeypatch.setattr(plugin, "_steam_deck_compat_for_appid", lambda steam_appid: None)
    monkeypatch.setattr(
        plugin,
        "_steam_appdetails_for_appid",
        lambda steam_appid: {"community_images": [steam_image]},
    )

    enriched = plugin._metadata_with_steam_news_sync(
        {
            "title": "IGN Game",
            "source": "IGN",
            "community_images": [
                {
                    "id": "ign-shot",
                    "url": "https://cdn.example/ign-full.jpg",
                    "caption": "",
                    "width": 0,
                    "height": 0,
                }
            ],
            "community_videos": [
                {
                    "id": "abcdefghijk",
                    "title": "YouTube tile",
                    "thumbnail": "https://cdn.example/youtube.jpg",
                }
            ],
            "community_enriched_at": 42,
        },
        "IGN Game",
    )

    assert enriched["community_images"] == [steam_image]
    assert enriched["community_videos"] == []
    assert enriched["community_enriched_at"] == 1234567890


def test_metadata_with_steam_news_sync_keeps_community_media_without_appdetails(monkeypatch) -> None:
    plugin = make_plugin()
    original_image = {
        "id": "ign-shot",
        "url": "https://cdn.example/ign-full.jpg",
        "caption": "",
        "width": 0,
        "height": 0,
    }
    original_video = {
        "id": "abcdefghijk",
        "title": "YouTube tile",
        "url": "https://www.youtube.com/watch?v=abcdefghijk",
        "thumbnail": "https://cdn.example/youtube.jpg",
        "source": "YouTube",
    }

    monkeypatch.setattr(main, "now", lambda: 1234567890)
    monkeypatch.setattr(
        plugin,
        "_steam_news_for_metadata",
        lambda metadata, title, limit=6: (15100, "https://store.steampowered.com/app/15100/", []),
    )
    monkeypatch.setattr(plugin, "_steam_deck_compat_for_appid", lambda steam_appid: None)
    monkeypatch.setattr(plugin, "_steam_appdetails_for_appid", lambda steam_appid: None)

    enriched = plugin._metadata_with_steam_news_sync(
        {
            "title": "IGN Game",
            "source": "IGN",
            "community_images": [original_image],
            "community_videos": [original_video],
            "community_enriched_at": 42,
        },
        "IGN Game",
    )

    assert enriched["community_images"] == [original_image]
    assert enriched["community_videos"] == [original_video]
    assert enriched["community_enriched_at"] == 42
