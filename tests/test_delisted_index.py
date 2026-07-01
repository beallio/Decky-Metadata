import asyncio

import main


def make_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


def test_parse_delisted_html_extracts_name_anchors_and_dedupes(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    html = """
    <tr id='app-338930' data-appid='338930' data-itemtype='game'>
      <td><a href='https://steamdb.info/app/338930'>338930</a></td>
      <td><a class='text-grey' href='https://steam-tracker.com/app/338930/'> TRANSFORMERS: Devastation</a></td>
      <td><a href='https://steam-tracker.com/ranking/1'>Purchase disabled</a></td>
    </tr>
    <tr id='app-224060' data-appid='224060' data-itemtype='game'>
      <td><a href='https://steamdb.info/app/224060'>224060</a></td>
      <td><a class='text-grey' href='https://steam-tracker.com/app/224060/'> Deadpool &amp; Friends</a></td>
    </tr>
    <tr id='app-338930' data-appid='338930' data-itemtype='game'>
      <td><a class='text-grey' href='https://steam-tracker.com/app/338930/'> Duplicate</a></td>
    </tr>
    """

    assert plugin._parse_delisted_html(html) == [
        [338930, "TRANSFORMERS: Devastation"],
        [224060, "Deadpool & Friends"],
    ]


def test_resolve_delisted_appid_matches_fuzzy_title_without_network(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    monkeypatch.setattr(
        plugin,
        "_ensure_delisted_index_sync",
        lambda force=False: {
            "apps": [
                [338930, "TRANSFORMERS: Devastation"],
                [111, "Some Other Game"],
            ]
        },
    )

    assert plugin._resolve_delisted_appid_for_title("Transformers Devastation") == 338930
    assert plugin._resolve_delisted_appid_for_title("Halo Infinite") == 0


def test_scan_missing_uses_delisted_tier_before_ign(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    calls = []

    def steam_enrich(metadata, title, limit=10):
        calls.append(dict(metadata))
        if metadata.get("steam_appid") == 338930:
            return {"title": title, "steam_appid": 338930, "source": "Steam"}
        return dict(metadata)

    def fail_ign(title):
        raise AssertionError("IGN should not run when delisted Steam tier matches")

    monkeypatch.setattr(plugin, "_metadata_with_steam_news_sync", steam_enrich)
    monkeypatch.setattr(plugin, "_resolve_delisted_appid_for_title", lambda title: 338930)
    monkeypatch.setattr(plugin, "_auto_fetch_metadata_sync", fail_ign)

    asyncio.run(plugin._scan_missing([{"appid": 1, "name": "Transformers Devastation"}]))

    assert calls == [
        {"title": "Transformers Devastation", "source": "Manual", "id": "Transformers Devastation"},
        {
            "title": "Transformers Devastation",
            "source": "Manual",
            "id": "Transformers Devastation",
            "steam_appid": 338930,
        },
    ]
    assert plugin._data["metadata"]["1"]["steam_appid"] == 338930
    assert plugin._scan_progress["assigned"] == 1
    assert plugin._scan_progress["failed"] == 0


def test_scan_missing_falls_back_to_ign_when_delisted_tier_misses(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    ign_calls = []

    monkeypatch.setattr(plugin, "_metadata_with_steam_news_sync", lambda metadata, title, limit=10: dict(metadata))
    monkeypatch.setattr(plugin, "_resolve_delisted_appid_for_title", lambda title: 0)

    def ign_match(title):
        ign_calls.append(title)
        return {"title": title, "source": "IGN", "description": "Fetched"}

    monkeypatch.setattr(plugin, "_auto_fetch_metadata_sync", ign_match)

    asyncio.run(plugin._scan_missing([{"appid": 1, "name": "Halo Infinite"}]))

    assert ign_calls == ["Halo Infinite"]
    assert plugin._data["metadata"]["1"]["source"] == "IGN"
    assert plugin._scan_progress["assigned"] == 1
    assert plugin._scan_progress["failed"] == 0
