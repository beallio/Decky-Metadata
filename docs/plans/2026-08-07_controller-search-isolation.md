# Plan: Controller Search cross-app layout isolation (controller-search-isolation)

## Context

### Symptom

In Controller Settings → **Search**, layouts belonging to a *different* game
appear and keep appearing. Open game A, look at Search, switch to game B, and
A's layouts are still listed; go on to game C and A's layouts are still there.

### How Steam builds that list

`controllerConfiguratorStore.m_mapAppConfigs` is a session-wide cache keyed by
appid that nothing ever clears, and the Search tab is fed by:

```js
GetAllConfigs(){let e=[];return this.m_mapAppConfigs.forEach((t,r)=>{(0,p.bp)(r)||t.forEach(t=>e.push(t))}),e}
```

Search is therefore deliberately cross-app on stock Steam — but `p.bp(appid)`
(a `BIsModOrShortcut`-style predicate) makes it skip **non-Steam shortcut keys
entirely**. This plugin's `BIsModOrShortcut` spoof makes that predicate false
for shortcuts, so shortcut-keyed records now flatten into Search as well. That
is why `filterControllerSearchConfigs` exists at all.

### Verified on-device evidence (2026-08-07, cold Steam UI)

Sequence of Controller Settings → layout chooser visits; `search` is the appid
histogram the Search tab actually received.

| step | displayed | search contents |
| --- | --- | --- |
| A | 3015223078 (shortcut) | 3015223078, 338930 (its match) — correct |
| B | 2405230651 (shortcut) | 2405230651, 1211020 — correct |
| C | 2155012430 (shortcut) | 2155012430, 55150 — correct |
| D | **327030 Worms W.M.D (native)** | 327030 + **3015223078, 2405230651, 2155012430** — wrong |
| E | 2405230651 (shortcut) | 2405230651, 1211020 + **327030** — wrong |

Shortcut → shortcut isolation already works. The two failures are both in
`filterControllerSearchConfigs` (`src/steam/controllerLayoutPolicy.ts:105`):

```ts
remove = (supplementalSourceAppids.has(appid) && appid !== activeMatchedSourceAppid)
      || (activeDisplayedShortcutAppid !== null && isSteamShortcutAppid(appid) && appid !== activeDisplayedShortcutAppid);
```

1. **Step E** — the only appids ever removed are plugin-injected match sources
   and *other shortcuts*. An unrelated **native** Steam game whose layouts are
   cached (Worms W.M.D) matches neither clause and survives into every later
   game's Search for the rest of the session.
2. **Step D** — the foreign-shortcut clause is gated on
   `activeDisplayedShortcutAppid !== null`, and
   `establishDisplayedContext` (`src/steam/controllerLayouts.ts:260`) nulls that
   whenever the displayed app is native. On a native game's page the gate is off,
   so every shortcut visited this session pours into its Search. Those records
   only reach `GetAllConfigs` because of the spoof, so this leak cannot happen on
   stock Steam.

Structurally, "which app is on screen" is a side effect of whichever wrapper ran
last (`activeDisplayedShortcutAppid` / `activeMatchedSourceAppid` are re-derived
on every `QueryControllerConfigsForApp` / `Get*ConfigsForApp` call and read later
by the `GetAllConfigs` wrapper), and "foreign" is an allowlist of appids the
plugin happens to know about.

### Third defect (same class, latent)

`resolveControllerLayoutContext` (`src/steam/controllerLayoutPolicy.ts:45`)
decides "is this a non-Steam shortcut" from the overview alone. The plugin
aliases matched sources in `appStore`, so
`appStore.GetAppOverviewByAppID(338930)` returns the *shortcut's* overview
(device-confirmed: identical object, `appid` reports `3015223078`). A matched
source therefore resolves as a shortcut. Not reachable in this library today
(no matched source is owned), but it is the same root cause and is two lines.

### Decisions already taken (do not re-litigate)

- **Native pages keep stock behavior.** On a native Steam game's Search, other
  *native* games' cached layouts stay visible — that is Valve's cross-app Search.
  Only plugin-caused records (shortcut-keyed records, injected match sources) are
  stripped there.
- **Shortcut pages are scoped.** A shortcut's Search shows that shortcut plus its
  matched source, and nothing else.
- **On-device verification is part of this plan**, run by the implementer.

### Device facts this design depends on (verified 2026-08-07)

- `controllerConfiguratorStore.m_appId` holds the configurator's appid while it
  is open (`3015223078` on the Devastation shortcut, i.e. the **shortcut's own
  appid**, not the matched Steam appid); `m_lastValidAppId` mirrors it and
  persists after close. Both are `number`.
- `m_mapAppConfigs` keys are `number`, and every cached record's `appID` field
  equals its map key — comparisons are number-to-number, no coercion.
- `m_appId` is `undefined` when the configurator has never been opened, so it
  must be read defensively at call time and must **not** become an install-time
  validation requirement.

### Files in scope

```text
src/steam/controllerLayoutPolicy.ts
src/steam/controllerLayoutPolicy.test.ts
src/steam/controllerLayouts.ts
src/steam/controllerLayouts.test.ts
src/types.ts
scripts/deck/js/check_controller_layouts.js
scripts/deck/verify/smoke_controller_layouts.sh
README.md
CHANGELOG.md
docs/agent_conversations/2026-08-07_controller-search-isolation.md
```

**Slug used throughout this plan:** `controller-search-isolation`

---

## Orchestration Contract

**Slug:** `controller-search-isolation`

**Plan file:**

```text
docs/plans/2026-08-07_controller-search-isolation.md
```

**Implementation branch:**

```text
feat/controller-search-isolation
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/controller-search-isolation_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/controller-search-isolation_finalized
```

**Review notes:**

```text
docs/review/controller-search-isolation-review-*.md
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
git checkout -b feat/controller-search-isolation
```

Commit this plan first:

```bash
git add docs/plans/2026-08-07_controller-search-isolation.md
git commit -m "docs(plan): add controller-search-isolation implementation plan"
```

---

## Implementation Tasks

Work in this order. Tasks 1 and 2 must produce **failing** output before any
`src/` change exists — that is how the gates are proven, and the recorded
failure output is required evidence.

### Device access granted by this plan

The implementer may run, against the Deck (SSH alias `steamdeck`):

```bash
scripts/deck/tunnel.sh up
scripts/deck/cdp.py ...
scripts/deck/deploy.sh
scripts/deck/verify/smoke_controller_layouts.sh <fixtures.json> <evidence.json>
```

The controller-layout smoke only populates Steam's in-memory configuration cache
with bounded read queries; it never persists a layout selection. **Do not** run
a game launch: no `smoke_launch.sh`, no `--allow-launch`, and no `run_all.sh`
without `--no-launch`. This change is frontend-only, so `scripts/deck/deploy.sh`
(bundle push + hard reload) is sufficient — `package-push` is not needed.
`scripts/decky doctor --deck` sometimes reports the Deck offline on this machine
even when it is reachable; if that happens, confirm with `scripts/deck/tunnel.sh
status` and `scripts/deck/cdp.py list` before concluding the Deck is unavailable.

### Task 1 — extend the on-device probe and smoke, and record it failing

No `src/` changes in this task.

1. `scripts/deck/js/check_controller_layouts.js` — add a native-game phase.
   - Accept a new optional var `NATIVE_APPID`. When empty, auto-discover: from
     `globalThis.collectionStore.allAppsCollection.allApps`, pick the first entry
     with `app_type === 1` whose `appid` is not `SOURCE_APPID`,
     `SECOND_SOURCE_APPID`, or any of the three displayed appids. If nothing
     qualifies, return `nativeAppid: null` and do not throw.
   - After the existing `afterThird` snapshot, and before the source-only reads
     at the end (`const source = sourceCompared ? ...`), add:
     - `query(nativeAppid)` then `searchSnapshot()` → `afterNative`, with
       `countAppid` entries for `nativeAppid`, all three displayed shortcut
       appids, and both matched source appids;
     - then `query(secondDisplayedAppid)` again, then `searchSnapshot()` →
       `afterReturn`, with counts for `nativeAppid`, `secondDisplayedAppid`, and
       `secondSourceAppid`.
   - Add `nativeAppid`, `afterNative`, and `afterReturn` to the `isolation`
     object in the returned JSON. Keep the existing keys and their meanings
     unchanged — the existing assertions must keep working.
   - The probe stays output-safe: appids, booleans, counts, durations, and URL
     hashes only. No titles, no URLs, no account data.
2. `scripts/deck/verify/smoke_controller_layouts.sh` — assert on the new keys,
   in the same `raise SystemExit("FAIL: ...")` style as the existing block:
   - `isolation["nativeAppid"] is None` → `FAIL: no native Steam fixture
     available; set DECKY_FIXTURE_NATIVE_APPID`. Absence must exit non-zero; it
     must not be treated as "nothing to check".
   - `afterNative`: each of the three displayed shortcut counts must be `0`
     (`FAIL: shortcut layouts leaked into a native game's controller Search`);
     each inactive matched-source count must be `0`; the native count must be
     `> 0` (`FAIL: native game is missing its own layouts in controller Search`).
   - `afterReturn`: the native count must be `0` (`FAIL: native game's layouts
     persist in a shortcut's controller Search`); `secondDisplayedCount` and
     `secondSourceCount` must be `> 0` when the corresponding `hasResults` flag
     is true.
   - Pass the native appid into the probe from the environment:
     `--var "NATIVE_APPID=${DECKY_FIXTURE_NATIVE_APPID:-}"`. Do not change
     `select_fixtures.py`, `run_all.sh`, or `tests/test_deck_fixture_selection.py`.
   - Include the new observations in the JSON written to `$evidence`.
3. Deploy the **current, unmodified** bundle and run the extended smoke. The
   fixture manifest is built from the metadata store on the Deck, exactly as
   `run_all.sh` does it (verified working 2026-08-07 — it selects
   `listed_match=2312439508`, `delisted_match=3497159354`,
   `never_on_steam=3462906031` on this device):

   ```bash
   scripts/deck/deploy.sh
   run_dir=/tmp/Decky-Metadata/verification/search-isolation
   mkdir -p "$run_dir"
   ssh "${DECKY_DECK_HOST:-steamdeck}" \
     'cat /home/deck/homebrew/settings/Decky-Metadata/decky_metadata.json' \
     > "$run_dir/metadata.json"
   scripts/deck/verify/select_fixtures.py "$run_dir/metadata.json" > "$run_dir/fixtures.json"
   scripts/deck/verify/smoke_controller_layouts.sh "$run_dir/fixtures.json"
   ```

   The three fixtures are all non-Steam shortcuts, which is why the probe has to
   supply the native appid itself. Expect a non-zero exit naming the leak — the two `afterNative` /
   `afterReturn` failures above. **Copy the exact failure line into the session
   log.** If it passes here, stop and report: the probe is not exercising the
   bug and the rest of the plan is unverifiable.
4. Commit the probe/smoke work on its own (`test(deck): ...`).

### Task 2 — unit tests first (red)

`src/steam/controllerLayoutPolicy.test.ts` — add a describe block for the new
`filterControllerSearchConfigs` contract:

- shortcut page keeps the displayed shortcut and its matched source;
- shortcut page drops an unrelated **native** appid (step E regression);
- shortcut page drops another shortcut and another app's injected source;
- native page keeps unrelated native appids (stock behavior — this one must fail
  if someone later "simplifies" the rule into a uniform allowlist);
- native page drops every shortcut-namespace appid (step D regression);
- native page drops injected sources except the displayed appid itself;
- unknown displayed appid drops shortcut-namespace appids and all injected
  sources;
- records that are not objects, or whose `appID` is missing/non-numeric/throws on
  access, are kept;
- a non-array `nativeResult` still returns
  `{ ok: false, reason: "native-search-not-array" }`.

`src/steam/controllerLayouts.test.ts` — extend `makeHarness`'s `Store` class with
a settable `m_appId` (and `m_lastValidAppId`), then add:

- **stale-identity regression**: drive the getters for appid `10` (shortcut),
  then set the store's `m_appId` to a different app and call `GetAllConfigs` —
  the filter must follow the store's appid, not the last getter call;
- **no relinquish**: after a native displayed appid that is also a supplemental
  source is rendered, that source must still be filtered out of a *different*
  app's Search (today's `supplementalSourceAppids.delete` makes it leak forever);
- `GetAllConfigs` still returns the untouched native result and trips exactly
  once when `resolveContext` throws or returns a malformed context.

Run `npx vitest run src/steam/controllerLayoutPolicy.test.ts
src/steam/controllerLayouts.test.ts` and record the failing count. Commit the
tests separately (`test(controller): ...`).

### Task 3 — policy change

`src/steam/controllerLayoutPolicy.ts`:

1. Export a context type and change the filter signature:

   ```ts
   export type ControllerSearchContext = Readonly<{
     displayedAppid: number | null;
     isNonSteamShortcut: boolean;
     matchedSourceAppid: number | null;
   }>;

   export const filterControllerSearchConfigs = (
     nativeResult: unknown,
     context: ControllerSearchContext,
     supplementalSourceAppids: ReadonlySet<number>,
   ): ControllerConfigSearchResult => { ... }
   ```

2. Decision rule, applied only to records that are objects with a positive,
   finite numeric `appID` (everything else is kept):

   ```text
   shortcut page (displayedAppid !== null && isNonSteamShortcut):
     drop iff appid !== displayedAppid && appid !== matchedSourceAppid

   otherwise (native page, or displayedAppid unknown):
     drop iff isSteamShortcutAppid(appid)
           || (supplementalSourceAppids.has(appid) && appid !== displayedAppid)
   ```

3. Delete the `supplementalSourceAppids.size === 0 && activeDisplayedShortcutAppid === null`
   early return — with an unknown appid the shortcut-namespace rule still has
   work to do. The existing copy-on-first-removal loop already returns the
   original array untouched when nothing is dropped; keep that, and keep the
   `try { value.appID } catch` guard.
4. In `resolveControllerLayoutContext`, require
   `isSteamShortcutAppid(input.displayedAppid)` before the shortcut branch, so an
   aliased matched-source overview can no longer resolve as a shortcut. Update
   the existing `resolveControllerLayoutContext` tests that this changes, and add
   one for a native appid carrying a shortcut-looking overview.

### Task 4 — wrapper change

`src/steam/controllerLayouts.ts`:

1. Delete the module-level `activeDisplayedShortcutAppid` and
   `activeMatchedSourceAppid`, including their resets in `trip` and `cleanup`.
2. Extract the validation currently inside `establishDisplayedContext` into a
   pure helper that returns a validated `ControllerLayoutContext` (or `null` for
   an unusable appid) and mutates nothing. Keep the existing thrown messages
   (`"invalid controller layout context"`, `"invalid matched appid"`,
   `"native context has matched appid"`) so the existing failure-path tests still
   hold. `establishDisplayedContext` keeps its role for the query and getter
   wrappers, returning the matched appid.
3. Delete the native branch's
   `supplementalSourceAppids.delete(displayedAppid)` /
   `supplementalQueryKeys.delete(displayedAppid)` block. The
   `appid !== displayedAppid` clause in the native rule replaces it. Note in the
   session log that this makes a match source that the user *also* owns show its
   own layouts on its own page while staying hidden elsewhere — deliberate.
4. In the `GetAllConfigs` wrapper, derive the identity at call time:
   - take the store from `this` when it is an object exposing `m_appId` or
     `m_lastValidAppId`, otherwise fall back to the validated `targets.store`;
   - `displayedAppid` = the first of `m_appId`, `m_lastValidAppId` that is a
     positive finite number, else `null`;
   - when non-null, resolve the context through `dependencies.resolveContext`
     and the shared validator; build `ControllerSearchContext` from it;
   - when null, pass `{ displayedAppid: null, isNonSteamShortcut: false,
     matchedSourceAppid: null }`.
   Keep the existing try/catch → `trip({ section: "search", ... })` → return
   `nativeResult` behavior, and keep `supplementalSourceAppids` (the native and
   unknown rules still need it).
5. Do **not** add `m_appId` / `m_lastValidAppId` to `validateTargets`'s
   requirements — they are absent until the configurator is first opened, and
   requiring them would disable the whole feature at plugin load.
6. `src/types.ts`: add `m_appId?: unknown;` and `m_lastValidAppId?: unknown;` to
   `ControllerConfiguratorStoreBoundary` (around line 203).

Run the gates; the Task 2 tests must now pass. Commit as `fix(controller): ...`.

### Task 5 — mutation check

With the tree green, temporarily force the shortcut-page branch to drop nothing
(e.g. `drop = false` inside it), re-run
`npx vitest run src/steam/controllerLayoutPolicy.test.ts src/steam/controllerLayouts.test.ts`,
and record which test names go red. Restore the code (`git checkout --` the file)
and confirm green again. Do not commit the mutation.

### Task 6 — device re-verification

```bash
scripts/deck/deploy.sh
scripts/deck/verify/smoke_controller_layouts.sh \
  /tmp/Decky-Metadata/verification/search-isolation/fixtures.json
```

Both the pre-existing OK lines and the new native-phase assertions must pass.
Record the full stdout and the evidence JSON path in the session log.

### Task 7 — documentation

- `README.md:49` — the controller-layouts paragraph currently promises only that
  matched layouts appear. Add one sentence stating that Search on a non-Steam
  game lists that game's layouts and its matched Steam game's layouts, and
  nothing from other games.
- `CHANGELOG.md` — add a `### Fixed` entry under the existing `## [Unreleased]`
  heading. Do not create a dated release section.
- `docs/agent_conversations/2026-08-07_controller-search-isolation.md` — session
  log per AGENTS.md §9, carrying the raw output required by Verification below.

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

Every step below must be able to fail, and the failure cases run before the
negative control. Steps are graded against
`~/.claude/skills/orchestration-plan-author/references/verification-standards.md`.
**Report output, not conclusions** — paste the actual lines and tallies into
`docs/agent_conversations/2026-08-07_controller-search-isolation.md`. Use
`set -o pipefail` if you pipe any of these commands, and never wrap one in
`$(...)` inside a `printf`; assign first, then print.

1. **Gate proven against the bug (Task 1).** The extended smoke, run against the
   unmodified bundle, exits non-zero and names the leak. Record the exact
   `FAIL: ...` line and the exit status. A pass here invalidates the rest of the
   plan — stop and report instead of continuing.
2. **Unit tests red before the fix (Task 2).** Record the vitest tally
   (`N failed | M passed`) and the failing test names. Zero failures here means
   the tests do not encode the new behavior; fix them before implementing.
3. **Full gate green after the fix.**

   ```bash
   scripts/orchestration/run-quality-gates
   ```

   Record the final tallies from `npm test` and `pytest -q`, plus the closing
   `quality-gates: OK`. This runs `tsc --noEmit`, `npm run build`, `npm test`,
   `py_compile`, `pytest`, and the version-drift guard.
4. **Mutation makes the tests red (Task 5).** Record the test names that fail
   with the shortcut-page branch neutered, and confirm green after restoring. If
   nothing fails, the new tests are not testing the fix.
5. **Negative control — device (Task 6).** The same smoke that failed at step 1
   passes, with the native phase exercised. This is the step that can only pass
   if the implementation works; it runs last. Record:
   - the `OK: controller Search isolated ...` line;
   - the new native-phase assertion output;
   - the evidence JSON path under `/tmp/Decky-Metadata/`;
   - `isolation.nativeAppid` (a null here is a FAIL, not a skip).
6. **Working tree and scope.** `git status --short` is clean, and
   `git diff --stat dev...HEAD` touches only the files listed in Context →
   Files in scope. Paste both.

### Not verified by this plan — state these in the session log

- No layout is ever **selected or applied**; the probe issues read queries only,
  so the apply path is untested.
- No physical-controller interaction. The probe calls store methods directly and
  does not drive the chooser UI or D-pad focus.
- The global **Settings → Controller** page (outside a game's Controller
  Settings) is not covered; `m_appId` behavior there is unknown.
- Behavior on a first-ever cold cache (empty `m_mapAppConfigs`, no shortcut
  visited yet) is covered only by unit tests, not on device.
- The aliased matched-source fix (Task 3.4) cannot be exercised on this Deck —
  no matched source is in the library — so it is unit-tested only.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished controller-search-isolation
```

This writes:

```text
/tmp/Decky-Metadata/controller-search-isolation_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer controller-search-isolation`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/controller-search-isolation-review-*.md
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
   scripts/orchestration/clear-finished controller-search-isolation
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
   git add docs/review/controller-search-isolation-review-*.md
   git commit -m "docs(review): record controller-search-isolation review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished controller-search-isolation
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer controller-search-isolation` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed controller-search-isolation
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize controller-search-isolation
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/controller-search-isolation_finalized
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
scripts/orchestration/finalize controller-search-isolation
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/controller-search-isolation_finished
/tmp/Decky-Metadata/controller-search-isolation_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
