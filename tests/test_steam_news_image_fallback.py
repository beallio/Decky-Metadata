"""
TDD: regression test for the body-fallback in _sanitize_steam_news.

Pre-refactor behaviour: if _collected_steam_news_image_sources returns an empty
list the method fell back to _steam_news_image_candidates(raw_body_source, 0).
The scan-pipeline-refactor dropped that fallback; this test proves it must be
present.

RED  before fix  -> image_sources is []
GREEN after fix  -> image_sources is ['https://cdn.example.com/body-only.jpg']
"""
from __future__ import annotations

import main


def make_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


def test_steam_news_image_body_fallback(tmp_path, monkeypatch):
    """
    A news item with no image/image_url/image_sources/preview_image_url but
    with an image URL embedded in its raw body must still yield image_sources.
    """
    plugin = make_plugin(tmp_path, monkeypatch)

    # Craft a body containing a single image URL but no other image fields.
    body_with_image = (
        '[img]https://cdn.example.com/body-only.jpg[/img]'
    )

    items = [
        {
            "gid": "news-body-fallback",
            "id": "news-body-fallback",
            "title": "Body-only image news",
            "url": "https://store.steampowered.com/news/app/400/view/body-fallback",
            # No image / image_url / image_sources / preview_image_url
            "image": "",
            "image_url": "",
            "image_sources": [],
            "preview_image_url": "",
            "body": body_with_image,
            "summary": "A news item whose only image is embedded in its body.",
            "date": 1_700_000_000,
        }
    ]

    results = plugin._sanitize_steam_news(items)

    assert len(results) == 1, "Expected exactly one news row"
    row = results[0]
    assert row["image_sources"], (
        "image_sources must not be empty — body-fallback was dropped by scan-pipeline-refactor; "
        "restore: if not image_sources: image_sources = self._steam_news_image_candidates(raw_body_source, 0)"
    )
    assert row["image"], "image must not be empty when image_sources is non-empty"
