from __future__ import annotations

import copy
import io
import json
import zipfile

import pytest

from scripts import endpoint_health_probes as probes
from scripts.endpoint_health import ContractError, Probe, run_probe, safe_url


# Small response fixtures let tests simulate changed upstream data.
class JsonClient:
    def __init__(self, payload):
        self.payload = payload

    def json(self, *_args, **_kwargs):
        return self.payload


@pytest.mark.parametrize("tier", ["unknown", None, "pending", True, ["gold"]])
def test_known_rated_fixture_cannot_silently_become_an_unrated_or_malformed_summary(tier):
    with pytest.raises(ContractError):
        probes.protondb_summary(JsonClient({"tier": tier}))


@pytest.mark.parametrize("mutate", [
    lambda data: data.update(developers=[]),
    lambda data: data.update(publishers=None),
    lambda data: data.update(screenshots=[{"url": "https://steam.example/screenshot.jpg"}]),
    lambda data: data.update(short_description="", detailed_description="", about_the_game=""),
])
def test_http_200_game_details_without_consumer_fields_fail_the_contract(mutate):
    data = {"name": "Hades", "short_description": "A real description", "developers": ["Supergiant Games"],
            "publishers": ["Supergiant Games"], "screenshots": [{"path_full": "https://steam.example/shot.jpg"}]}
    mutate(data)
    with pytest.raises(ContractError):
        probes.steam_metadata(JsonClient({"1145360": {"success": True, "data": data}}))


def test_http_200_trailer_url_returning_an_html_error_is_not_healthy():
    class MovieClient(JsonClient):
        def text(self, *_args, **_kwargs):
            return "<html>Access denied</html>"
    payload = {"1145360": {"success": True, "data": {"movies": [{"id": 1, "hls_h264": "https://steam.example/trailer.m3u8"}]}}}
    with pytest.raises(ContractError):
        probes.steam_trailers(MovieClient(payload))


def test_algolia_demo_hit_or_numeric_object_id_does_not_count_as_the_fixture_match():
    for hit in ({"name": "TRANSFORMERS: Devastation Demo", "objectID": "338930"},
                {"name": "TRANSFORMERS: Devastation", "objectID": 338930}):
        with pytest.raises(ContractError):
            probes.protondb_algolia(JsonClient({"hits": [hit]}))


def test_news_transport_success_without_a_usable_announcement_is_not_healthy():
    with pytest.raises(ContractError):
        probes.steam_news(JsonClient({"appnews": {"appid": 1145360, "newsitems": [{"title": "", "url": "https://steam.example/news"}]}}))


def test_release_zip_that_does_not_match_the_updater_manifest_fails():
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        archive.writestr("Decky-Metadata/plugin.json", '{"name":"Decky Metadata"}')
    zip_bytes = output.getvalue()
    manifest = {"schemaVersion": 1, "pluginName": "Decky Metadata", "packageName": "decky-metadata", "version": "1.2.3",
                "sourceVersion": "1.2.3", "tag": "v1.2.3", "channel": "stable", "assetName": "Decky-Metadata.zip",
                "sha256": "0" * 64, "generatedAt": "2026-10-10T20:00:00Z"}
    release = {"tag_name": "v1.2.3", "draft": False, "prerelease": False, "assets": [
        {"id": 1, "size": 1000, "name": "Decky-Metadata-v1.2.3.manifest.json", "browser_download_url": "https://github.com/manifest"},
        {"id": 2, "size": len(zip_bytes), "name": "Decky-Metadata.zip", "browser_download_url": "https://github.com/zip"}]}

    class ReleaseClient:
        def github_json(self, _path):
            return copy.deepcopy([release])

        def github_bytes(self, path, **_kwargs):
            return json.dumps(manifest).encode() if path.endswith("/1") else zip_bytes

    with pytest.raises(ContractError):
        probes.github_release_assets(ReleaseClient())


def test_unexpected_transport_exception_does_not_publish_its_secret_text():
    secret = "private-token-in-transport-error"

    def broken(_client):
        raise OSError(f"Authorization: Bearer {secret}")

    result = run_probe(Probe("example", "Example", "Known fixture", broken))
    assert result["ok"] is False
    assert result["error"]["type"] == "OSError"
    assert secret not in json.dumps(result)


def test_url_evidence_removes_userinfo_and_encoded_credential_parameters():
    safe = safe_url("https://user:private-pass@service.example/path?access%5Ftoken=private-token&signature=private-signature&term=Hades")
    assert "private-pass" not in safe
    assert "private-token" not in safe
    assert "private-signature" not in safe
    assert "user:" not in safe


@pytest.mark.parametrize("kind,manifest", [
    ("hls_h264", "#EXTM3U\nvideo.m3u8\n"),
    ("dash_h264", "<MPD><Representation/></MPD>"),
])
def test_adaptive_trailer_manifest_with_missing_consumer_structure_is_not_healthy(kind, manifest):
    class MovieClient(JsonClient):
        def text(self, *_args, **_kwargs):
            return manifest
    payload = {"1145360": {"success": True, "data": {"movies": [{"id": 1, kind: "https://steam.example/trailer"}]}}}
    with pytest.raises(ContractError):
        probes.steam_trailers(MovieClient(payload))


@pytest.mark.parametrize("result_type", [None, "dlc"])
def test_search_match_without_the_app_type_required_by_protondb_lookup_is_not_healthy(result_type):
    row = {"id": 1145360, "name": "Hades"}
    if result_type is not None:
        row["type"] = result_type
    with pytest.raises(ContractError):
        probes.steam_search(JsonClient({"items": [row]}))
