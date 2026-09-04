from backend.updater.discovery import select_candidate
from backend.updater.models import UpdateCandidate


def c(version: str, channel: str):
    return UpdateCandidate(
        version, f"v{version}", channel, "zip", "a" * 64, "release", version, "update"
    )


def test_candidate_action_matrix() -> None:
    candidates = [c("0.3.1", "stable"), c("0.3.2", "stable"), c("0.3.3-dev.g1", "development")]
    assert select_candidate(candidates, "0.3.1", "stable").action == "update"
    assert select_candidate(candidates, "0.3.2-dev.g1", "stable").action == "move_to_stable"
    assert select_candidate(candidates, "0.3.3-dev.g1", "stable").action == "downgrade_to_stable"
    assert select_candidate(candidates, "0.3.2", "stable") is None
    assert select_candidate(candidates, "0.3.3-dev.g1", "development") is None


def test_same_base_local_build_can_move_to_canonical_stable() -> None:
    selected = select_candidate([c("0.3.2", "stable")], "0.3.2+localhash", "stable")
    assert selected is not None
    assert selected.version == "0.3.2"
    assert selected.action == "move_to_stable"


def test_local_build_can_update_to_newer_stable() -> None:
    selected = select_candidate([c("0.3.3", "stable")], "0.3.2+localhash", "stable")
    assert selected is not None
    assert selected.version == "0.3.3"
    assert selected.action == "update"


def test_local_build_does_not_move_to_older_stable() -> None:
    assert select_candidate([c("0.3.2", "stable")], "0.3.3+localhash", "stable") is None


def test_same_base_published_stable_remains_current() -> None:
    assert select_candidate([c("0.3.2", "stable")], "0.3.2", "stable") is None
