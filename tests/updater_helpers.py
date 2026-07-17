from __future__ import annotations

import datetime
import threading
import time
from typing import Any

from backend.updater.models import JsonResponse
from backend.updater.updater import PluginUpdater


NOW = datetime.datetime(2026, 7, 17, 12, 0, tzinfo=datetime.timezone.utc)


def manifest(version: str = "0.4.0", *, channel: str = "stable", **overrides: Any):
    tag = f"v{version}"
    payload = {
        "schemaVersion": 1,
        "pluginName": "Decky Metadata",
        "packageName": "decky-metadata",
        "version": version,
        "sourceVersion": version,
        "tag": tag,
        "channel": channel,
        "assetName": f"Decky-Metadata-{tag}.zip",
        "sha256": "a" * 64,
        "generatedAt": NOW.isoformat(),
    }
    payload.update(overrides)
    return payload


def release(version: str = "0.4.0", *, prerelease: bool = False, **overrides: Any):
    tag = f"v{version}"
    payload = {
        "draft": False,
        "prerelease": prerelease,
        "tag_name": tag,
        "html_url": f"https://example.test/releases/{tag}",
        "published_at": NOW.isoformat(),
        "assets": [
            {
                "name": f"Decky-Metadata-{tag}.manifest.json",
                "browser_download_url": "https://example.test/manifest",
            },
            {
                "name": f"Decky-Metadata-{tag}.zip",
                "browser_download_url": "https://example.test/plugin.zip",
            },
        ],
    }
    payload.update(overrides)
    return payload


class FakeClient:
    def __init__(
        self,
        *,
        releases: object | None = None,
        manifest_payload: object | None = None,
        list_status: int = 200,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.releases = [release()] if releases is None else releases
        self.manifest_payload = manifest() if manifest_payload is None else manifest_payload
        self.list_status = list_status
        self.headers = headers or {}
        self.list_calls = 0

    def list_releases(self) -> JsonResponse:
        self.list_calls += 1
        return JsonResponse(self.list_status, self.headers, self.releases)

    def get_release(self, tag: str) -> JsonResponse:
        releases = self.releases if isinstance(self.releases, list) else []
        found = next((item for item in releases if item.get("tag_name") == tag), None)
        return JsonResponse(200 if found else 404, {}, found or {})

    def get_manifest(self, url: str) -> JsonResponse:
        return JsonResponse(200, {}, self.manifest_payload)


def make_updater(
    client: Any | None = None,
    *,
    current_version: str = "0.3.1",
    clock: list[datetime.datetime] | None = None,
    saved: list[bool] | None = None,
) -> PluginUpdater:
    current_clock = clock or [NOW]
    saves = saved if saved is not None else []
    return PluginUpdater(
        state_lock=threading.RLock(),
        save_callback=lambda: saves.append(True),
        log_callback=lambda _level, _message: None,
        release_client=client or FakeClient(),
        version_resolver=lambda: current_version,
        now=lambda: current_clock[0],
        monotonic=time.monotonic,
    )
