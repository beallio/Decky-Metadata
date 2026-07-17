import datetime
from typing import Mapping


def parse_rate_limit_retry_after(headers: Mapping[str, str], now: datetime.datetime) -> str:
    retry_after_str = None
    if "retry-after" in headers:
        try:
            seconds = int(headers["retry-after"])
            retry_after_str = (now + datetime.timedelta(seconds=seconds)).isoformat()
        # Intentionally broad
        except Exception:
            pass
    elif "x-ratelimit-reset" in headers:
        try:
            reset_ts = int(headers["x-ratelimit-reset"])
            retry_after_str = datetime.datetime.fromtimestamp(
                reset_ts, datetime.timezone.utc
            ).isoformat()
        # Intentionally broad
        except Exception:
            pass

    if not retry_after_str:
        retry_after_str = (now + datetime.timedelta(minutes=1)).isoformat()
    return retry_after_str
