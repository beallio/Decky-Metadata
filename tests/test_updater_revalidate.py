from tests.updater_helpers import FakeClient, make_updater, manifest


def base_candidate():
    return {
        "version": "0.4.0",
        "tag": "v0.4.0",
        "channel": "stable",
        "artifact_url": "https://example.test/plugin.zip",
        "sha256": "a" * 64,
        "release_url": "https://example.test/releases/v0.4.0",
        "published_at": "2026-07-17T12:00:00+00:00",
        "action": "update",
    }


def test_revalidation_success_passthrough() -> None:
    result = make_updater().revalidate(base_candidate())
    assert result["version"] == "0.4.0"
    assert result["action"] == "update"


def test_revalidation_rejects_changed_sha_url_and_version() -> None:
    for change in (
        {"sha256": "b" * 64},
        {"artifact_url": "https://example.test/other.zip"},
        {"version": "0.4.1"},
    ):
        result = make_updater().revalidate({**base_candidate(), **change})
        assert result["status"] == "failed"
