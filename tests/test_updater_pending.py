import datetime

from backend.updater.pending import (
    effective_pending_install_version,
    is_fresh_pending_install,
    pending_install_matches_loaded_version,
)
from tests.updater_helpers import NOW, make_updater


def pending(version="0.4.0", minutes=0):
    return {"version": version, "requested_at": (NOW - datetime.timedelta(minutes=minutes)).isoformat()}


def test_pending_freshness_and_effective_version() -> None:
    assert is_fresh_pending_install(pending(minutes=14), lambda: NOW)
    assert not is_fresh_pending_install(pending(minutes=16), lambda: NOW)
    assert effective_pending_install_version(pending(), lambda: NOW) == "0.4.0"
    assert pending_install_matches_loaded_version("0.4.0+hash", "0.4.0")


def test_reconcile_promotes_retains_and_clears() -> None:
    updater = make_updater()
    updater.load_state({}, {"update_check_cache": {"pending_update_install": {**pending(), "tag": "v0.4.0"}}})
    updater.reconcile_pending_install("0.4.0")
    assert updater.get_context()["pending_update_install"] is None
    assert updater.get_context()["installed_release_tag"] == "v0.4.0"

    updater.load_state({}, {"update_check_cache": {"pending_update_install": pending()}})
    updater.reconcile_pending_install("0.3.1")
    assert updater.has_pending_install()

    updater.load_state({}, {"update_check_cache": {"pending_update_install": pending(minutes=16)}})
    updater.reconcile_pending_install("0.3.1")
    assert not updater.has_pending_install()
