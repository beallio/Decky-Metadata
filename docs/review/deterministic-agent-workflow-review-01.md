# Review — deterministic-agent-workflow (round 01)

Branch: `feat/deterministic-agent-workflow`
Reviewed against: `docs/plans/2026-07-11_deterministic-agent-workflow.md`

## Verdict

The first implementation turn ended before completing the round. Tasks 1-3 have
durable commits, but the remaining project-skill, capture, SteamUI, semantic
fixture, package-delivery, hook, documentation, and integration-test changes are
still present as an uncommitted working set. The round-complete marker is absent.
This is a recovery continuation, not approval of the partial implementation.

## Gate status

The pre-implementation baseline quality gate passed. Targeted tests found an
installer destination-parsing failure during the interrupted turn; the working
tree contains a prospective correction, but the complete targeted suite and full
project quality gate have not yet been demonstrated green. The unrelated user
JSON files remain untracked and must stay untouched.

## Required changes

1. Resume from the current feature branch and preserve the existing uncommitted
   implementation; do not restart from `dev` or regenerate the plan.
2. Finish every remaining task in
   `docs/plans/2026-07-11_deterministic-agent-workflow.md`, including the
   dispatcher integrations, semantic fixture/Market checks, diagnostic capture,
   SteamUI tooling, locked package delivery, hook and skill installers, canonical
   project skill, trigger-table/runbook/README updates, and session record.
3. Re-run the installer tests and verify the `--dest` correction uses the caller's
   temporary destination, remains dry-run by default, and still refuses external
   Git worktrees without the explicit override.
4. Run every targeted command and the complete validation ladder from the plan,
   including skill validation, `bash -n`, Python compilation, pytest, the project
   quality gate, review-note deletion check, and `git diff --check`.
5. Commit all in-scope implementation and this committed review note as durable
   audit history. Do not stage, edit, or delete `basicui.json`, `hero.json`,
   `match.json`, `rules2.json`, or `rules3.json`.
6. Run `scripts/orchestration/mark-finished deterministic-agent-workflow` only
   after the working tree contains no changes other than those five unrelated
   untracked JSON files and all required gates are green.

STATUS: CHANGES_REQUESTED
