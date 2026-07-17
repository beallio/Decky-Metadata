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
