import datetime
from typing import Any, Callable

from backend.updater.models import parse_plugin_version

_PENDING_INSTALL_MISMATCH_GRACE = datetime.timedelta(minutes=15)


def is_confirmed_pending_install(pending: Any) -> bool:
    if not isinstance(pending, dict):
        return False
    confirmed_at = pending.get("handoff_confirmed_at")
    return isinstance(confirmed_at, str) and bool(confirmed_at)


def is_fresh_pending_install(pending: Any, now: Callable[[], datetime.datetime]) -> bool:
    if not isinstance(pending, dict):
        return False
    requested_at = (
        pending.get("handoff_confirmed_at")
        if is_confirmed_pending_install(pending)
        else pending.get("requested_at")
    )
    if not isinstance(requested_at, str) or not requested_at:
        return False

    try:
        requested = datetime.datetime.fromisoformat(requested_at.replace("Z", "+00:00"))
    # Intentionally broad
    except Exception:
        return False

    if requested.tzinfo is None:
        requested = requested.replace(tzinfo=datetime.timezone.utc)
    return now() - requested <= _PENDING_INSTALL_MISMATCH_GRACE


def pending_install_matches_loaded_version(pending_version: str, current_version: str) -> bool:
    if pending_version == current_version:
        return True

    parsed_pending = parse_plugin_version(pending_version)
    parsed_current = parse_plugin_version(current_version)
    if not parsed_pending or not parsed_current:
        return False

    if parsed_current.is_dev:
        return False

    if not parsed_pending.is_dev and parsed_pending == parsed_current:
        return True

    return False


def effective_pending_install_version(
    pending: Any, now: Callable[[], datetime.datetime]
) -> str | None:
    if isinstance(pending, dict) and is_fresh_pending_install(pending, now):
        version = pending.get("version")
        if isinstance(version, str) and version:
            return version
    return None
