from backend.updater.discovery import select_candidate
from backend.updater.models import UpdateCandidate, parse_plugin_version


def candidate(version: str, published_at: str = "2026-07-17T00:00:00Z"):
    return UpdateCandidate(
        version=version,
        tag=f"v{version}",
        channel="development" if "-dev." in version else "stable",
        artifact_url="https://example.test/plugin.zip",
        sha256="a" * 64,
        release_url="https://example.test/release",
        published_at=published_at,
        action="update",
    )


def test_parse_plugin_version_and_ordering() -> None:
    stable = parse_plugin_version("0.3.2")
    dev = parse_plugin_version("0.3.2-dev.gabc")
    local = parse_plugin_version("0.3.2+local")
    assert stable and dev and local
    assert dev < stable
    assert stable == local
    assert local.build_metadata == "local"
    for invalid in ("", "1.2", "v1.2.3", "1.2.3-rc.1", "1.2.3+"):
        assert parse_plugin_version(invalid) is None


def test_same_base_development_build_uses_full_release_order() -> None:
    old = candidate("0.3.2-dev.gaaa", "2026-07-16T00:00:00Z")
    new = candidate("0.3.2-dev.gbbb", "2026-07-17T00:00:00Z")
    selected = select_candidate([new, old], "0.3.2-dev.gaaa", "development")
    assert selected and selected.version == "0.3.2-dev.gbbb"
