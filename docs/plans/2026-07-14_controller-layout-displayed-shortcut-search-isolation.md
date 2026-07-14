# Plan: Controller Layout Displayed Shortcut Search Isolation (controller-layout-displayed-shortcut-search-isolation)

## Context

The controller-layout source-cache fixes already merged into `dev` correctly
remove inactive matched Steam source appids, but Controller Settings Search still
shows configuration records belonging to previously viewed non-Steam shortcuts.
The user reproduced the defect by opening **Warhammer 40,000: Space Marine**
(shortcut `2155012430`, matched source `55150`), then **Assassin's Creed:
Director's Cut** (shortcut `2312439508`, matched source `15100`), and finally
**X-Men Origins: Wolverine** (shortcut `3156562597`, no matched source).

Read-only live inspection of the installed `0.1.1+9667394` bundle proved that the
current wrapper is executing and that matched-source isolation works:

- after Assassin's Creed becomes current, source `55150` is absent and source
  `15100` is present, but Space Marine shortcut `2155012430` still contributes
  71 Search records;
- after X-Men becomes current, both matched sources are absent, but Space Marine
  shortcut `2155012430` and Assassin's Creed shortcut `2312439508` still
  contribute 71 and 72 records respectively; and
- the breaker did not trip, so this is a missing policy dimension rather than a
  SteamUI contract failure.

`src/steam/controllerLayouts.ts` currently stores only
`activeMatchedSourceAppid` and session-local supplemental source appids. Its
`resolveSource: (displayedAppid) => number | null` dependency conflates three
different contexts: a native Steam app, an unmatched non-Steam shortcut, and a
matched non-Steam shortcut. Consequently `GetAllConfigs()` has no safe primitive
state identifying the current displayed shortcut and cannot remove inactive
shortcut-owned records.

The repository already defines Steam shortcut appids deterministically in
`backend/shortcuts_vdf.py`: the unsigned 32-bit CRC is ORed with `0x80000000`.
That namespace lets the pure Search policy recognize shortcut-owned records,
including records cached before the current plugin session, without enumerating
`controllerConfiguratorStore.m_mapAppConfigs`, `appStore`, overview objects,
metadata, or any MobX store. Use this first-party invariant; do not rely only on
a session-local set of shortcuts visited after plugin load, because that would
leave pre-startup stale caches visible.

The intended result is:

| Current Controller Settings context | Search behavior |
| --- | --- |
| Matched non-Steam shortcut | Keep the current shortcut and current matched Steam source; remove other shortcut records and inactive plugin-supplemental sources. |
| Unmatched non-Steam shortcut | Keep the current shortcut; remove other shortcut records and every inactive plugin-supplemental source. |
| Native Steam app | Preserve native shortcut-record behavior; continue filtering only inactive sources that this plugin classified as supplemental, including direct-source relinquishment. |
| Unknown/incompatible context | Trip the existing shared breaker once, show the existing toast once, return the secured native result, and leave all later wrappers native-only. |

Relevant implementation and tests are:

- `src/steam/controllerLayoutPolicy.ts` and
  `src/steam/controllerLayoutPolicy.test.ts` for pure source/context resolution,
  shortcut-appid classification, and stable Search filtering;
- `src/steam/controllerLayouts.ts` and
  `src/steam/controllerLayouts.test.ts` for adapter-local displayed context,
  native-first wrappers, cache reuse, cleanup, and the shared circuit breaker;
- `src/steam/install.ts` for the production resolver using `getOverview`,
  `isNonSteamAppWithoutPatchedMethod`, and `metadataCache`;
- `scripts/deck/js/check_controller_layouts.js`,
  `scripts/deck/verify/smoke_controller_layouts.sh`, and
  `tests/test_deck_fixture_selection.py` for the bounded live regression; and
- `README.md`, `dist/index.js`, `dist/index.js.map`, and a dated session record
  for shipped behavior and audit evidence.

Preserve the performance improvement from the prior cache-isolation work. Search
must remain one native call plus one linear, side-effect-free pass over the
returned array. It must not resolve metadata, query a Steam bridge, enumerate or
write a store, or trigger another controller-layout request. Section getters and
the query wrapper must resolve displayed context at most once per native call.

This task changes no backend behavior or persistent data. It does not select,
preview, export, delete, or save a layout. Device deployment and the bounded
configuration queries are allowed only after explicit current approval through
the escalation mechanism; read-only status/log inspection may precede that
gate. Automatic ZIP copying performed by the already-authorized `dev`/`main`
post-commit or post-merge hook remains allowed, but package installation, SteamUI
reload, navigation, and test queries are not implicitly authorized by that hook.

**Slug used throughout this plan:** `controller-layout-displayed-shortcut-search-isolation`

---

## Orchestration Contract

**Slug:** `controller-layout-displayed-shortcut-search-isolation`

**Plan file:**

```text
docs/plans/2026-07-14_controller-layout-displayed-shortcut-search-isolation.md
```

**Implementation branch:**

```text
feat/controller-layout-displayed-shortcut-search-isolation
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/controller-layout-displayed-shortcut-search-isolation_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/controller-layout-displayed-shortcut-search-isolation_finalized
```

**Review notes:**

```text
docs/review/controller-layout-displayed-shortcut-search-isolation-review-*.md
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
git checkout -b feat/controller-layout-displayed-shortcut-search-isolation
```

Commit this plan first:

```bash
git add docs/plans/2026-07-14_controller-layout-displayed-shortcut-search-isolation.md
git commit -m "docs(plan): add controller-layout-displayed-shortcut-search-isolation implementation plan"
```

---

## Implementation Tasks

### 1. Capture the regression with failing tests before changing production code

Inspect the current implementation and preserve the existing five-descriptor
transaction and test harness. Add focused failing tests first in
`src/steam/controllerLayoutPolicy.test.ts` and
`src/steam/controllerLayouts.test.ts`.

1. Model the exact live sequence with these appids:
   - Space Marine shortcut `2155012430`, source `55150`;
   - Assassin's Creed shortcut `2312439508`, source `15100`; and
   - X-Men shortcut `3156562597`, no source.
2. Seed the native Search result with records for all three shortcut appids,
   both matched source appids, at least one unrelated native Steam appid, an
   opaque record with no usable appid, and a record whose `appID` getter throws.
   Seed these records before invoking any wrapper so the test proves isolation
   of caches that predate adapter tracking.
3. Prove the current implementation fails because Space Marine shortcut records
   survive after Assassin's Creed becomes current and both prior shortcuts
   survive after X-Men becomes current. Preserve the red-test command/output in
   the session record; do not commit a deliberately failing final tree.
4. Add pure policy cases for the unsigned 32-bit shortcut namespace boundaries:
   `0x80000000` and `0xffffffff` are shortcut appids; `0x7fffffff`, zero,
   negatives, fractions, infinities, `NaN`, numeric strings, and values above
   `0xffffffff` are not. Do not use signed bitwise coercion as the public
   predicate result.
5. Add context-resolution tests distinguishing native Steam, unmatched
   non-Steam, matched non-Steam, invalid displayed ids, invalid matched ids, and
   a source equal to the displayed appid. Invalid input must fail closed to no
   augmentation or produce the adapter's existing fail-open breaker path; it
   must never manufacture a source.

### 2. Replace the ambiguous source resolver with a defensive context contract

Update `src/steam/controllerLayoutPolicy.ts`, `src/steam/install.ts`, and the
corresponding tests.

1. Introduce a small immutable `ControllerLayoutContext` data shape containing:
   - `isNonSteamShortcut: boolean`; and
   - `matchedSourceAppid: number | null`.
2. Evolve `resolveControllerLayoutSource` and its input into a context resolver
   (rename it if that makes the contract unambiguous). It must:
   - return `isNonSteamShortcut: false` and no source for a native/unknown app;
   - return `isNonSteamShortcut: true` and no source for an unmatched shortcut;
   - return `isNonSteamShortcut: true` plus the positive, finite, different real
     Steam appid for a matched listed or delisted shortcut; and
   - reject malformed source metadata without throwing or guessing.
3. Change the production dependency in `src/steam/install.ts` to resolve the
   context with one guarded `getOverview(displayedAppid)` lookup, the existing
   unpatched non-Steam predicate, and the existing `metadataCache` entry. Never
   enumerate `metadataCache` or a Steam/MobX store to resolve one app.
4. Change `ControllerLayoutDependencies` from `resolveSource` to the richer
   resolver and update all harnesses/call sites. Keep this contract synchronous,
   primitive, and adapter-owned; do not add React state, a listener, a global,
   persistence, or a backend call.
5. Treat a thrown resolver, a malformed returned context, a matched source on a
   context declared native, or an invalid non-null matched source as a plugin
   runtime incompatibility. Secure the native result first, clear stale active
   context, trip the existing breaker once, request the existing toast once,
   and make every later wrapper native-only.

### 3. Track the active displayed shortcut without touching Steam state in Search

Update `src/steam/controllerLayouts.ts` and
`src/steam/controllerLayouts.test.ts`.

1. Add adapter-local `activeDisplayedShortcutAppid: number | null` beside
   `activeMatchedSourceAppid`. Do not add a MobX observable or persist it.
2. Replace `establishDisplayedContext` with one shared bounded helper used by
   the query wrapper and all Official, Template, and Workshop getter wrappers.
   On every call it must:
   - clear both active appids before resolving, so failures cannot retain the
     previous game's Search context;
   - accept only a finite positive displayed appid;
   - resolve and validate the richer context exactly once;
   - set the active displayed appid only when the context is a genuine
     non-Steam shortcut; and
   - set the active matched source only for a valid matched shortcut.
3. Preserve native-first semantics. Every captured native query/getter/Search
   original runs first and exactly once; native throws escape unchanged and are
   never retried, reported as plugin failures, or converted to toasts.
4. Preserve exact supplemental-query-key reuse and the existing
   `m_mapAppConfigs.has`/`set` behavior outside render. Do not add another source
   query, cache reset, map read, or map write. Direct native access to a tracked
   source appid must still relinquish only that source's adapter-local
   supplemental classification and query key.
5. Pass only the already-secured native Search array, the two active primitive
   appids, and the read-only supplemental-source set to the pure filter.
   `GetAllConfigs` must not call the resolver, `getOverview`, `metadataCache`,
   `m_mapAppConfigs`, or any Steam/MobX API.
6. Clear both active appids, the supplemental-source set, and query-key state on
   breaker trip and idempotent cleanup. Preserve reverse-order exact descriptor
   restoration and rollback if any of the five descriptor installs fails.
7. Extend the hostile map/store test doubles so Search throws the test if it
   calls `has`, `set`, `get`, `delete`, `clear`, `size`, iteration, `entries`,
   `keys`, `values`, `forEach`, or the context resolver. Confirm the fixed Space
   Marine -> Assassin's Creed -> X-Men sequence remains render-safe.

### 4. Isolate inactive shortcut records in the pure Search policy

Update `src/steam/controllerLayoutPolicy.ts` and
`src/steam/controllerLayoutPolicy.test.ts`.

1. Add a pure numeric helper based on the repository's shortcut-id invariant:
   an appid is a shortcut id only when it is an integer in the inclusive unsigned
   32-bit range `0x80000000..0xffffffff`. Document the link to
   `backend/shortcuts_vdf.py` in a concise source comment. Do not enumerate known
   shortcuts or use SteamUI methods to classify Search records.
2. Extend `filterControllerSearchConfigs` to accept the active displayed
   shortcut appid as a separate argument. For each record with a safely readable
   positive numeric `appID`:
   - remove a tracked supplemental source unless it equals the active matched
     source;
   - when a non-Steam shortcut is active, remove every shortcut-namespace appid
     except the active displayed shortcut; and
   - otherwise preserve the record.
3. When a native Steam context is active (no active displayed shortcut), do not
   broadly remove shortcut-namespace records. Preserve Steam's standard native
   Search behavior and apply only the existing plugin supplemental-source
   isolation/relinquishment policy.
4. Preserve the current shortcut even when it has no matched source. Preserve
   the current matched source, unrelated native Steam records, opaque/malformed
   records, input order, record identity, and the input array. If no record is
   removed, return the original native array identity rather than allocating an
   equivalent copy.
5. A non-array native Search value remains a typed policy failure. The Search
   wrapper must return that exact native value, trip the shared breaker once,
   show the warning toast once, and use native-only behavior thereafter.
6. Do not log record URLs, controller layout contents, or other potentially
   identifying configuration data. Diagnostics remain bounded to section,
   failure code, and relevant numeric appids.

### 5. Expand the existing bounded live regression without adding a new framework

Update only as necessary:

- `scripts/deck/js/check_controller_layouts.js`;
- `scripts/deck/verify/smoke_controller_layouts.sh`;
- `tests/test_deck_fixture_selection.py`; and
- `docs/runbooks/on-device-verification.md`.

1. Extend the existing listed-match -> delisted-match -> never-on-Steam sequence
   so one probe observes Search after the second and third displayed shortcuts.
   Reuse the semantic fixtures; do not hard-code game names into fixture
   selection, although evidence must include the actual numeric appids selected.
2. After the second shortcut becomes current, assert:
   - the first displayed shortcut count is zero;
   - the first matched-source count is zero;
   - current shortcut records remain when its query returned any; and
   - current source records remain when its source getters returned any.
3. After the never-on-Steam shortcut becomes current, assert both prior displayed
   shortcut counts and both prior matched-source counts are zero. If the current
   shortcut query returned records, assert its displayed appid remains present.
4. Keep the probe bounded and privacy-preserving: output appids, booleans,
   elapsed durations, counts, and URL hashes only. Do not output raw layout URLs
   or contents and do not select, preview, export, delete, save, navigate to, or
   launch anything.
5. Preserve the static forbidden-operation assertions. The probe may use the
   existing controller query and getter APIs and read `GetAllConfigs`; it must
   not directly mutate or enumerate `m_mapAppConfigs` and must not monkey-patch
   SteamUI.
6. Record per-step elapsed time so a large navigation/loading regression is
   visible in evidence, but use counts/policy invariants rather than a brittle
   wall-clock threshold as the automated pass condition.
7. Update the runbook only if needed to state that the controller smoke populates
   Steam's in-memory controller cache and therefore requires explicit device
   approval even though it does not persist a selection or launch a game.

### 6. Build, document, and keep the change narrowly scoped

1. Update the Controller Settings feature bullet in `README.md` to state that
   Search isolates both inactive matched sources and inactive non-Steam shortcut
   caches, including caches that predate the current plugin session and current
   shortcuts with no match. Preserve the standard-UI/circuit-breaker promise.
2. Regenerate and commit `dist/index.js` and `dist/index.js.map` through the
   normal build. Do not hand-edit bundle artifacts.
3. Create
   `docs/agent_conversations/2026-07-14_controller-layout-displayed-shortcut-search-isolation.md`
   recording the defect, live root-cause evidence, the context contract, the
   shortcut-id invariant, files changed, red/green tests, performance/safety
   invariants, validation results, and device verification status.
4. Do not change `main.py`, `backend/`, metadata persistence/matching, quick-link
   policy, layout selection/preview/export behavior, package versions, tags, or
   unrelated documentation/tests. `backend/shortcuts_vdf.py` is evidence only.
5. Do not commit `Decky-Metadata.zip`, device evidence, caches, `node_modules`,
   or the unrelated untracked
   `docs/review/2026-07-13_gpt-5_dev_thermo-nuclear-review.md`.
6. Use Conventional Commits and keep tests/policy/adapter/docs coherent. The
   final implementation branch must be clean before marking the round complete.

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

### Required pre-change routing

Run and record before implementation:

```bash
scripts/decky doctor
scripts/decky verify-change dev --explain
```

The second command is local because `--device` is absent. Preserve the expected
doctor warnings for the unrelated untracked review and repository-local
`node_modules`; investigate any new warning or failure.

### Focused red/green and static verification

Run through the cache-isolating wrapper:

```bash
./run.sh npm test -- src/steam/controllerLayoutPolicy.test.ts src/steam/controllerLayouts.test.ts
./run.sh npx tsc --noEmit
./run.sh node --check scripts/deck/js/check_controller_layouts.js
./run.sh bash -n scripts/deck/verify/smoke_controller_layouts.sh
./run.sh uv run --with pytest -- pytest -q tests/test_deck_fixture_selection.py
git diff --check dev...HEAD
```

Focused acceptance requires:

1. the red tests fail against the pre-change implementation for retained
   shortcut appids, then pass after the fix;
2. Assassin's Creed Search retains only its current shortcut/current source
   among the three fixture shortcuts and two tracked sources;
3. X-Men Search retains its own shortcut records when present and removes both
   previous shortcuts and both previous sources;
4. native Steam context preserves standard shortcut-record behavior;
5. pre-session shortcut records are isolated without a visited-shortcut set;
6. no Search path accesses the resolver, metadata, Steam stores, or the
   configuration map;
7. no extra controller query/reset occurs and repeated query-key reuse remains;
8. native throws/results/identity, opaque records, order, circuit-breaker toast,
   transactional rollback, cleanup, and direct-source relinquishment remain
   covered; and
9. no raw controller configuration URL/content is emitted by live evidence.

### Full local quality gate

Run before every round-complete marker:

```bash
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
git status --short
```

Confirm the expected full gate passes TypeScript, Rollup regeneration, all
Vitest tests, backend byte-compilation, all pytest tests, version drift checks,
and review-note preservation. The only permissible pre-existing untracked path
is the unrelated thermo-nuclear review; do not stage, edit, delete, or claim it.

### Explicitly approval-gated on-device verification

Because this change touches `src/steam/`, live verification is required before
the fix is accepted. The live controller smoke populates Steam's in-memory
controller configuration cache, and deployment/reload changes device state.
Before any command that deploys, reloads, navigates, or issues controller
configuration queries, request explicit current approval through the escalation
mechanism. Do not treat this plan, the package-copy hook, SSH availability, or a
prior approval as authorization for that device-changing run.

Read-only preparation may run first:

```bash
scripts/decky status --deck
scripts/decky doctor --deck
scripts/deck/logs.sh audit --json
```

After explicit approval, run the committed change-aware path without a launch:

```bash
scripts/decky verify-change dev --device --explain
```

This deployment runs `run_all.sh --no-launch`, including the controller smoke.
The dispatcher will correctly report `STATUS DEFERRED` afterward because its
conservative `src/steam/` classification also requires the separate launch
smoke. Treat that status as a named launch gate, not as a controller-smoke
failure. Confirm the deployed bundle identifies the implementation commit, the
controller smoke executes the listed -> delisted -> never-on-Steam sequence,
both inactive displayed shortcut appids and both inactive matched source appids
reach zero at the required transitions, the current shortcut/source remain when
results exist, the probe completes without significant new delay, and logs
contain no controller-layout failure/breaker signature or SteamUI error.

If a full dispatcher `STATUS PASS` is required, request a second, explicit
approval that names the configured safe shortcut and states that the game will
be launched briefly and terminated. Only after that separate approval run:

```bash
MATCHED_APPID=<explicitly-approved-safe-shortcut-id> \
  scripts/decky verify-change dev --device --allow-launch --explain
```

Never substitute an auto-selected fixture for the placeholder and never infer
launch consent from approval of the deployment/controller-query run. The launch
mode skips the controller smoke, so retain the successful evidence from the
first no-launch run as part of final acceptance. Store sanitized evidence only
below `/tmp/Decky-Metadata` and summarize counts and elapsed durations in the
session record; do not commit device evidence.

If explicit approval is not available to the implementation session, do not run
or approximate the device-changing commands. Record exactly:

```text
DEFERRED: on-device deployment and controller-cache query require explicit current approval; the separate launch gate also requires an explicitly approved safe shortcut.
```

Then stop at the approval boundary with the local implementation committed and
all local gates passing. Do not report live verification as passed and do not
finalize/integrate the `src/steam/` change until the approval-gated check has been
run successfully or the user explicitly accepts that named deferral.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished controller-layout-displayed-shortcut-search-isolation
```

This writes:

```text
/tmp/Decky-Metadata/controller-layout-displayed-shortcut-search-isolation_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer controller-layout-displayed-shortcut-search-isolation`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/controller-layout-displayed-shortcut-search-isolation-review-*.md
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
   scripts/orchestration/clear-finished controller-layout-displayed-shortcut-search-isolation
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
   git add docs/review/controller-layout-displayed-shortcut-search-isolation-review-*.md
   git commit -m "docs(review): record controller-layout-displayed-shortcut-search-isolation review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished controller-layout-displayed-shortcut-search-isolation
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer controller-layout-displayed-shortcut-search-isolation` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed controller-layout-displayed-shortcut-search-isolation
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize controller-layout-displayed-shortcut-search-isolation
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/controller-layout-displayed-shortcut-search-isolation_finalized
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
scripts/orchestration/finalize controller-layout-displayed-shortcut-search-isolation
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/controller-layout-displayed-shortcut-search-isolation_finished
/tmp/Decky-Metadata/controller-layout-displayed-shortcut-search-isolation_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
