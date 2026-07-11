# Plan: Deterministic Agent Workflow and Deck Diagnostics (deterministic-agent-workflow)

## Context

Recent project sessions repeatedly rebuilt the same higher-level workflows around
the already-committed Deck tooling: exhaustive log triage, environment and hook
preflight, selecting meaningful on-device fixtures, capturing a reproducible
diagnostic bundle, checking whether a package is current and actually delivered,
and searching versioned SteamUI assets. The repository already has the lower-level
primitives in `scripts/deck/`, package/version tooling, Git hooks, and the shared
`scripts/orchestration` symlink. This plan must compose those primitives rather
than duplicate or modify the shared orchestration engine.

The intended outcome is a project-local, deterministic agent workflow with three
layers:

1. tracked scripts perform low-freedom operations and emit stable text/JSON;
2. `AGENTS.md` defines mandatory routing independent of agent skill discovery;
3. one concise project skill teaches Claude/Codex when to invoke the scripts for
   change, device-investigation, and package-delivery modes.

Safety is part of the public contract. Read-only inspection must stay separate
from device mutation. Deploying a bundle, launching or terminating a game, copying
a package, or installing a skill/hook requires an explicit command flag or an
already-authorized modifying workflow. A Deck outage must never invalidate an
otherwise valid local merge: status must distinguish local validation, merge,
package creation, package delivery, and installed-plugin state.

Relevant existing files and extension points:

- `AGENTS.md`, `.protocol`, `run.sh`, and
  `docs/runbooks/on-device-verification.md`;
- `scripts/deck/{cdp.py,tunnel.sh,deploy.sh,logs.sh}` and
  `scripts/deck/verify/`;
- `scripts/sync_deck_logs.sh`, `scripts/post_commit.sh`, and
  `scripts/package.mjs`;
- `scripts/orchestration-hooks/{quality-gates,finalize-release}`;
- `scripts/orchestration` and `orchestration.conf`, which are inputs only and
  must not be changed by this feature;
- the currently empty `.agents/` and `.codex/` managed directories, which must
  not be used as canonical writable skill locations.

The canonical project skill will live in tracked repository content under
`skills/decky-project-workflow/`. Installation into an agent's discovery directory
is a separate, explicit action. The installer must support a destination override
for tests, default to dry-run, detect symlinked/external Git worktrees, and refuse
to modify those external worktrees without a second explicit opt-in. Normal
implementation and validation must not write to real `~/.claude/skills`,
`~/.codex/skills`, or the separate `agent-skills` repository.

This is a staged hardening change, not a second orchestration engine. Do not add
workflow lifecycle state, background polling, plan/review/finalize behavior, or
agent adapters to the new dispatcher. Do not wire package delivery into
`scripts/orchestration-hooks/finalize-release` in this plan: the existing
`post-merge` hook already performs delivery, and enabling both before the shared
primitive is proven idempotent risks duplicate builds and pushes. Preserve the
human gate for `dev` to `main` and preserve manual physical-controller checks
where the on-device runbook requires them.

**Slug used throughout this plan:** `deterministic-agent-workflow`

---

## Orchestration Contract

**Slug:** `deterministic-agent-workflow`

**Plan file:**

```text
docs/plans/2026-07-11_deterministic-agent-workflow.md
```

**Implementation branch:**

```text
feat/deterministic-agent-workflow
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/deterministic-agent-workflow_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/deterministic-agent-workflow_finalized
```

**Review notes:**

```text
docs/review/deterministic-agent-workflow-review-*.md
```

Each review note ends with exactly one status trailer:

```text
STATUS: CHANGES_REQUESTED
```

or:

```text
STATUS: APPROVED
```

---

## Required Agent Protocol

1. Use the **implementer** skill.
2. Work from the repository root.
3. Branch from `dev`.
4. Commit this plan as the first commit on the implementation branch.
5. Follow TDD where behavior changes are testable.
6. Run quality gates before marking any round complete.
7. Do not write your own review.
8. Do not create files under `docs/review/`.
9. Do not delete files under `docs/review/`.
10. Review notes are durable audit records and must be committed.
11. Resolving a review note means:
    - implement the requested changes;
    - run quality gates;
    - commit the code/docs changes;
    - commit the review note itself if it is not already committed;
    - recreate the round-complete marker.
12. After finalization, stop polling and exit cleanly.

---

## Scope discipline

- Implement only the units the plan lists. Do not modify files outside the plan's scope.
- Do not change runtime behavior beyond what the plan specifies. A `refactor` or
  `cleanup` commit must preserve observable behavior.
- Never edit a test's expected value to make a behavior change pass. If a test
  legitimately must change, that change must be required by the plan or a review
  note, and you must record the rationale in the session log.
- If you spot an unrelated improvement, do not make it here — note it in the
  session log for a separate plan.

---

## Setup

Start from `dev`:

```bash
git checkout dev
# ORCH_LOCAL_ONLY: local trial branch, skipping origin pull
git checkout -b feat/deterministic-agent-workflow
```

Commit this plan first:

```bash
git add docs/plans/2026-07-11_deterministic-agent-workflow.md
git commit -m "docs(plan): add deterministic-agent-workflow implementation plan"
```

---

## Implementation Tasks

### 1. Establish shared command contracts and test fixtures

Create `scripts/decky` as a thin Bash dispatcher. It may validate arguments and
delegate, but it must not reimplement log parsing, CDP, packaging, or orchestration.
Its initial public commands are:

```text
scripts/decky doctor [--deck] [--json] [--quiet]
scripts/decky verify-change [BASE_REF] [--explain] [--device] [--allow-launch] [--extended]
scripts/decky capture [--since TIMESTAMP] [--include-settings]
scripts/decky package-push [--build] [--push] [--force] [--json]
scripts/decky status [--deck] [--json]
scripts/decky steamui snapshot
scripts/decky steamui search PATTERN
```

Rules for every subcommand:

- resolve the repository root with `git rev-parse --show-toplevel` and operate
  from it;
- keep generated state below `/tmp/Decky-Metadata/`;
- use exit code `0` for success, `1` for a completed check that found a failure,
  and `2` for invalid usage;
- keep human output concise and send machine output only when `--json` is
  requested;
- never infer permission to mutate the Deck from `--deck`; that flag enables
  read-only remote inspection only;
- require `--device` for bundle deployment and `--allow-launch` for the smoke
  that starts and terminates a real game;
- preserve raw evidence whenever normalized output is generated.

Create reusable synthetic inputs under `tests/fixtures/agent_workflow/` for
plugin logs, rotated logs, metadata states, package manifests, hook bodies, and
SteamUI manifests. Do not copy real device metadata or user paths into fixtures.

Add `tests/test_decky_dispatcher.py` to pin help text, argument errors, exit-code
semantics, temp-root behavior, and delegation. Use fake executables placed first
on `PATH` for SSH/SCP/build integration tests; tests must never contact the real
Deck or install anything outside a pytest temp directory.

### 2. Add a read-only project and Deck doctor

Implement the doctor behind `scripts/decky doctor`, using a standard-library
Python module such as `scripts/decky_doctor.py` when structured output is easier
than Bash. Report checks in this stable shape:

```json
{
  "schema_version": 1,
  "overall": "PASS|WARN|FAIL",
  "checks": [
    {
      "id": "stable-check-id",
      "status": "PASS|WARN|FAIL|SKIP",
      "summary": "human-readable result",
      "details": {}
    }
  ]
}
```

Local checks must cover:

- repository root, current branch, dirty/untracked state, and the effective
  orchestration base from committed plus local configuration;
- required tools and dependency files;
- `package.json`/`plugin.json` version agreement;
- existence and exact delegate targets for pre-commit, post-commit, and
  post-merge hooks without changing the hooks;
- cache-policy variables from `.protocol`/`run.sh`, ignored cache artifacts,
  and any repository-local `__pycache__` directories;
- local package existence, embedded version/commit, SHA-256, and whether it
  represents current `HEAD`;
- the presence and executability of tracked Deck scripts and orchestration
  project hooks.

`--deck` adds bounded, read-only SSH/CDP checks for reachability, installed
plugin manifest/version, installed bundle hash, the fixed-name download zip
hash, log directories, and debugger readiness. It must never build, copy,
reload, launch, terminate, or edit remote files. Distinguish `WARN` for an
offline optional Deck from `FAIL` for malformed local project state.

Do not attempt a `node_modules` relocation in this feature. That change can
affect Node resolution and must be handled separately. Report the current
repo-local installation as a named warning while enforcing that npm, uv, pytest,
and Python bytecode caches are redirected. Update `run.sh`,
`scripts/orchestration-hooks/quality-gates`, and `scripts/post_commit.sh` only as
needed to share the existing cache environment and prevent new Python bytecode
caches; preserve current dependency-resolution behavior.

Add focused tests for PASS/WARN/FAIL aggregation, hook drift, dirty-tree
reporting, package staleness, offline Deck behavior, and JSON stability.

### 3. Implement deterministic local log auditing

Create `scripts/deck/log_audit.py` and extend `scripts/deck/logs.sh` with:

```text
logs.sh audit [--source PATH] [--since TIMESTAMP] [--appid ID] [--json]
```

When `--source` is omitted, `logs.sh audit` first calls the existing log-sync
path and audits the resulting local `latest` snapshot. The Python parser must
accept a snapshot directory or individual log file and inspect current plus
rotated plugin logs in chronological order.

The audit must:

- preserve raw source paths and representative first/last lines;
- identify startup/session boundaries and packaged version lines when present;
- count distinct `ERROR`, `WARNING`, traceback, and known diagnostic signatures;
- normalize only explicitly tested volatile fields such as timestamps, PIDs,
  request durations, and memory addresses;
- keep app IDs and URLs available as structured fields even when a normalized
  grouping replaces them in the display signature;
- report known signatures for backend import failure, patch-install failure,
  render-shield launch hijacks, cache-write churn, and HTTP failures;
- retain unknown errors instead of silently classifying them as noise;
- support `--since` and `--appid` filtering without modifying source files.

Exit nonzero only for configured fatal signatures or malformed inputs, not for
every warning. Store the human and JSON audit beside the active verification or
diagnostic run when invoked by `scripts/decky`.

Test normalization boundaries, rotated-log ordering, unknown-message retention,
filters, malformed lines, fatal classification, and deterministic JSON output.

### 4. Add semantic fixture selection and change-aware verification

Create `scripts/deck/verify/select_fixtures.py`. It must read a metadata JSON
file or stdin and deterministically classify candidates into these roles:

```text
listed_match
delisted_match
never_on_steam
```

Sort candidates by stable fields rather than input dictionary order. Include
appid, title, matched Steam appid, store state, and selection reason in the
manifest. Allow explicit environment/CLI overrides for every role. Never place
real user fixture data in the repository.

Launching is stricter than rendering checks: `smoke_launch.sh` may use only an
explicit `MATCHED_APPID`/launch fixture or a tracked allowlist entry. If no safe
launch fixture is configured, report `SKIP` unless `--allow-launch` is paired
with an explicit appid. Never launch an arbitrary first match.

Update `scripts/deck/verify/run_all.sh` to consume a timestamped fixture manifest
under `/tmp/Decky-Metadata/verification/<run-id>/fixtures.json`. Preserve legacy
environment overrides for compatibility. Extend the quick-links probe/smoke so
it verifies:

- listed match: expected rich Game Info metadata and quick-links row;
- delisted match: rich metadata remains but Market is absent;
- never-on-Steam: the dead quick-links row is absent while plugin metadata
  remains.

Add an optional `smoke_idle_quicklinks.sh` invoked only by `--extended`, with a
configurable bounded wait and state samples before/after the wait. Do not place
the extended check in default quality gates.

Implement conservative change classification for `scripts/decky verify-change`.
The command must compute and print the merge base and changed paths. Resolve the
default base from the effective orchestration configuration; accept an explicit
base override. Classification rules must include:

- backend/tests/docs-only changes: local gates only unless explicitly expanded;
- package/version/hook/tooling changes: targeted tooling and provenance tests;
- `src/steam/` and shared frontend types/helpers consumed by it: full on-device
  suite when `--device` is present;
- spoof/launch logic: launch and quick-links checks;
- router/render/activity logic: re-render and quick-links checks;
- unknown cross-cutting frontend changes: choose the broader frontend/Deck
  verification rather than fewer checks.

Without `--device`, print the required on-device commands and return a distinct
reported `DEFERRED` status while still running applicable local checks. With
`--device`, call the existing `deploy.sh` and smoke primitives. Require
`--allow-launch` before running the launch smoke. On a behavioral failure, call
diagnostic capture once; do not blindly retry. Infrastructure readiness may use
the existing bounded polling behavior.

Test path classification, effective-base resolution, merge-base errors,
fixture determinism, launch safety, deferred reporting, and failure routing with
fake tools.

### 5. Add privacy-conscious diagnostic capture and SteamUI snapshots

Create `scripts/deck/capture.sh` and route `scripts/decky capture` to it. Each run
creates `/tmp/Decky-Metadata/diagnostics/<timestamp>/` with a manifest describing
every command, status, and collected file. By default collect:

- synchronized plugin logs and selected bounded Steam client log excerpts;
- local/installed/download package versions, timestamps, and hashes;
- `cdp.py list` and the existing read-only state probe;
- doctor and log-audit JSON;
- the active verification fixture manifest and failed-command output when
  available;
- a redacted metadata summary containing counts/classifications, never the full
  settings file.

`--include-settings` may copy full plugin settings only after printing a privacy
warning and must record that choice in the manifest. Never upload, commit, or
copy a diagnostic bundle outside `/tmp/Decky-Metadata` automatically. Redact
known account identifiers, home paths, tokens, authorization headers, and query
parameters in derived reports while preserving untouched raw logs locally in a
clearly marked restricted subdirectory.

Create `scripts/deck/steamui.sh` with `snapshot` and `search` subcommands. It must
discover the live SteamUI directory read-only, record the Steam client build ID,
file manifest, sizes, and SHA-256 hashes, and store requested/matching JS/CSS
assets under `/tmp/Decky-Metadata/steamui/<build-id>/`. `search` operates on a
matching live-build snapshot and refuses to present an old snapshot as current;
allow an explicit historical-build argument for comparison. Do not vendor
SteamUI assets into the repository or diagnostics by default.

Test manifest construction, redaction, opt-in settings capture, temp-root
containment, stale-build refusal, and pattern argument safety with local fake
trees and fake SSH commands.

### 6. Consolidate package creation, delivery, and status without double hooks

Create `scripts/deck/package_push.sh` as the sole reusable package/delivery
primitive. `scripts/decky package-push` and `scripts/post_commit.sh` delegate to
it. Preserve the existing default branch rule: hooks package only on `dev` and
`main` unless `DECKY_POST_COMMIT_ALL=1` is set.

The primitive must separate stages and report each independently:

```text
LOCAL_VALIDATION
PACKAGE_CREATED
DELIVERY
INSTALLED_STATE
```

Requirements:

- build/package through `./run.sh npm run package` when `--build` is selected;
- validate the fixed archive name, embedded package/plugin versions, embedded
  Git commit, and local SHA-256 before any copy;
- use an exclusive lock below `/tmp/Decky-Metadata/package-state/` so concurrent
  post-commit/post-merge processes cannot race;
- record a ledger keyed by commit plus artifact SHA, but revalidate the actual
  local and remote files rather than trusting the ledger alone;
- copy only when `--push` is explicitly selected or when invoked by the existing
  authorized post-commit/post-merge hook path;
- compare the remote download SHA after SCP and report a transient verification
  failure separately from copy failure;
- inspect installed manifest/bundle hashes read-only and report
  `REINSTALL_REQUIRED` when the download is current but the installed plugin is
  older;
- treat an offline Deck as `DELIVERY_PENDING` for the nonblocking Git-hook path,
  while an explicitly requested `--push` exits nonzero if delivery cannot be
  confirmed;
- never install/uninstall the plugin, reload Steam, or promote `dev` to `main`.

Add `scripts/install_hooks.sh` with `--check` as the default and `--install` as
the explicit mutating mode. It installs exact thin delegates for pre-commit,
post-commit, and post-merge. Test it only against a temporary fake Git directory.

Do not change `scripts/orchestration-hooks/finalize-release` from its current
no-op in this implementation. Document that enabling it is a later decision
after real workflows demonstrate lock/idempotency behavior; otherwise finalize
and post-merge can perform duplicate delivery attempts.

Test lock behavior, current/stale archives, embedded-version mismatch, remote
checksum success/failure, offline hook semantics, explicit-push failure,
installed-version reporting, and exact hook bodies with fake commands.

### 7. Add one canonical project skill and agent-independent routing

Create the canonical skill at:

```text
skills/decky-project-workflow/SKILL.md
skills/decky-project-workflow/agents/openai.yaml
```

Use the available `skill-creator` initialization and generation scripts rather
than hand-building scaffolding. Keep `SKILL.md` concise and imperative. Its YAML
frontmatter must contain only `name` and a description that triggers for this
repository when an agent is asked to implement/change/refactor, diagnose live
Deck behavior or logs, verify SteamUI behavior, package/send/check a build, or
continue a Decky-Metadata orchestration workflow.

The skill body must:

- read `AGENTS.md` and the relevant runbook first;
- choose exactly one starting mode: `change`, `device-investigation`, or
  `package-delivery`, while allowing an implementation to progress through
  later modes;
- call `scripts/decky` rather than restating its implementation;
- delegate plan/implement/review/finalize lifecycle to the existing
  `orchestration-plan-author` and `orchestrated-implementation` skills and
  `scripts/orchestration` commands;
- state that diagnosis/review is read-only unless the user requests changes;
- require explicit device/deploy/launch/push flags and preserve manual human
  gates;
- direct failures to the diagnostic-bundle path and forbid ad-hoc replacements
  for existing `scripts/deck/` tools.

Create `scripts/install_project_skill.sh`. Default behavior is dry-run and
prints the source, resolved destination, and intended link/copy. Support
explicit `--install`, a destination override, and named Claude/Codex defaults.
If the resolved destination is a symlink into or is contained by another Git
worktree, refuse without `--allow-external-worktree`. Never run real-home
installation during automated validation. Test installation, repeat
installation, conflict refusal, external-worktree refusal, and uninstall-free
behavior under pytest temp directories.

Update `AGENTS.md` with a compact mandatory trigger table so correct behavior
does not depend on skill discovery. Include start-of-change doctor, log-audit,
change-aware verification, diagnostic capture, package delivery/status, device
mutation flags, and the unchanged `dev` to `main` human gate. Update
`docs/runbooks/on-device-verification.md` and add
`docs/runbooks/agent-workflow.md` as the single detailed workflow reference;
skill and `AGENTS.md` content should link to it instead of copying it.

Update `README.md` only with user-facing contributor commands and installation
notes for the optional project skill. Do not turn the README into an internal
agent manual.

Validate the skill with the `skill-creator` quick validator. Add repository
tests that parse its frontmatter, confirm trigger phrases and safety boundaries,
verify referenced commands exist, and ensure the skill does not claim to own
or modify orchestration lifecycle behavior.

### 8. Complete project validation and documentation

Add a session record under `docs/agent_conversations/` containing the objective,
files changed, architecture decisions, explicit non-goals, test results, and all
deferred live checks. Run `bash -n` over every new/modified shell script and
Python syntax checks through `./run.sh`.

Do not modify unrelated untracked JSON files present in the user's worktree. Do
not delete ignored caches or artifacts as part of this feature. Do not change
plugin runtime behavior in `main.py`, `backend/`, or `src/` except for a generated
`dist/index.js` refresh caused by the standard quality gate; if the build is
byte-identical, preserve the existing artifact.

---

## Quality Gates

Run before marking any round complete:

```bash
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
git status --short
```

The round is not complete unless:

1. all requested implementation work is done;
2. all relevant tests pass;
3. build/typecheck gates pass;
4. review notes have not been deleted;
5. the working tree is clean;
6. all code/docs changes are committed.

---

## Verification

Run targeted tests while implementing each unit, then run the complete local
validation ladder from the repository root:

```bash
./run.sh python3 -m py_compile \
  scripts/decky_doctor.py \
  scripts/deck/log_audit.py \
  scripts/deck/verify/select_fixtures.py

for script in \
  scripts/decky \
  scripts/deck/capture.sh \
  scripts/deck/steamui.sh \
  scripts/deck/package_push.sh \
  scripts/install_hooks.sh \
  scripts/install_project_skill.sh \
  scripts/post_commit.sh \
  scripts/deck/logs.sh \
  scripts/deck/verify/run_all.sh; do
  bash -n "$script"
done

./run.sh uv run --with pytest -- pytest -q \
  tests/test_decky_dispatcher.py \
  tests/test_decky_doctor.py \
  tests/test_deck_log_audit.py \
  tests/test_deck_fixture_selection.py \
  tests/test_deck_diagnostic_capture.py \
  tests/test_deck_steamui.py \
  tests/test_deck_package_push.py \
  tests/test_install_hooks.py \
  tests/test_install_project_skill.py \
  tests/test_decky_project_skill.py

./run.sh scripts/decky doctor --json
./run.sh scripts/decky verify-change dev --explain
./run.sh scripts/install_hooks.sh --check
./run.sh scripts/install_project_skill.sh \
  --dest /tmp/Decky-Metadata/skill-install-test

python3 /home/beallio/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  skills/decky-project-workflow

scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
git diff --check dev...HEAD
git status --short
```

If the detected `skill-creator` helper path differs at implementation time,
locate the active helper from the selected skill installation and record the
resolved path in the session log; do not copy the validator into this repository.

The automated tests must demonstrate all of the following without live network
or home-directory writes:

1. read-only commands cannot invoke SCP, deploy, reload, launch, terminate, hook
   installation, or skill installation;
2. device mutation flags are rejected when their required consent pair is
   missing;
3. change classification selects broader checks for unknown cross-cutting
   frontend changes and resolves the effective base correctly;
4. fixture selection is stable across input ordering and never chooses an
   arbitrary launch target;
5. log audit preserves unknown errors and raw evidence while grouping only
   tested volatile fields;
6. capture and SteamUI snapshots stay below `/tmp/Decky-Metadata` and respect
   redaction/opt-in boundaries;
7. package delivery is locked and idempotent, reports partial stages accurately,
   and differentiates an offline hook from a failed explicit push;
8. skill and hook installers default to non-mutating checks/dry-runs and refuse
   external Git worktrees without explicit opt-in;
9. no command modifies the symlinked `scripts/orchestration` engine or claims to
   replace its lifecycle state.

Live Deck verification is intentionally deferred until the implementation has
passed review and the user confirms the Deck is available. The orchestrator must
record these checks as deferred rather than failing local completion solely
because the Deck is offline. When authorized, run these read-only checks first:

```bash
scripts/decky doctor --deck
scripts/deck/logs.sh audit --json
scripts/decky capture
scripts/decky steamui snapshot
scripts/decky steamui search 'BIsModOrShortcut|bCommunityMarketPresence'
scripts/decky verify-change dev --explain
```

Confirm that all outputs are below `/tmp/Decky-Metadata`, no remote file changed,
the diagnostic manifest lists every collection result, and the selected fixture
manifest identifies meaningful listed/delisted/never-on-Steam roles.

Only with explicit authorization for a modifying on-device validation run, run:

```bash
scripts/decky verify-change dev --device
```

This may deploy/reload but must skip the real launch smoke without
`--allow-launch`. If the user also explicitly authorizes launching the configured
safe fixture, run:

```bash
MATCHED_APPID=<approved-appid> \
  scripts/decky verify-change dev --device --allow-launch
```

The physical-controller Play/focus checks from
`docs/runbooks/on-device-verification.md` remain manual and must be reported as
manual evidence, not inferred from CDP. Do not install the canonical skill into
real Claude/Codex directories during this implementation round; validate the
installer under `/tmp` and hand the explicit installation command to the user
after approval. Do not enable package delivery from `finalize-release` in this
round.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished deterministic-agent-workflow
```

This writes:

```text
/tmp/Decky-Metadata/deterministic-agent-workflow_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer deterministic-agent-workflow`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/deterministic-agent-workflow-review-*.md
```

When a review note exists or a new review note appears:

1. Read the full review note.
2. If the note ends with:

   ```text
   STATUS: CHANGES_REQUESTED
   ```

   then resume work.

3. Clear the round-complete marker:

   ```bash
   scripts/orchestration/clear-finished deterministic-agent-workflow
   ```

4. Address every requested change.
5. Run quality gates:

   ```bash
   scripts/orchestration/run-quality-gates
   scripts/orchestration/check-review-notes-not-deleted
   ```

6. Commit code/docs fixes.
7. Commit the review-note file itself if it is not already committed:

   ```bash
   git add docs/review/deterministic-agent-workflow-review-*.md
   git commit -m "docs(review): record deterministic-agent-workflow review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished deterministic-agent-workflow
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer deterministic-agent-workflow` after the next review note is created.

---

## Approval Handling

If the latest review note ends with:

```text
STATUS: APPROVED
```

then:

1. Confirm every previous review item has been addressed.
2. Confirm all review notes are committed:

   ```bash
   scripts/orchestration/check-review-notes-committed deterministic-agent-workflow
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize deterministic-agent-workflow
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/deterministic-agent-workflow_finalized
   ```

6. Stop polling and exit cleanly.

---

## Review Rules

Do not write your own review.

Do not create files under:

```text
docs/review/
```

Do not delete files under:

```text
docs/review/
```

Only the orchestrator writes review notes. Your job is to read them, resolve them, commit them as audit records, and continue the loop.

---

## Finalization Rules

Only finalize after a review note with:

```text
STATUS: APPROVED
```

Finalization is performed with:

```bash
scripts/orchestration/finalize deterministic-agent-workflow
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/deterministic-agent-workflow_finished
/tmp/Decky-Metadata/deterministic-agent-workflow_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
