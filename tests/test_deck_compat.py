from __future__ import annotations

import asyncio
import json

import pytest

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


def test_steam_deck_compat_lookup_marks_a_missing_category_field_as_failed(monkeypatch) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(
        plugin,
        "_http_json",
        lambda _url, timeout=20: {"success": 1, "results": {}},
    )

    lookup = plugin._steam_deck_compat_lookup_for_appid(123)

    assert lookup.status == "failed"
    assert lookup.category is None


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


def test_sanitize_metadata_round_trips_all_manual_compatibility_overrides() -> None:
    plugin = make_plugin()

    for category in (0, 1, 2, 3):
        sanitized = plugin._sanitize_metadata(
            {
                "title": "Example",
                "description": "",
                "store_categories": [],
                "deck_compat_override": str(category),
            }
        )

        assert sanitized["deck_compat_override"] == category


def test_sanitize_metadata_drops_invalid_manual_compatibility_override() -> None:
    plugin = make_plugin()

    for invalid in (-1, 4, "bad", None):
        sanitized = plugin._sanitize_metadata(
            {
                "title": "Example",
                "description": "",
                "store_categories": [],
                "deck_compat_override": invalid,
            }
        )

        assert sanitized["deck_compat_override"] is None


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


def test_metadata_with_steam_news_sync_keeps_manual_compatibility_override(monkeypatch) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(
        plugin,
        "_steam_news_for_metadata",
        lambda metadata, title, limit=6: (123, "https://store.steampowered.com/app/123", []),
    )
    monkeypatch.setattr(plugin, "_steam_deck_compat_for_appid", lambda steam_appid: 3)

    enriched = plugin._metadata_with_steam_news_sync(
        {
            "title": "Example",
            "description": "",
            "store_categories": [],
            "deck_compat_override": 0,
        },
        "Example",
    )

    assert enriched["deck_compat_category"] == 3
    assert enriched["deck_compat_override"] == 0


def test_sanitize_metadata_preserves_follow_valve_override() -> None:
    plugin = make_plugin()

    sanitized = plugin._sanitize_metadata(
        {
            "title": "Example",
            "description": "",
            "store_categories": [],
            "deck_compat_override": "valve",
        }
    )

    assert sanitized["deck_compat_override"] == "valve"


def test_refresh_drops_stale_valve_category_when_the_match_changes(monkeypatch) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(
        plugin,
        "_steam_news_for_metadata",
        lambda metadata, title, limit=6: (456, "https://store.steampowered.com/app/456", []),
    )
    monkeypatch.setattr(plugin, "_steam_deck_compat_for_appid", lambda steam_appid: None)

    refreshed = plugin._metadata_with_steam_news_sync(
        {
            "title": "Example",
            "description": "",
            "store_categories": [],
            "steam_appid": 123,
            "deck_compat_category": 3,
            "deck_compat_override": "valve",
        },
        "Example",
    )

    assert refreshed["steam_appid"] == 456
    assert refreshed["deck_compat_category"] is None
    assert refreshed["deck_compat_override"] == "valve"


def test_refresh_keeps_last_known_category_when_the_same_match_fetch_fails(monkeypatch) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(
        plugin,
        "_steam_news_for_metadata",
        lambda metadata, title, limit=6: (123, "https://store.steampowered.com/app/123", []),
    )

    def fail_http_json(_url: str, timeout: int = 20):
        raise OSError("temporary network failure")

    monkeypatch.setattr(plugin, "_http_json", fail_http_json)

    refreshed = plugin._metadata_with_steam_news_sync(
        {
            "title": "Example",
            "description": "",
            "store_categories": [],
            "steam_appid": 123,
            "deck_compat_category": 2,
        },
        "Example",
    )

    assert refreshed["deck_compat_category"] == 2


def test_refresh_keeps_last_known_unknown_when_the_same_match_fetch_fails(monkeypatch) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(
        plugin,
        "_steam_news_for_metadata",
        lambda metadata, title, limit=6: (123, "https://store.steampowered.com/app/123", []),
    )
    monkeypatch.setattr(plugin, "_http_json", lambda _url, timeout=20: (_ for _ in ()).throw(OSError("offline")))

    refreshed = plugin._metadata_with_steam_news_sync(
        {
            "title": "Example",
            "description": "",
            "store_categories": [],
            "steam_appid": 123,
            "deck_compat_category": 0,
        },
        "Example",
    )

    assert refreshed["deck_compat_category"] == 0


@pytest.mark.parametrize("category", [0, 2])
def test_refresh_keeps_last_known_category_when_the_same_match_payload_is_malformed(
    monkeypatch, category: int
) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(
        plugin,
        "_steam_news_for_metadata",
        lambda metadata, title, limit=6: (123, "https://store.steampowered.com/app/123", []),
    )
    monkeypatch.setattr(
        plugin,
        "_http_json",
        lambda _url, timeout=20: {"success": 1, "results": {}},
    )

    refreshed = plugin._metadata_with_steam_news_sync(
        {
            "title": "Example",
            "description": "",
            "store_categories": [],
            "steam_appid": 123,
            "deck_compat_category": category,
        },
        "Example",
    )

    assert refreshed["deck_compat_category"] == category


def test_refresh_clears_the_category_when_valve_authoritatively_reports_none(monkeypatch) -> None:
    plugin = make_plugin()
    monkeypatch.setattr(
        plugin,
        "_steam_news_for_metadata",
        lambda metadata, title, limit=6: (123, "https://store.steampowered.com/app/123", []),
    )
    monkeypatch.setattr(
        plugin,
        "_http_json",
        lambda _url, timeout=20: {"success": 1, "results": {"resolved_category": None}},
    )

    refreshed = plugin._metadata_with_steam_news_sync(
        {
            "title": "Example",
            "description": "",
            "store_categories": [],
            "steam_appid": 123,
            "deck_compat_category": 2,
        },
        "Example",
    )

    assert refreshed["deck_compat_category"] is None


def make_settings_plugin(tmp_path, monkeypatch) -> main.Plugin:
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


def test_compatibility_default_loads_missing_or_invalid_values_as_automatic(tmp_path, monkeypatch) -> None:
    plugin = make_settings_plugin(tmp_path, monkeypatch)
    plugin._settings_dir.mkdir(parents=True, exist_ok=True)
    plugin._data_file.write_text(
        json.dumps({"settings": {"debug_logging": True, "deck_compat_default": True}}),
        encoding="utf-8",
    )

    assert asyncio.run(plugin.get_compatibility_default()) is None
    assert plugin._data["settings"]["debug_logging"] is True


def test_compatibility_default_persists_and_rejects_invalid_writes_without_mutation(tmp_path, monkeypatch) -> None:
    plugin = make_settings_plugin(tmp_path, monkeypatch)

    assert asyncio.run(plugin.set_compatibility_default(3)) == 3
    with pytest.raises(ValueError, match="invalid compatibility default"):
        asyncio.run(plugin.set_compatibility_default(True))
    with pytest.raises(ValueError, match="invalid compatibility default"):
        asyncio.run(plugin.set_compatibility_default("2"))

    assert asyncio.run(plugin.get_compatibility_default()) == 3
    persisted = json.loads(plugin._data_file.read_text(encoding="utf-8"))
    assert persisted["settings"]["deck_compat_default"] == 3

    fresh = make_settings_plugin(tmp_path, monkeypatch)
    assert asyncio.run(fresh.get_compatibility_default()) == 3


def test_failed_compatibility_default_save_keeps_the_confirmed_value(tmp_path, monkeypatch) -> None:
    plugin = make_settings_plugin(tmp_path, monkeypatch)
    asyncio.run(plugin.set_compatibility_default(2))
    original_save = plugin._save_data

    def fail_save() -> None:
        raise OSError("simulated write failure")

    monkeypatch.setattr(plugin, "_save_data", fail_save)
    with pytest.raises(OSError, match="simulated write failure"):
        asyncio.run(plugin.set_compatibility_default(3))

    assert plugin._data["settings"]["deck_compat_default"] == 2
    monkeypatch.setattr(plugin, "_save_data", original_save)
    assert asyncio.run(plugin.get_compatibility_default()) == 2


def test_compatibility_default_scope_loads_non_boolean_values_as_disabled(tmp_path, monkeypatch) -> None:
    plugin = make_settings_plugin(tmp_path, monkeypatch)
    plugin._settings_dir.mkdir(parents=True, exist_ok=True)
    plugin._data_file.write_text(
        json.dumps(
            {
                "settings": {
                    "debug_logging": True,
                    "deck_compat_default": 3,
                    "deck_compat_default_matched_only": "yes",
                }
            }
        ),
        encoding="utf-8",
    )

    assert asyncio.run(plugin.get_compatibility_default_matched_only()) is False
    assert asyncio.run(plugin.get_compatibility_default()) == 3
    assert plugin._data["settings"]["debug_logging"] is True


def test_legacy_settings_without_the_scope_key_are_not_rewritten(tmp_path, monkeypatch) -> None:
    plugin = make_settings_plugin(tmp_path, monkeypatch)
    plugin._settings_dir.mkdir(parents=True, exist_ok=True)
    plugin._data_file.write_text(
        json.dumps({"settings": {"debug_logging": False, "deck_compat_default": 2}}),
        encoding="utf-8",
    )

    assert asyncio.run(plugin.get_compatibility_default_matched_only()) is False
    assert "deck_compat_default_matched_only" not in plugin._data["settings"]


def test_compatibility_default_scope_persists_and_rejects_invalid_writes(tmp_path, monkeypatch) -> None:
    plugin = make_settings_plugin(tmp_path, monkeypatch)

    assert asyncio.run(plugin.set_compatibility_default_matched_only(True)) is True
    for invalid in (1, "true", None):
        with pytest.raises(ValueError, match="invalid compatibility default scope"):
            asyncio.run(plugin.set_compatibility_default_matched_only(invalid))

    assert asyncio.run(plugin.get_compatibility_default_matched_only()) is True
    persisted = json.loads(plugin._data_file.read_text(encoding="utf-8"))
    assert persisted["settings"]["deck_compat_default_matched_only"] is True

    fresh = make_settings_plugin(tmp_path, monkeypatch)
    assert asyncio.run(fresh.get_compatibility_default_matched_only()) is True


def test_failed_compatibility_default_scope_save_keeps_the_confirmed_value(tmp_path, monkeypatch) -> None:
    plugin = make_settings_plugin(tmp_path, monkeypatch)
    asyncio.run(plugin.set_compatibility_default_matched_only(True))
    original_save = plugin._save_data

    def fail_save() -> None:
        raise OSError("simulated write failure")

    monkeypatch.setattr(plugin, "_save_data", fail_save)
    with pytest.raises(OSError, match="simulated write failure"):
        asyncio.run(plugin.set_compatibility_default_matched_only(False))

    assert plugin._data["settings"]["deck_compat_default_matched_only"] is True
    monkeypatch.setattr(plugin, "_save_data", original_save)
    assert asyncio.run(plugin.get_compatibility_default_matched_only()) is True


def test_steam_appid_reassignment_clears_old_provider_category_and_keeps_follow_valve(tmp_path, monkeypatch) -> None:
    plugin = make_settings_plugin(tmp_path, monkeypatch)
    original = asyncio.run(
        plugin.save_metadata(
            100,
            {
                "title": "Example",
                "steam_appid": 123,
                "deck_compat_category": 3,
                "deck_compat_override": "valve",
            },
        )
    )
    reassigned = asyncio.run(
        plugin.save_metadata(
            100,
            {
                **original,
                "steam_appid": 456,
                # A full editor form can still contain the old category.
                "deck_compat_category": 3,
            },
        )
    )

    assert reassigned["steam_appid"] == 456
    assert reassigned["deck_compat_category"] is None
    assert reassigned["deck_compat_override"] == "valve"


def test_editor_match_removal_clears_old_provider_category_and_keeps_follow_valve(tmp_path, monkeypatch) -> None:
    plugin = make_settings_plugin(tmp_path, monkeypatch)
    original = asyncio.run(
        plugin.save_metadata(
            100,
            {
                "title": "Example",
                "steam_appid": 123,
                "deck_compat_category": 3,
                "deck_compat_override": "valve",
            },
        )
    )

    removed = asyncio.run(
        plugin.save_metadata(
            100,
            {
                **original,
                "steam_appid": None,
                # A full editor form can still carry data from the removed match.
                "deck_compat_category": 3,
            },
        )
    )

    assert removed["steam_appid"] is None
    assert removed["deck_compat_category"] is None
    assert removed["deck_compat_override"] == "valve"


def test_scan_save_preserves_a_sanitized_follow_valve_choice(tmp_path, monkeypatch) -> None:
    plugin = make_settings_plugin(tmp_path, monkeypatch)
    asyncio.run(plugin.save_metadata(100, {
        "title": "Example",
        "deck_compat_override": "valve",
        "store_categories": [],
    }))
    provider_result = plugin._sanitize_metadata({
        "title": "Example",
        "description": "Provider result",
        "store_categories": [],
        "deck_compat_override": None,
    })

    asyncio.run(plugin._save_scan_pipeline_metadata(100, provider_result))

    assert plugin._data["metadata"]["100"]["deck_compat_override"] == "valve"


def test_scan_save_uses_the_latest_choice_when_an_editor_save_wins_the_race(tmp_path, monkeypatch) -> None:
    plugin = make_settings_plugin(tmp_path, monkeypatch)
    asyncio.run(plugin.save_metadata(100, {
        "title": "Example",
        "deck_compat_override": "valve",
        "store_categories": [],
    }))
    provider_result = plugin._sanitize_metadata({
        "title": "Example",
        "description": "Provider result",
        "store_categories": [],
        "deck_compat_override": None,
    })
    asyncio.run(plugin.save_metadata(100, {
        "title": "Example",
        "deck_compat_override": 0,
        "store_categories": [],
    }))

    asyncio.run(plugin._save_scan_pipeline_metadata(100, provider_result))

    assert plugin._data["metadata"]["100"]["deck_compat_override"] == 0


def test_scan_save_keeps_a_trusted_category_for_a_new_steam_match(tmp_path, monkeypatch) -> None:
    plugin = make_settings_plugin(tmp_path, monkeypatch)
    asyncio.run(plugin.save_metadata(100, {
        "title": "Example",
        "steam_appid": 123,
        "deck_compat_category": 3,
        "deck_compat_override": "valve",
        "store_categories": [],
    }))

    asyncio.run(plugin._save_scan_pipeline_metadata(100, {
        "title": "Example",
        "steam_appid": 456,
        "deck_compat_category": 2,
        "deck_compat_override": None,
        "store_categories": [],
    }))

    saved = plugin._data["metadata"]["100"]
    assert saved["steam_appid"] == 456
    assert saved["deck_compat_category"] == 2
    assert saved["deck_compat_override"] == "valve"
