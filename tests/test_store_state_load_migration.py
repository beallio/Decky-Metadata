from __future__ import annotations

import asyncio
import json
from typing import Any

import main


def make_plugin(tmp_path, monkeypatch):
    monkeypatch.setattr(main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False)
    return main.Plugin()


def write_data_file(plugin: main.Plugin, metadata: dict[str, Any]) -> None:
    plugin._settings_dir.mkdir(parents=True, exist_ok=True)
    plugin._data_file.write_text(
        json.dumps(
            {
                "metadata": metadata,
                "settings": {"debug_logging": False},
            }
        ),
        encoding="utf-8",
    )


def write_delisted_index(plugin: main.Plugin, appids: list[int]) -> None:
    index_path = plugin._settings_dir / "delisted_index.json"
    index_path.write_text(
        json.dumps(
            {
                "fetched_at": 1,
                "source": main.STEAM_TRACKER_DELISTED_URL,
                "apps": [[appid, f"Delisted Game {appid}"] for appid in appids],
            }
        ),
        encoding="utf-8",
    )


def test_get_all_metadata_classifies_legacy_records_from_cached_index_only(
    tmp_path, monkeypatch
) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    write_data_file(
        plugin,
        {
            "101": {"title": "Delisted", "steam_appid": 338930},
            "102": {"title": "Not Indexed", "steam_appid": 123456},
        },
    )
    write_delisted_index(plugin, [338930])

    def fail_http(*args, **kwargs):
        raise AssertionError("metadata load must not access the network")

    monkeypatch.setattr(plugin, "_http_text", fail_http)

    metadata = asyncio.run(plugin.get_all_metadata())

    assert metadata["101"]["steam_store_state"] == "delisted"
    assert metadata["102"]["steam_store_state"] == "unknown"


def test_load_normalizes_invalid_store_states(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    write_data_file(
        plugin,
        {
            "101": {"steam_store_state": " DeLiStEd "},
            "102": {"steam_store_state": "bogus"},
        },
    )

    metadata = asyncio.run(plugin.get_all_metadata())

    assert metadata["101"]["steam_store_state"] == "delisted"
    assert metadata["102"]["steam_store_state"] == "unknown"


def test_load_preserves_valid_store_states(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    write_data_file(
        plugin,
        {
            "101": {"steam_appid": 338930, "steam_store_state": "available"},
            "102": {"steam_appid": 123456, "steam_store_state": "delisted"},
            "103": {"steam_appid": 338930, "steam_store_state": "unknown"},
        },
    )
    write_delisted_index(plugin, [338930])

    metadata = asyncio.run(plugin.get_all_metadata())

    assert metadata["101"]["steam_store_state"] == "available"
    assert metadata["102"]["steam_store_state"] == "delisted"
    assert metadata["103"]["steam_store_state"] == "unknown"


def test_load_migration_persists_once(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    write_data_file(
        plugin,
        {
            "101": {"steam_appid": 338930},
            "102": {"steam_store_state": " AVAILABLE "},
        },
    )
    write_delisted_index(plugin, [338930])
    original_save_data = plugin._save_data
    save_count = 0

    def counting_save_data() -> None:
        nonlocal save_count
        save_count += 1
        original_save_data()

    monkeypatch.setattr(plugin, "_save_data", counting_save_data)

    asyncio.run(plugin.get_all_metadata())
    persisted = json.loads(plugin._data_file.read_text(encoding="utf-8"))
    asyncio.run(plugin.get_all_metadata())

    assert persisted["metadata"]["101"]["steam_store_state"] == "delisted"
    assert persisted["metadata"]["102"]["steam_store_state"] == "available"
    assert save_count == 1


def test_get_metadata_serves_normalized_store_state(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    write_data_file(plugin, {"101": {"steam_appid": 338930}})
    write_delisted_index(plugin, [338930])

    metadata = asyncio.run(plugin.get_metadata(101))

    assert metadata is not None
    assert metadata["steam_store_state"] == "delisted"


def test_load_continues_when_store_state_migration_save_fails(
    tmp_path, monkeypatch
) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    write_data_file(plugin, {"101": {"steam_appid": 338930}})
    write_delisted_index(plugin, [338930])

    def fail_save() -> None:
        raise OSError("simulated migration save failure")

    monkeypatch.setattr(plugin, "_save_data", fail_save)

    metadata = asyncio.run(plugin.get_all_metadata())

    assert metadata["101"]["steam_store_state"] == "delisted"
