import pytest

from backend.updater.discovery import (
    prevalidate_release_candidate,
    validate_release_candidate,
)
from backend.updater.models import JsonResponse
from tests.updater_helpers import FakeClient, manifest, release


@pytest.mark.parametrize("kind,count", [("zip", 0), ("zip", 2), ("manifest", 0), ("manifest", 2)])
def test_prevalidation_requires_exactly_one_zip_and_manifest(kind, count) -> None:
    payload = release()
    zip_asset, manifest_asset = payload["assets"][1], payload["assets"][0]
    payload["assets"] = (
        ([manifest_asset] + [zip_asset] * count)
        if kind == "zip"
        else ([zip_asset] + [manifest_asset] * count)
    )
    assert prevalidate_release_candidate(payload) is None


@pytest.mark.parametrize(
    "manifest_change,release_change",
    [
        ({"pluginName": "Wrong"}, {}),
        ({"packageName": "wrong"}, {}),
        ({"tag": "v9.9.9"}, {}),
        ({"version": "9.9.9"}, {}),
        ({"channel": "dev"}, {}),
        ({"channel": "stable"}, {"prerelease": True}),
        ({"assetName": "other.zip"}, {}),
    ],
)
def test_discovery_rejects_trust_boundary_mismatches(manifest_change, release_change) -> None:
    assert validate_release_candidate(
        release(**release_change),
        FakeClient(manifest_payload=manifest(**manifest_change)),
    ) is None


def test_discovery_rejects_failed_manifest_download() -> None:
    class FailedManifest(FakeClient):
        def get_manifest(self, url: str) -> JsonResponse:
            return JsonResponse(503, {}, {})

    assert validate_release_candidate(release(), FailedManifest()) is None
