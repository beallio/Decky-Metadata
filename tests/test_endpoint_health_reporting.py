from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.endpoint_health import ContractError
from scripts import report_endpoint_health as reporter


class MemoryGitHub:
    """An isolated issue store for outage/recovery transitions, not command expectations."""
    def __init__(self):
        self.records: list[dict] = []
        self.recoveries: list[int] = []

    def issues(self):
        return self.records

    def create(self, title, body):
        issue = {"number": len(self.records) + 1, "title": title, "body": body, "state": "open",
                 "user": {"login": "github-actions[bot]"}}
        self.records.append(issue)
        return issue["number"]

    def update(self, issue, body):
        issue.update(body=body, state="open")

    def recover(self, issue, _timestamp, _run_url):
        issue["state"] = "closed"
        self.recoveries.append(issue["number"])


def report(**outcomes):
    return {"version": 1, "checked_at": "2026-10-10T20:00:00Z", "results": [
        {"id": endpoint, "name": endpoint, "fixture": "Known game", "ok": healthy,
         "requests": [{"method": "GET", "url": "https://service.example/summary", "status": 200 if healthy else 503}],
         "error": None if healthy else {"type": "ContractError", "message": "HTTP 503"}}
        for endpoint, healthy in outcomes.items()
    ]}


def sample(state, github, run_id, **outcomes):
    updated, _actions = reporter.reconcile(report(**outcomes), state,
                                          f"https://github.com/beallio/Decky-Metadata/actions/runs/{run_id}", github)
    # Scheduled runs communicate through JSON artifacts, not live Python objects.
    return json.loads(json.dumps(updated))


def test_two_consecutive_failures_are_required_and_success_breaks_the_streak():
    github = MemoryGitHub()
    state = sample(reporter.empty_state(), github, 1, protondb=False)
    assert state["endpoints"]["protondb"]["failures"] == 1
    assert github.records == []
    state = sample(state, github, 2, protondb=True)
    assert state["endpoints"]["protondb"]["failures"] == 0
    state = sample(state, github, 3, protondb=False)
    assert github.records == []
    state = sample(state, github, 4, protondb=False)
    assert state["endpoints"]["protondb"]["failures"] == 2
    assert [(issue["number"], issue["state"]) for issue in github.records] == [(1, "open")]


def test_outage_updates_one_issue_and_recovery_closes_it_then_later_outage_reopens_it():
    github = MemoryGitHub()
    state = reporter.empty_state()
    for run_id in (1, 2, 3):
        state = sample(state, github, run_id, protondb=False)
    assert state["endpoints"]["protondb"]["failures"] == 3
    assert [(issue["number"], issue["state"]) for issue in github.records] == [(1, "open")]
    state = sample(state, github, 4, protondb=True)
    assert github.records[0]["state"] == "closed"
    assert github.recoveries == [1]
    assert state["endpoints"]["protondb"]["failure_runs"] == []
    state = sample(state, github, 5, protondb=True)
    assert github.recoveries == [1]
    state = sample(state, github, 6, protondb=False)
    assert github.records[0]["state"] == "closed"
    sample(state, github, 7, protondb=False)
    assert [(issue["number"], issue["state"]) for issue in github.records] == [(1, "open")]


def test_endpoint_streaks_and_recovery_are_independent():
    github = MemoryGitHub()
    state = sample(reporter.empty_state(), github, 1, steam=False, protondb=True)
    state = sample(state, github, 2, steam=False, protondb=False)
    assert [(issue["title"], issue["state"]) for issue in github.records] == [("Endpoint health: steam", "open")]
    state = sample(state, github, 3, steam=True, protondb=False)
    assert [(issue["title"], issue["state"]) for issue in github.records] == [
        ("Endpoint health: steam", "closed"), ("Endpoint health: protondb", "open")]
    assert state["endpoints"]["steam"]["failures"] == 0
    assert state["endpoints"]["protondb"]["failures"] == 2


def test_manual_checks_and_replayed_scheduled_runs_do_not_advance_or_clear_state():
    github = MemoryGitHub()
    state = sample(reporter.empty_state(), github, 1, protondb=False)
    url = "https://github.com/beallio/Decky-Metadata/actions/runs/2"
    manual, _ = reporter.reconcile(report(protondb=True), state, url, github, scheduled=False)
    assert manual == state
    replay = sample(state, github, 1, protondb=False)
    assert replay == state
    assert github.records == []


def test_missing_endpoint_is_not_treated_as_recovered():
    github = MemoryGitHub()
    state = sample(reporter.empty_state(), github, 1, steam=False, protondb=True)
    state = sample(state, github, 2, steam=False, protondb=True)
    state = sample(state, github, 3, protondb=True)
    assert state["endpoints"]["steam"]["failures"] == 2
    assert github.records[0]["state"] == "open"


def test_title_collision_does_not_close_or_reuse_an_unrelated_issue():
    github = MemoryGitHub()
    github.records.append({"number": 40, "title": "Endpoint health: steam", "body": "Human report", "state": "open"})
    state = sample(reporter.empty_state(), github, 1, steam=False)
    state = sample(state, github, 2, steam=False)
    sample(state, github, 3, steam=True)
    assert github.records[0]["state"] == "open"
    assert github.records[1]["state"] == "closed"


def test_issue_diagnostics_remove_credentials_even_from_error_text_and_encoded_urls(monkeypatch):
    secret = "test-private-token-do-not-publish"
    monkeypatch.setenv("GH_TOKEN", secret)
    value = report(protondb=False)
    value["results"][0]["error"]["message"] = f"Bearer {secret}; api_key=another-private-key"
    value["results"][0]["requests"][0]["url"] = f"https://user:{secret}@service.example/api?token={secret}&term=Hades"
    github = MemoryGitHub()
    state, _ = reporter.reconcile(value, reporter.empty_state(), "https://github.com/beallio/Decky-Metadata/actions/runs/1", github)
    reporter.reconcile(value, state, "https://github.com/beallio/Decky-Metadata/actions/runs/2", github)
    body = github.records[0]["body"]
    assert secret not in body
    assert "another-private-key" not in body
    assert "user:" not in body


@pytest.mark.parametrize("mutate", [
    lambda value: value["results"].append(value["results"][0]),
    lambda value: value["results"][0].update(ok="false"),
    lambda value: value["results"][0].update(error=None),
    lambda value: value["results"][0]["requests"][0].update(status=True),
])
def test_malformed_results_do_not_modify_issues_or_advance_counts(mutate):
    github = MemoryGitHub()
    state = reporter.empty_state()
    value = report(protondb=False)
    mutate(value)
    with pytest.raises(ContractError):
        reporter.reconcile(value, state, "https://github.com/beallio/Decky-Metadata/actions/runs/1", github)
    assert state == reporter.empty_state()
    assert github.records == []


def test_corrupt_saved_state_is_not_silently_reset():
    value = reporter.empty_state()
    value["endpoints"]["protondb"] = {"failures": "2", "first_failure_at": None, "failure_runs": []}
    with pytest.raises(ContractError):
        reporter.reconcile(report(protondb=False), value, "https://github.com/beallio/Decky-Metadata/actions/runs/1")


def test_issue_reporting_failure_does_not_discard_the_failed_scheduled_sample(tmp_path, monkeypatch):
    class UnavailableGitHub(MemoryGitHub):
        def create(self, *_args):
            raise ContractError("GitHub is unavailable")

    state_path = tmp_path / "state.json"
    state = sample(reporter.empty_state(), MemoryGitHub(), 1, protondb=False)
    state_path.write_text(json.dumps(state), encoding="utf-8")
    report_path = tmp_path / "report.json"
    report_path.write_text(json.dumps(report(protondb=False)), encoding="utf-8")
    monkeypatch.setattr(reporter, "GitHub", lambda _repository: UnavailableGitHub())
    monkeypatch.setattr("sys.argv", ["report_endpoint_health.py", "--report", str(report_path), "--state", str(state_path),
                                    "--run-url", "https://github.com/beallio/Decky-Metadata/actions/runs/2", "--scheduled", "--apply"])
    assert reporter.main() == 1
    saved = json.loads(state_path.read_text(encoding="utf-8"))
    assert saved["endpoints"]["protondb"]["failures"] == 2
    assert saved["last_run_url"].endswith("/2")


def test_restore_selects_latest_scheduled_monitor_state_not_manual_or_other_branch(tmp_path):
    expected = sample(reporter.empty_state(), MemoryGitHub(), 5, protondb=False)

    class ArtifactGitHub(reporter.GitHub):
        def command(self, args):
            if args[0] == "api":
                return json.dumps({"artifacts": [
                    {"id": 9, "name": reporter.STATE_ARTIFACT, "expired": False, "workflow_run": {"id": 9, "head_branch": "feature"}},
                    {"id": 8, "name": reporter.STATE_ARTIFACT, "expired": False, "workflow_run": {"id": 8, "head_branch": "main"}},
                    {"id": 7, "name": reporter.STATE_ARTIFACT, "expired": False, "workflow_run": {"id": 7, "head_branch": "main"}},
                ]})
            if args[:2] == ["run", "view"]:
                return json.dumps({"event": "workflow_dispatch" if args[2] == "8" else "schedule", "workflowName": "Endpoint Health"})
            if args[:2] == ["run", "download"]:
                (Path(args[-1]) / "state.json").write_text(json.dumps(expected), encoding="utf-8")
                return ""
            raise AssertionError("Unexpected artifact operation")

    restored = ArtifactGitHub("beallio/Decky-Metadata").restore_state("main", tmp_path / "state.json")
    assert restored == expected
    assert restored["endpoints"]["protondb"]["failures"] == 1


def test_reporting_failure_during_a_pass_still_breaks_the_failure_streak(tmp_path, monkeypatch):
    class UnavailableGitHub(MemoryGitHub):
        def issues(self):
            raise ContractError("GitHub is unavailable")

    state_path = tmp_path / "state.json"
    state_path.write_text(json.dumps(sample(reporter.empty_state(), MemoryGitHub(), 1, protondb=False)), encoding="utf-8")
    report_path = tmp_path / "report.json"
    report_path.write_text(json.dumps(report(protondb=True)), encoding="utf-8")
    monkeypatch.setattr(reporter, "GitHub", lambda _repository: UnavailableGitHub())
    monkeypatch.setattr("sys.argv", ["report_endpoint_health.py", "--report", str(report_path), "--state", str(state_path),
                                    "--run-url", "https://github.com/beallio/Decky-Metadata/actions/runs/2", "--scheduled", "--apply"])
    assert reporter.main() == 1
    saved = json.loads(state_path.read_text(encoding="utf-8"))
    assert saved["endpoints"]["protondb"]["failures"] == 0
    github = MemoryGitHub()
    saved = sample(saved, github, 3, protondb=False)
    assert saved["endpoints"]["protondb"]["failures"] == 1
    assert github.records == []


def test_replaying_an_older_scheduled_run_cannot_create_a_false_consecutive_failure():
    github = MemoryGitHub()
    state = sample(reporter.empty_state(), github, 1, protondb=False)
    state = sample(state, github, 2, protondb=True)
    state = sample(state, github, 3, protondb=False)
    replay = sample(state, github, 1, protondb=False)
    assert replay == state
    assert github.records == []


def test_a_human_issue_copying_the_monitor_marker_is_not_monitor_owned():
    github = MemoryGitHub()
    state = sample(reporter.empty_state(), github, 1, protondb=False)
    state = sample(state, github, 2, protondb=False)
    # A copied report is still a human issue, not a monitor-owned issue.
    human_copy = {**github.records[0], "number": 999, "user": {"login": "beallio"}}
    github.records.append(human_copy)
    sample(state, github, 3, protondb=True)
    assert human_copy["state"] == "open"
    assert github.records[0]["state"] == "closed"
