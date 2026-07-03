from __future__ import annotations

import asyncio
from typing import Any

from tests._plugin import make_plugin


def _scan_filter_count(plugin: Any, games: list[Any]) -> int:
    count = 0
    for game in games:
        if not isinstance(game, dict):
            continue
        raw_appid = str(game.get("appid", "")).strip()
        if not raw_appid:
            continue
        try:
            app_id = int(raw_appid)
        except (TypeError, ValueError):
            continue
        if plugin._metadata_needs_scan(app_id):
            count += 1
    return count


def test_missing_metadata_count_matches_scan_filter_for_shells_and_bad_appids() -> None:
    plugin = make_plugin(
        _data={
            "metadata": {
                "202": {
                    "title": "Complete Game",
                    "source": "Steam",
                    "description": "A complete metadata entry.",
                },
                "303": {
                    "title": "Manual Shell",
                    "source": "Manual",
                    "description": "",
                },
            }
        },
        _load_data=lambda: None,
    )
    games = [
        {"appid": "101", "name": "No Entry"},
        {"appid": "202", "name": "Complete Game"},
        {"appid": "303", "name": "Manual Shell"},
        {"appid": "not-a-number", "name": "Bad App ID"},
        {"appid": "", "name": "Blank App ID"},
        "not a game",
    ]

    count = asyncio.run(plugin.get_missing_metadata_count(games))

    assert count == 2
    assert count == _scan_filter_count(plugin, games)
