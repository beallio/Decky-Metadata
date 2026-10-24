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
./run.sh cargo build --locked --manifest-path backend-rust/Cargo.toml --bin backend-diagnostics
./run.sh python3 scripts/check_endpoint_health.py \
  --report "${TMPDIR:-/var/tmp/omp-1000}/endpoint-health/report.json"
```

Add `--only protondb-summary` (repeatable) for a local check of selected
endpoints. GitHub probes require authenticated `gh` access. The workflow uses
its `GITHUB_TOKEN` with read access to contents and Actions, plus issue write
access; no personal token is required.

Rust `1.99.0` is required for the backend and host diagnostics. ZIP builds also
need the `x86_64-unknown-linux-musl` target and musl C tools. `npm run build`
still builds only the frontend; `npm run build:backend` builds the locked static
backend. `npm run test:backend` runs the Rust behavior tests.

The three Python diagnostic adapters run the existing host
`backend-diagnostics` executable from `$CARGO_TARGET_DIR/debug`; they never build
or download it implicitly. `run.sh` defaults that directory to
`${TMPDIR}/cargo-target/Decky-Metadata`. The native checks reuse the plugin's
providers and updater validation. Independent Python probes and HLS/DASH checks remain.

`scripts/report_endpoint_health.py` defaults to a local dry run. Its
`--scheduled` flag advances only the supplied local state file; GitHub issue
writes additionally require `--apply`. The workflow also supplies `--restore`
to retrieve the previous scheduled state. Do not use `--apply` for local
experiments.

## Backend rewrite comparison

`scripts/deck/benchmark_backend.py` compares the pinned Python package on upstream
Loader, the Rust package on the same upstream Loader, then that exact Rust ZIP on
the pinned fork. It is a VM-only developer tool, not a normal deployment command.
It requires exclusive use of the VM, working non-interactive administrator access,
and an existing CDP tunnel. It does not launch games or replace the normal install.

Pinned inputs (both harness files check them):

|Input|Pin|
|---|---|
|Upstream Loader|`SteamDeckHomebrew/decky-loader` `v3.3.0` `PluginLoader` (tag commit `67196adf`); get it with `gh release download v3.3.0 -R SteamDeckHomebrew/decky-loader -p PluginLoader` and check the release asset digest|
|Fork Loader|`beallio/decky-loader` `main` at `98bce11`, a runtime bundle built from source|
|Plugin SDK and shim|the same `98bce11`: `backend-rust/Cargo.toml` `decky-plugin` `rev`, and root `main.py` copied from `backend-rust/decky-plugin/shim/main.py`|

Build the fork bundle from a detached clone of that commit. Its build checks the
upstream `v3.3.0` tag, so fetch it first:

```bash
git -C "$FORK" fetch https://github.com/SteamDeckHomebrew/decky-loader 'refs/tags/v3.3.0:refs/tags/v3.3.0'
python3 "$FORK/scripts/runtime/build.py" --release-version dev --output "$RUN_ROOT/fork-runtime"
```

Use the fork's pinned Rust toolchain (`backend-rust/build-config.json`), not this
repository's. Pass `"$RUN_ROOT/fork-runtime/bundle"` as `--fork-runtime`. When you
move a pin, change the SDK, the shim and the harness constants together.

Resolve the evidence directory with `./run.sh python3 scripts/deck/temp_paths.py root`.
Pass the original ZIP, candidate ZIP, upstream executable and complete fork bundle
with `--python-zip`, `--rust-zip`, `--upstream-runtime` and `--fork-runtime`.
Use `--host steamdeck-vm --cdp-port 18082 --scratch-homebrew scratch-homebrew`
and a new `--output-dir` below that evidence root.

Run `--dry-run` first. It captures the installed state, exercises a real disposable
watchdog service, and verifies recovery. Use `--ui-arm A`, then `B`, then `C` to
hold each scratch Loader open for ZIP installation through QAM and correctness
checks. Register shortcut-name undo with the printed remote helper before a name
check. Send `finish` on standard input only after the arm's checks are complete.
GUI mode leaves the plugin destination absent. Do not pre-create it: the fork
refuses an occupied directory that has no installed plugin manifest.
Timed mode requires `--verification-record` with all three arms and their exact
artifact hashes; see the script's validation contract for the record fields.

Native Library shortcuts may come from another computer and have no local VDF
entry. Check `get_local_shortcuts` and name-management eligibility before a name
test. With explicit approval, the printed remote helper's `shortcuts` command
(with `{}` on stdin and the run's `--ledger`) creates three marked local test
shortcuts. It copies `/usr/bin/true` into the private run directory, uses Steam's
own shortcut preview, and records undo before each creation. Never launch them.
The helper backs up local shortcut files but never restores a whole live VDF.
Recovery removes only unchanged task entries; an unpublished or ambiguous
creation remains unresolved instead of being reported as removed.

Take another VDF backup before the name test, then register `name-undo` before
using its visible controls. After closing QAM, focus the main Steam target with
CDP `Page.bringToFront` before an editor screenshot. A background target can
have a populated DOM while its screenshot is black.

CEF forwarding checks preserve the socket's activation and unit definition.
Its proxy process can start on a connection or exit when idle; that alone is
not a restoration conflict. Scratch Loader settings follow the saved socket
policy, and recovery does not start or stop the proxy to mimic a transient PID.

Each dataset has five trials per arm. Browser RPC timers exclude response
validation; throughput includes it. Startup measures authenticated backend
readiness from a pre-primed Steam document, not a cold filesystem or a full
webhelper restart. An early document hook tracks every Loader update/catalog
check before timing. Idle, warmup and workload windows use the VM's monotonic
clock; host control gaps are excluded. Per-phase CPU is interpolated from 5 Hz
cgroup samples, and memory peaks are sampled peaks.
The collector keeps a fixed 5 Hz schedule. It catches up when less than one
period late and rejects a full-period delay. Actual timestamps remain in the
raw samples.

Each timed preparation first destroys the previous native browser clients,
before writing the next fixture or arming its observer. This prevents retained
CEF heaps from accumulating across long trials. The reset is outside every
measurement window; backend startup still begins with a ready Steam document.
Long workload commands allow up to 30 minutes without changing RPC sample counts.

Priming enables the CDP Page domain before registering the early hook. It waits
for the owned marker across the reload; observer cleanup checks the run identity.
The hook does not change child frames. Recovery also resets the native context
when preparation stopped the original Loader but the test Loader never started.

Recovery first drains scratch processes and resets Steam's browser clients.
It then undoes marked shortcut and name changes with a fresh native context,
before restoring the original Loader and normal RPC access. Queued test writes
cannot replay against normal settings.
Files, names and service selection are checked against the undo ledger; a later independent change is a
conflict, not permission to overwrite it. Keep raw results and recovery evidence
outside the repository.

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
