#!/usr/bin/env python3
"""Track consecutive scheduled endpoint failures and reconcile one issue per endpoint."""
from __future__ import annotations

import argparse
import copy
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

if not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.endpoint_health import ContractError, redact, require, safe_url

STATE_ARTIFACT = "endpoint-health-state"
FAILURE_THRESHOLD = 2
MARKER_PREFIX = "<!-- decky-metadata-endpoint-health:"


def empty_state() -> dict[str, Any]:
    return {"version": 1, "last_run_url": None, "endpoints": {}}


def validate_report(report: Any) -> None:
    require(isinstance(report, dict) and report.get("version") == 1, "Unsupported health report version")
    require(isinstance(report.get("checked_at"), str), "Report has no check timestamp")
    require(isinstance(report.get("results"), list) and bool(report["results"]), "Report has no endpoint results")
    seen: set[str] = set()
    for result in report["results"]:
        require(isinstance(result, dict), "Invalid endpoint result")
        endpoint = result.get("id")
        require(isinstance(endpoint, str) and bool(re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", endpoint)), "Invalid endpoint ID")
        require(endpoint not in seen, "Duplicate endpoint result")
        seen.add(endpoint)
        require(type(result.get("ok")) is bool, "Endpoint outcome must be a boolean")
        require(all(isinstance(result.get(key), str) for key in ("name", "fixture")), "Endpoint has no name or fixture")
        require(isinstance(result.get("requests"), list), "Endpoint has no request evidence")
        for request in result["requests"]:
            require(isinstance(request, dict) and isinstance(request.get("url"), str)
                    and isinstance(request.get("method"), str), "Invalid request evidence")
            status = request.get("status")
            require(status is None or (type(status) is int and 100 <= status <= 599), "Invalid HTTP status evidence")
        if not result["ok"]:
            error = result.get("error")
            require(isinstance(error, dict) and all(isinstance(error.get(key), str) for key in ("type", "message")),
                    "Failed endpoint has no diagnostic")


def validate_state(state: Any) -> None:
    require(isinstance(state, dict) and state.get("version") == 1
            and isinstance(state.get("endpoints"), dict), "Invalid saved endpoint state")
    require(state.get("last_run_url") is None or (isinstance(state["last_run_url"], str) and
            re.fullmatch(r"https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/actions/runs/[0-9]+", state["last_run_url"])),
            "Invalid saved run URL")
    for endpoint, entry in state["endpoints"].items():
        require(isinstance(endpoint, str) and isinstance(entry, dict), "Invalid saved endpoint entry")
        require(type(entry.get("failures")) is int and entry["failures"] >= 0, "Invalid saved failure count")
        require(isinstance(entry.get("failure_runs"), list)
                and all(isinstance(url, str) for url in entry["failure_runs"]), "Invalid saved failure run history")
        require(entry.get("first_failure_at") is None or isinstance(entry["first_failure_at"], str),
                "Invalid first failure timestamp")
        require(entry.get("issue_number") is None or type(entry["issue_number"]) is int, "Invalid saved issue number")
        require(isinstance(entry.get("last_checked_at"), str) and isinstance(entry.get("last_result"), dict),
                "Saved endpoint has no latest sample")
        validate_report({"version": 1, "checked_at": entry["last_checked_at"], "results": [entry["last_result"]]})
        require(entry["last_result"]["id"] == endpoint, "Saved sample does not match its endpoint")
        recovery = entry.get("pending_recovery")
        require(recovery is None or (isinstance(recovery, dict) and
                all(isinstance(recovery.get(key), str) for key in ("checked_at", "run_url"))), "Invalid pending recovery")


def marker(endpoint: str) -> str:
    return f"{MARKER_PREFIX}{endpoint} -->"


def markdown(value: str) -> str:
    return redact(value).replace("\r", " ").replace("\n", " ").replace("|", "\\|").replace("`", "'")


def issue_body(result: dict[str, Any], entry: dict[str, Any], checked_at: str) -> str:
    lines = [marker(result["id"]), f"The **{markdown(result['name'])}** contract check has failed on "
             f"**{entry['failures']} consecutive scheduled checks**.", "",
             f"Fixture: {markdown(result['fixture'])}",
             f"First failure: {markdown(entry['first_failure_at'])}", f"Latest check: {markdown(checked_at)}", "",
             "### Failure", "", f"**{markdown(result['error']['type'])}:** {markdown(result['error']['message'])}", "",
             "### Requests", "", "| Method | Endpoint | HTTP status |", "|---|---|---|"]
    for request in result["requests"]:
        status = str(request["status"]) if request["status"] is not None else "No response"
        lines.append(f"| {markdown(request['method'])} | {markdown(safe_url(request['url']))} | {status} |")
    if not result["requests"]:
        lines.append("| — | Probe failed before making a request | — |")
    lines.extend(["", "### Recent failing runs", ""])
    lines.extend(f"- {safe_url(url)}" for url in entry["failure_runs"])
    lines.extend(["", "The check validates responses used by Decky-Metadata, not Steam UI or on-device playback.",
                  "HTTP errors and timeouts can be service, access, or network failures; they do not prove an API change.",
                  "Request headers, credentials, and response bodies are intentionally omitted.",
                  "This issue is updated during the outage and closed automatically after a successful scheduled check."])
    return "\n".join(lines) + "\n"


class GitHub:
    def __init__(self, repository: str):
        require(bool(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository)), "Invalid GitHub repository")
        self.repository = repository

    @staticmethod
    def command(arguments: list[str]) -> str:
        result = subprocess.run(["gh", *arguments], text=True, capture_output=True, timeout=120)
        require(result.returncode == 0, "GitHub CLI operation failed; the endpoint sample remains saved")
        return result.stdout

    def issues(self) -> list[dict[str, Any]]:
        pages = json.loads(self.command(["api", "--paginate", "--slurp",
                                       f"repos/{self.repository}/issues?state=all&per_page=100"]))
        return [issue for page in pages for issue in page if "pull_request" not in issue]

    def create(self, title: str, body: str) -> int:
        with tempfile.TemporaryDirectory(prefix="endpoint-issue-") as directory:
            path = Path(directory) / "body.md"
            path.write_text(body, encoding="utf-8")
            url = self.command(["issue", "create", "--repo", self.repository, "--title", title,
                                "--label", "bug", "--body-file", str(path)]).strip()
            match = re.fullmatch(r"https://github\.com/" + re.escape(self.repository) + r"/issues/([0-9]+)", url)
            require(match is not None, "GitHub returned no created issue number")
            return int(match.group(1))

    def update(self, issue: dict[str, Any], body: str) -> None:
        number = str(issue["number"])
        if issue["state"].lower() == "closed":
            self.command(["issue", "reopen", number, "--repo", self.repository])
        with tempfile.TemporaryDirectory(prefix="endpoint-issue-") as directory:
            path = Path(directory) / "body.md"
            path.write_text(body, encoding="utf-8")
            self.command(["issue", "edit", number, "--repo", self.repository, "--body-file", str(path)])

    def recover(self, issue: dict[str, Any], checked_at: str, run_url: str) -> None:
        self.command(["issue", "close", str(issue["number"]), "--repo", self.repository,
                      "--reason", "completed", "--comment",
                      f"Recovered: the scheduled contract check passed at {markdown(checked_at)}.\n\nRun: {safe_url(run_url)}"])

    def restore_state(self, branch: str, destination: Path) -> dict[str, Any]:
        payload = json.loads(self.command(["api", f"repos/{self.repository}/actions/artifacts?name={STATE_ARTIFACT}&per_page=100"]))
        # Only scheduled runs from the default branch can supply saved counts.
        candidates = [artifact for artifact in payload.get("artifacts", [])
                      if artifact.get("name") == STATE_ARTIFACT and not artifact.get("expired")
                      and artifact.get("workflow_run", {}).get("head_branch") == branch]
        for artifact in sorted(candidates, key=lambda item: item["id"], reverse=True):
            run_id = str(artifact["workflow_run"]["id"])
            run = json.loads(self.command(["run", "view", run_id, "--repo", self.repository,
                                           "--json", "event,workflowName"]))
            if run["event"] != "schedule" or run["workflowName"] != "Endpoint Health":
                continue
            with tempfile.TemporaryDirectory(prefix="endpoint-state-") as directory:
                self.command(["run", "download", run_id, "--repo", self.repository,
                              "--name", STATE_ARTIFACT, "--dir", directory])
                state = json.loads((Path(directory) / "state.json").read_text(encoding="utf-8"))
                validate_state(state)
                destination.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
                return state
        return empty_state()


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def reconcile(report: dict[str, Any], state: dict[str, Any], run_url: str,
              github: GitHub | None = None, *, scheduled: bool = True, save=None) -> tuple[dict[str, Any], list[str]]:
    validate_report(report)
    validate_state(state)
    require(bool(re.fullmatch(r"https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/actions/runs/[0-9]+", run_url)),
            "Invalid workflow run URL")
    updated = copy.deepcopy(state)
    if not scheduled:
        return updated, ["Manual check: failure counts and issues are unchanged."]
    previous = updated["last_run_url"]
    # An old rerun must not count as a new failed check.
    if previous and int(run_url.rsplit("/", 1)[1]) < int(previous.rsplit("/", 1)[1]):
        return updated, ["Older scheduled run ignored; failure counts and issues are unchanged."]
    actions: list[str] = []
    if previous != run_url:
        for result in report["results"]:
            entry = updated["endpoints"].setdefault(result["id"], {
                "failures": 0, "first_failure_at": None, "failure_runs": [],
                "issue_number": None, "pending_recovery": None,
            })
            entry["last_result"] = copy.deepcopy(result)
            entry["last_checked_at"] = report["checked_at"]
            # Remember a pass even if GitHub cannot close its issue yet.
            if result["ok"]:
                entry.update(failures=0, first_failure_at=None, failure_runs=[],
                             pending_recovery={"checked_at": report["checked_at"], "run_url": run_url})
                actions.append(f"{result['id']}: healthy; failure count reset")
            else:
                entry["failures"] += 1
                if entry["first_failure_at"] is None:
                    entry["first_failure_at"] = report["checked_at"]
                entry["failure_runs"] = (entry["failure_runs"] + [run_url])[-2:]
                if entry["failures"] < FAILURE_THRESHOLD:
                    actions.append(f"{result['id']}: failure {entry['failures']}/{FAILURE_THRESHOLD}; no issue yet")
        updated["last_run_url"] = run_url
    else:
        actions.append("Scheduled sample already recorded; retrying only pending issue work.")
    # Save results before changing issues. A failed issue update must not
    # erase a passing check or keep its failure count.
    if save:
        save(updated)
    issues = github.issues() if github else []
    errors: list[str] = []
    for endpoint, entry in updated["endpoints"].items():
        result = entry["last_result"]
        # Do not change human reports that copied the monitor's issue text.
        matches = [issue for issue in issues
                   if issue.get("user", {}).get("login") == "github-actions[bot]"
                   and marker(endpoint) in (issue.get("body") or "")]
        issue = next((item for item in matches if item["number"] == entry["issue_number"]), None)
        if issue is None:
            open_matches = [item for item in matches if item["state"].lower() == "open"]
            issue = max(open_matches or matches, key=lambda item: item["number"], default=None)
        try:
            # Finish any missed recovery before reporting a later outage.
            if entry["pending_recovery"] is not None:
                if issue and issue["state"].lower() == "open":
                    recovery = entry["pending_recovery"]
                    if github:
                        github.recover(issue, recovery["checked_at"], recovery["run_url"])
                    issue["state"] = "closed"
                    actions.append(f"{endpoint}: close recovered issue #{issue['number']}")
                entry["pending_recovery"] = None
            if entry["failures"] < FAILURE_THRESHOLD:
                continue
            body = issue_body(result, entry, entry["last_checked_at"])
            if issue:
                if github:
                    github.update(issue, body)
                entry["issue_number"] = issue["number"]
                actions.append(f"{endpoint}: update/reopen issue #{issue['number']}")
            else:
                if github:
                    entry["issue_number"] = github.create(f"Endpoint health: {result['name']}", body)
                actions.append(f"{endpoint}: create issue after {entry['failures']} consecutive failures")
        except (ContractError, OSError, ValueError, subprocess.SubprocessError):
            errors.append(endpoint)
        finally:
            # Keep this endpoint's progress if another issue update fails.
            if save:
                save(updated)
    require(not errors, "GitHub issue reporting failed for: " + ", ".join(errors))
    return updated, actions


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--state", type=Path, required=True)
    parser.add_argument("--repository", default="beallio/Decky-Metadata")
    parser.add_argument("--branch", default="main")
    parser.add_argument("--run-url", required=True)
    parser.add_argument("--scheduled", action="store_true", help="Process a scheduled sample; manual checks never advance state")
    parser.add_argument("--apply", action="store_true", help="Write GitHub issues; omitted means a local dry run")
    parser.add_argument("--restore", action="store_true", help="Restore the newest scheduled state artifact before processing")
    args = parser.parse_args()
    try:
        require(not args.apply or args.scheduled, "Only scheduled checks may modify GitHub issues")
        report = json.loads(args.report.read_text(encoding="utf-8"))
        validate_report(report)
        github = GitHub(args.repository) if args.apply or args.restore else None
        if args.restore:
            require(args.scheduled, "Only scheduled checks restore persistent failure state")
            state = github.restore_state(args.branch, args.state)
        else:
            state = json.loads(args.state.read_text(encoding="utf-8")) if args.state.exists() else empty_state()
        _updated, actions = reconcile(report, state, args.run_url, github if args.apply else None,
                                      scheduled=args.scheduled, save=lambda value: save_state(args.state, value))
        for action in actions:
            print(action)
        return 0
    except (ContractError, OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"Endpoint reporting failed: {redact(str(error)) if isinstance(error, ContractError) else type(error).__name__}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
