import asyncio
import main

def make_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    # mock delisted index fetch to avoid network
    monkeypatch.setattr(main.Plugin, "_ensure_delisted_index_sync", lambda self, force=False: None)
    return main.Plugin()

def test_appid_only_steam_match_is_missing(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    
    def steam_match_appid_only(metadata, title, limit=10):
        m = dict(metadata)
        m["steam_appid"] = 123
        m["source"] = "Manual"
        m.pop("description", None)
        return m
    
    monkeypatch.setattr(plugin, "_metadata_with_steam_news_sync", steam_match_appid_only)
    monkeypatch.setattr(plugin, "_auto_fetch_metadata_sync", lambda title: None)
    
    games = [{"appid": 1, "name": "Appid Only Game"}]
    asyncio.run(plugin._scan_missing(games))
    
    # Assert persisted
    assert "1" in plugin._data["metadata"]
    assert plugin._data["metadata"]["1"]["steam_appid"] == 123
    
    # Assert not assigned
    assert plugin._scan_progress["assigned"] == 0
    assert plugin._scan_progress["failed"] == 1
    
    # Assert missing metadata count
    assert asyncio.run(plugin.get_missing_metadata_count(games)) == 1

def test_delisted_appid_only_match_is_missing(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    
    def mock_resolve_delisted(title):
        return 456
        
    def steam_match_appid_only(metadata, title, limit=10):
        m = dict(metadata)
        m.pop("description", None)
        return m
        
    monkeypatch.setattr(plugin, "_resolve_delisted_appid_for_title", mock_resolve_delisted)
    monkeypatch.setattr(plugin, "_metadata_with_steam_news_sync", steam_match_appid_only)
    monkeypatch.setattr(plugin, "_auto_fetch_metadata_sync", lambda title: None)
    
    games = [{"appid": 1, "name": "Delisted Game"}]
    asyncio.run(plugin._scan_missing(games))
    
    assert "1" in plugin._data["metadata"]
    assert plugin._data["metadata"]["1"]["steam_appid"] == 456
    
    assert plugin._scan_progress["assigned"] == 0
    assert plugin._scan_progress["failed"] == 1
    assert asyncio.run(plugin.get_missing_metadata_count(games)) == 1

def test_ign_backfill_completes_appid_only(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    
    def steam_match_appid_only(metadata, title, limit=10):
        m = dict(metadata)
        if "steam_appid" not in m:
            m["steam_appid"] = 123
            m["source"] = "Manual"
        return m
        
    def ign_match(title):
        return {"title": title, "source": "IGN", "description": "IGN Desc"}
        
    monkeypatch.setattr(plugin, "_metadata_with_steam_news_sync", steam_match_appid_only)
    monkeypatch.setattr(plugin, "_auto_fetch_metadata_sync", ign_match)
    
    games = [{"appid": 1, "name": "Backfill Game"}]
    asyncio.run(plugin._scan_missing(games))
    
    m = plugin._data["metadata"]["1"]
    assert m["steam_appid"] == 123
    assert m["description"] == "IGN Desc"
    assert m["source"] == "IGN"
    
    assert plugin._scan_progress["assigned"] == 1
    assert plugin._scan_progress["failed"] == 0
    assert asyncio.run(plugin.get_missing_metadata_count(games)) == 0

def test_full_reconciliation_invariant(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    
    def mock_resolve_delisted(title):
        if title == "Delisted": return 456
        return None
        
    def mock_steam(metadata, title, limit=10):
        m = dict(metadata)
        if title == "Steam Complete":
            m["steam_appid"] = 123
            m["source"] = "Steam"
            m["description"] = "Full steam desc"
        elif title == "Delisted":
            m.pop("description", None)
        return m
        
    monkeypatch.setattr(plugin, "_resolve_delisted_appid_for_title", mock_resolve_delisted)
    monkeypatch.setattr(plugin, "_metadata_with_steam_news_sync", mock_steam)
    monkeypatch.setattr(plugin, "_auto_fetch_metadata_sync", lambda title: None)
    
    games = [
        {"appid": 1, "name": "Steam Complete"},
        {"appid": 2, "name": "Delisted"},
        {"appid": 3, "name": "Miss"}
    ]
    
    asyncio.run(plugin._scan_missing(games))
    
    missing = asyncio.run(plugin.get_missing_metadata_count(games))
    assigned = plugin._scan_progress["assigned"]
    failed = plugin._scan_progress["failed"]
    total = plugin._scan_progress["total"]
    
    assert assigned == total - missing
    assert assigned + failed == total
    assert assigned == 1
    assert missing == 2

def test_predicate_delegation(tmp_path, monkeypatch):
    plugin = make_plugin(tmp_path, monkeypatch)
    
    assert plugin._metadata_needs_scan(1) is True
    
    plugin._data["metadata"]["2"] = {"title": "T", "source": "Steam", "description": "D"}
    assert plugin._metadata_needs_scan(2) is False
    
    plugin._data["metadata"]["3"] = {"title": "T", "source": "Manual"}
    assert plugin._metadata_needs_scan(3) is True
    
    plugin._data["metadata"]["4"] = {"title": "T", "source": "Manual", "steam_appid": 123}
    assert plugin._metadata_needs_scan(4) is True
