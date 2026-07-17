from __future__ import annotations

import asyncio
import json
import threading

import main
from tests.updater_helpers import FakeClient


def make_plugin(tmp_path, monkeypatch) -> main.Plugin:
    monkeypatch.setattr(
        main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False
    )
    plugin = main.Plugin()
    loaded = plugin._load_data()
    plugin._updater.load_state(
        plugin._data["update_settings"],
        {"update_check_cache": plugin._data["update_check_cache"]},
    )
    if loaded:
        plugin._updater.reconcile_pending_install("0.3.1")
    return plugin


def test_check_record_and_fresh_plugin_reload_round_trip(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    plugin._updater._client = FakeClient()
    result = asyncio.run(plugin.check_for_plugin_update("0.3.1", True))
    assert result["status"] == "available"
    candidate = {**result["candidate"], "updateTraceId": "trace-1"}
    recorded = asyncio.run(plugin.record_update_install_requested(candidate))
    assert recorded["effective_installed_version"] == "0.4.0"

    fresh = make_plugin(tmp_path, monkeypatch)
    context = asyncio.run(fresh.get_update_check_context())
    assert context["pending_update_install"]["version"] == "0.4.0"
    assert context["pending_update_install"]["update_trace_id"] == "trace-1"


def test_shared_data_lock_is_reentrant(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    with plugin._data_lock:
        assert plugin._data_lock.acquire(blocking=False)
        plugin._data_lock.release()


def test_corrupt_startup_file_is_not_rewritten(tmp_path, monkeypatch) -> None:
    data_file = tmp_path / "decky_metadata.json"
    original = b'{"metadata": invalid json}'
    data_file.write_bytes(original)
    monkeypatch.setattr(
        main.decky, "DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path), raising=False
    )
    monkeypatch.setattr(
        main.decky, "DECKY_PLUGIN_LOG_DIR", str(tmp_path / "logs"), raising=False
    )
    plugin = main.Plugin()
    asyncio.run(plugin._main())
    assert data_file.read_bytes() == original


def test_updater_save_racing_metadata_save_preserves_both(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    barrier = threading.Barrier(2)

    def update_settings() -> None:
        barrier.wait()
        plugin._updater.set_channel("development")

    def update_metadata() -> None:
        barrier.wait()
        asyncio.run(plugin.save_metadata(7, {"title": "Race"}))

    threads = [threading.Thread(target=update_settings), threading.Thread(target=update_metadata)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=2)
        assert not thread.is_alive()

    payload = json.loads(plugin._data_file.read_text(encoding="utf-8"))
    assert payload["update_settings"]["update_channel"] == "development"
    assert payload["metadata"]["7"]["title"] == "Race"


def test_updater_save_racing_activity_save_preserves_both(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)
    barrier = threading.Barrier(2)

    def update_settings() -> None:
        barrier.wait()
        plugin._updater.set_automatic_checks(False)

    def update_activity() -> None:
        barrier.wait()
        asyncio.run(plugin._save_activity_pipeline_metadata(9, {"title": "Activity"}))

    threads = [threading.Thread(target=update_settings), threading.Thread(target=update_activity)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=2)
        assert not thread.is_alive()

    payload = json.loads(plugin._data_file.read_text(encoding="utf-8"))
    assert payload["update_settings"]["automatic_update_checks"] is False
    assert payload["metadata"]["9"]["title"] == "Activity"


def test_unexpected_updater_exception_returns_failed_envelope(tmp_path, monkeypatch) -> None:
    plugin = make_plugin(tmp_path, monkeypatch)

    class ExplodingClient(FakeClient):
        def list_releases(self):
            raise RuntimeError("boom")

    plugin._updater._client = ExplodingClient()
    result = asyncio.run(plugin.check_for_plugin_update("0.3.1", True))
    assert result["status"] == "failed"
    assert result["checked_at"]
    assert "boom" in result["message"]
