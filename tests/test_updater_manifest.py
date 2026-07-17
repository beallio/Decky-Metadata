import pytest

from backend.updater.models import parse_release_manifest
from tests.updater_helpers import manifest


def test_manifest_accepts_identity_strings_without_enforcing_identity() -> None:
    parsed = parse_release_manifest(manifest(pluginName="Other", packageName="other"))
    assert parsed and parsed.plugin_name == "Other" and parsed.package_name == "other"


@pytest.mark.parametrize(
    "change",
    [
        {"schemaVersion": 2},
        {"channel": "nightly"},
        {"sha256": "bad"},
        {"version": 1},
        {"generatedAt": None},
    ],
)
def test_manifest_rejects_invalid_schema_fields(change) -> None:
    assert parse_release_manifest(manifest(**change)) is None


def test_manifest_rejects_missing_and_non_mapping_payloads() -> None:
    payload = manifest()
    payload.pop("tag")
    assert parse_release_manifest(payload) is None
    assert parse_release_manifest([]) is None
