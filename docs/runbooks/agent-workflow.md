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

## External endpoint health

The [Endpoint Health workflow](../../.github/workflows/endpoint-health.yml) is
scheduled at minute 17 of every hour (UTC). GitHub can delay scheduled runs.
The schedule starts only after the workflow reaches the default branch, `main`.

It runs 15 separate contract checks:

| Source | Checks and fixtures |
|---|---|
| IGN | Bloodborne search; Hades descriptions, people, and screenshots; Deadpool and Bloodborne trailer discovery and MP4 headers |
| Steam | Hades search, game details, trailer lookup and manifest/media response, news, partner events, and Deck compatibility |
| ProtonDB | Hades rating tier; Algolia exact title lookup for TRANSFORMERS: Devastation |
| Steam Community | Dota 2 homecontent parsed into usable screenshot cards |
| Steam Tracker | Delisted-page parsing with at least 100 games, including Metro 2033 |
| GitHub updater | Latest stable release discovery, manifest validation, and ZIP delivery with a matching SHA-256 |

The checks validate the response fields used by the plugin, not just HTTP
success. They do not exercise Steam's UI, Decky Loader installation, or on-device
playback. A failure in one check does not prevent the other checks from running.

Each endpoint has its own failure count. The first failed scheduled check records
the failure without opening an issue. The second consecutive failure opens an
issue titled **Endpoint health: SOURCE**. Later failures update that issue.
A successful scheduled check resets that endpoint's count and closes its issue.
A later outage reopens the same monitor-owned issue after two failures. Ownership
requires the Actions bot author and endpoint marker, with the saved issue number
preferred. Human reports, including copies of monitor reports, are not changed.

Issues contain the fixture, request URLs and HTTP statuses, failed contract
check or exception class, first/latest failure times, and recent failing run
links. Request headers, credentials, and response bodies are not published.
HTTP errors and timeouts can be access or network failures; they do not prove
that the upstream API changed.

Scheduled runs restore counts from the newest scheduled **Endpoint Health**
artifact on the default branch. The `endpoint-health-state` artifact contains
`state.json` and the sanitized `report.json`, retained for 90 days. Runs are
serialized. Already recorded or older run IDs do not count twice. Samples are
saved before issue operations, so a GitHub reporting failure cannot turn a
passing check into an unbroken failure streak. Pending recovery and issue work
are retained for the next scheduled run or a rerun of the latest sample.
Malformed state or a reporting error fails the job; valid sampled state is still
retained after an issue-reporting error. If all retained state artifacts are
deleted or expire, the next scheduled check starts a new count.

Manual GitHub runs are diagnostic-only: they retain a sanitized report but do
not change counts or issues. Run the same probes locally:

```bash
./run.sh python3 scripts/check_endpoint_health.py \
  --report /tmp/Decky-Metadata/endpoint-health/report.json
```

Add `--only protondb-summary` (repeatable) for a local check of selected
endpoints. GitHub probes require authenticated `gh` access. The workflow uses
its `GITHUB_TOKEN` with read access to contents and Actions, plus issue write
access; no personal token is required.

`scripts/report_endpoint_health.py` defaults to a local dry run. Its
`--scheduled` flag advances only the supplied local state file; GitHub issue
writes additionally require `--apply`. The workflow also supplies `--restore`
to retrieve the previous scheduled state. Do not use `--apply` for local
experiments.

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
