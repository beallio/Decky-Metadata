import main


def make_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


def test_sanitization_normalizes_steam_store_state(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    
    assert plugin._sanitize_metadata({})["steam_store_state"] == "unknown"
    assert plugin._sanitize_metadata({"steam_store_state": "INVALID"})["steam_store_state"] == "unknown"
    assert plugin._sanitize_metadata({"steam_store_state": ""})["steam_store_state"] == "unknown"
    assert plugin._sanitize_metadata({"steam_store_state": " DeLiStEd "})["steam_store_state"] == "delisted"


def test_sanitization_classifies_existing_delisted_records(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    
    def fake_index(force=False):
        return {"apps": [[338930, "Transformers"]]}
    
    monkeypatch.setattr(plugin, "_ensure_delisted_index_sync", fake_index)
    
    assert plugin._sanitize_metadata({"steam_appid": 338930})["steam_store_state"] == "delisted"
    assert plugin._sanitize_metadata({"steam_appid": 123456})["steam_store_state"] == "unknown"
    assert plugin._sanitize_metadata({"steam_appid": 338930, "steam_store_state": "available"})["steam_store_state"] == "available"


def test_delisted_scan_matches_persist_delisted_state(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    
    monkeypatch.setattr(plugin, "_resolve_delisted_appid_for_title", lambda title: 338930)
    monkeypatch.setattr(plugin, "_steam_news_for_appid", lambda appid, title, limit: [{"id": "1", "title": "news", "url": "url"}])
    monkeypatch.setattr(plugin, "_steam_appdetails_for_appid", lambda appid: None)
    
    result = plugin._delisted_scan_match_sync("Transformers")
    assert result["metadata"]["steam_store_state"] == "delisted"


def test_steam_appdetails_success_marks_record_available(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    
    def fake_appdetails(appid):
        return {"description": "Got from Steam!"}
    
    monkeypatch.setattr(plugin, "_steam_appdetails_for_appid", fake_appdetails)
    monkeypatch.setattr(plugin, "_steam_deck_compat_for_appid", lambda appid: 1)
    monkeypatch.setattr(plugin, "_steam_news_for_appid", lambda appid, title, limit: [])
    
    result = plugin._metadata_with_steam_news_sync({"steam_appid": 123, "title": "A Game"}, "A Game")
    assert result["steam_store_state"] == "available"
    assert result["description"] == "Got from Steam!"
    
    result2 = plugin._metadata_with_steam_news_sync({"steam_appid": 123, "title": "A Game", "steam_store_state": "delisted"}, "A Game")
    assert result2["steam_store_state"] == "delisted"
