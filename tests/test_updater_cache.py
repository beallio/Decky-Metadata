import datetime

from backend.updater.models import JsonResponse
from tests.updater_helpers import FakeClient, NOW, make_updater


def test_cache_hit_force_and_version_channel_invalidation() -> None:
    client = FakeClient()
    clock = [NOW]
    updater = make_updater(client, clock=clock)
    assert updater.check_for_update("0.3.1")["status"] == "available"
    assert updater.check_for_update("0.3.1")["status"] == "available"
    assert client.list_calls == 1
    updater.check_for_update("0.3.1", True)
    assert client.list_calls == 2
    updater.check_for_update("0.3.0")
    assert client.list_calls == 3
    updater.set_channel("development")
    updater.check_for_update("0.3.0")
    assert client.list_calls == 4
    clock[0] += datetime.timedelta(hours=25)
    updater.check_for_update("0.3.0")
    assert client.list_calls == 5


def test_all_nonfailure_check_shapes_include_snapshotted_channel() -> None:
    updater = make_updater()
    available = updater.check_for_update("0.3.1")
    current = updater.check_for_update("0.4.0", True)
    updater.record_install_requested({"version": "0.4.0", "tag": "v0.4.0", "channel": "stable"})
    fast = updater.check_for_update("0.4.0")
    assert available["channel"] == current["channel"] == fast["channel"] == "stable"


def test_mid_check_channel_flip_does_not_persist_wrong_channel_cache() -> None:
    updater = None

    class FlipClient(FakeClient):
        def list_releases(self) -> JsonResponse:
            assert updater is not None
            updater.set_channel("development")
            return super().list_releases()

    updater = make_updater(FlipClient())
    result = updater.check_for_update("0.3.1")
    assert result["channel"] == "stable"
    cache = updater.cache_payload()["update_check_cache"]
    assert "last_checked_channel" not in cache


def test_unexpected_client_result_is_a_failed_shape_at_rpc_boundary() -> None:
    class ExplodingClient(FakeClient):
        def list_releases(self):
            raise RuntimeError("boom")

    try:
        make_updater(ExplodingClient()).check_for_update("0.3.1")
    except RuntimeError as error:
        assert str(error) == "boom"
