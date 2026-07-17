import datetime

from backend.updater.rate_limit import parse_rate_limit_retry_after
from tests.updater_helpers import FakeClient, NOW, make_updater


def test_retry_after_precedes_reset_and_has_fallback() -> None:
    assert parse_rate_limit_retry_after({"retry-after": "30", "x-ratelimit-reset": "1"}, NOW) == (
        NOW + datetime.timedelta(seconds=30)
    ).isoformat()
    assert parse_rate_limit_retry_after({}, NOW) == (
        NOW + datetime.timedelta(minutes=1)
    ).isoformat()


def test_check_records_403_and_429_cooldown() -> None:
    for status in (403, 429):
        client = FakeClient(
            list_status=status,
            releases={"message": "API rate limit exceeded"},
            headers={"retry-after": "60"},
        )
        updater = make_updater(client)
        first = updater.check_for_update("0.3.1")
        second = updater.check_for_update("0.3.1")
        assert first["status"] == "failed" and first["retry_after"]
        assert second["status"] == "failed" and client.list_calls == 1
