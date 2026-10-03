# Agent Workflow

Use the tracked dispatcher for deterministic project and Deck operations. Generated Deck evidence stays under `/tmp/Decky-Metadata`; orchestration plans and reviews use private run state.

## Change

```bash
scripts/decky doctor
scripts/decky verify-change dev --explain
```

The second command runs local gates and classifies changed paths. A reported `DEFERRED` status names required Deck checks without mutating the device. Only an authorized modifying run may add `--device`; add `--allow-launch` only when launching the configured safe fixture is also authorized. Follow the existing plan/review/finalize flow through `scripts/orchestration`. Promotion from `dev` to `main` remains a human gate.

## Private orchestration workflow

Run `scripts/orchestration/new-plan SLUG` and edit the private plan at the path
it returns. Validate with `scripts/orchestration/validate-plan SLUG`, not a plan
filename. Do not commit generated plans, review notes, or session logs.

Before reviewing a finished implementation, capture
`scripts/orchestration/status SLUG --json`. Require a valid finished revision
and retain that snapshot's `run_id`, `round`, `plan_version`, and `head` as
`RUN_ID`, `ROUND`, `PLAN_VERSION`, and `HEAD_SHA`. Review that exact revision and
plan; submit the findings through stdin using those captured values:

```bash
scripts/orchestration/submit-review SLUG CHANGES_REQUESTED \
  --run-id "$RUN_ID" --round "$ROUND" \
  --plan-version "$PLAN_VERSION" --head "$HEAD_SHA" < "$REVIEW_FILE"
```

`REVIEW_FILE` is a private findings file, not a committed review document.
Use `APPROVED` only when authorized. If the target changes during review,
review the new target rather than substituting fresh identity values for old findings.

## Device investigation

```bash
scripts/decky doctor --deck
scripts/deck/logs.sh audit --json
scripts/decky capture
scripts/decky steamui snapshot
scripts/decky steamui search 'PATTERN'
```

These commands are read-only. Capture stores derived reports and restricted raw evidence separately. Full settings require `--include-settings` and a privacy warning. See [on-device verification](on-device-verification.md) before any deployment, reload, or game smoke.

## Package delivery

```bash
scripts/decky status --deck
scripts/decky package-push --build --push
```

The package command separately reports local validation, package creation, delivery, and installed state. It never installs the plugin or reloads Steam. An offline Deck is pending for the authorized Git hook but fails an explicit push.

## IGN trailer health

The [IGN Trailer Health workflow](../../.github/workflows/ign-trailer-health.yml)
checks game search, verified trailer selection, and direct MP4 delivery for
Deadpool and Bloodborne at minute 17 of every hour (UTC). Run the same probe
locally with `./run.sh python3 scripts/check_ign_trailers.py`, or start the
workflow manually from GitHub Actions. The schedule only runs after the
workflow reaches GitHub's default branch, `main`.

A failed probe makes the workflow fail and opens one issue titled
**IGN trailer fallback health check failed**. Later failures reuse the open
issue. Review the failed run for the specific error; close the issue after the
source works again. This check does not exercise Steam's browser, Decky
Loader, or on-device playback.

## Optional setup

Both installers are non-mutating by default:

```bash
scripts/install_hooks.sh --check
scripts/install_project_skill.sh --dest /tmp/Decky-Metadata/skill-install-test
```

Use `--install` explicitly. The skill installer refuses external Git worktrees unless `--allow-external-worktree` is also supplied.

The skill installer checks the destination's own Git repository, even when
called from a Git hook. Inherited hook-local Git variables do not change that
check or bypass the external-worktree opt-in.

## Documentation status

[Compatibility behavior](../specs/compatibility-status.md) and this runbook are
current guidance. The retained [research proposals](../plans/) and historical
runbook are reference material, not active execution plans or required process
records. Their retention does not require restoring deleted plans, reviews, or
session logs. Do not execute historical setup or polling commands.
Revalidate research proposals against current code before scheduling work.
