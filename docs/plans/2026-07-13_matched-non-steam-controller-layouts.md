# Plan: Matched Non-Steam Controller Layouts (matched-non-steam-controller-layouts)

## Context

Matched non-Steam shortcuts currently open Steam's standard Controller Settings,
but Steam queries layouts with the synthetic shortcut appid. That query returns
the shortcut's personal layouts and generic templates, while the Recommended and
Community sections that belong to the matched Steam game remain empty. The
plugin already stores the real positive `steam_appid` for both listed and
delisted matches in `MetadataData` and leaves never-on-Steam shortcuts without a
positive match.

Live read-only research on the available Deck established the relevant SteamUI
contract on 2026-07-13:

- `controllerConfiguratorStore.QueryConfigsForApp(appid, controllerIndex)`
  clears and fills controller-config records keyed by the queried appid.
- `SteamClient.Input.QueryControllerConfigsForApp(appid, controllerIndex,
  filterOtherControllerTypes)` supplies those records through Steam's existing
  registered listener.
- the Recommended tab is derived from
  `GetOfficialConfigsForApp(appid, controllerType)` plus records returned by
  `GetTemplateConfigsForApp(appid, controllerType)` whose `bRecommended` flag is
  true;
- the Community tab is derived from
  `GetWorkshopConfigsForApp(appid, controllerType)`;
- previewing or selecting a row uses the displayed page appid. Therefore layout
  discovery may use the real Steam appid while application must remain attached
  to the non-Steam shortcut appid.

The current semantic fixtures prove that this is useful for both store states:
the listed Assassin's Creed match (`2312439508` -> `15100`) returned 31
Community layouts, the delisted Deadpool match (`3497159354` -> `224060`)
returned nine, and the Wobbly Life match (`2405230651` -> `1211020`) returned
five. Its shortcut-appid query returned only generic templates. None of the nine
currently matched games returned an Official or Recommended record, although a
read-only native query for Stardew Valley (`413150`) returned a Recommended
template. Recommended behavior therefore needs deterministic automated coverage;
do not create or remap a Deck shortcut merely to manufacture a live fixture.

Implement supplemental discovery only:

| Displayed app state | Required Controller Settings behavior |
| --- | --- |
| Native Steam app | SteamUI behavior and query count remain unchanged. |
| Matched non-Steam, listed or delisted | Preserve shortcut personal layouts and generic templates; supplement Recommended/Official and Community results from the positive matched `steam_appid`. |
| Never-on-Steam shortcut | Preserve standard non-Steam Controller Settings unchanged. |

Selecting, previewing, exporting, deleting, clearing, or saving a controller
configuration is outside this patch. Do not patch or directly call
`SetSelectedConfigForApp`, `PreviewConfigForAppAndController`,
`ClearSelectedConfigForApp`, editing/export APIs, or shortcut metadata APIs.
Steam's existing UI must continue to apply a selected borrowed URL to the
displayed shortcut appid.

Safety is the primary acceptance criterion. SteamUI internals are not a public
stable API. Install the controller-layout integration transactionally: validate
every target and method descriptor before changing anything, roll back all
already-installed sections if any section cannot install, and retain exact
unpatch functions. At runtime, native Steam behavior runs first and exactly once.
Every plugin-only query/merge section validates its inputs and catches its own
failures. The first plugin-side exception or incompatible supplemental result
trips a session-level circuit breaker, emits one bounded diagnostic and one
best-effort warning toast, returns the native result, and makes every later
wrapper a pass-through until the plugin is reloaded. The toast must tell the user
that matched controller layouts were disabled and Steam's standard controller UI
is being used. The breaker must enter its disabled state before attempting the
toast, and a missing/throwing toaster must be swallowed. A SteamUI change must
produce missing augmentation plus user awareness, never a broken Controller
Settings page, repeated native call, render loop, or Deck/SteamUI crash.

Do not enumerate MobX store instances during render, mutate arrays returned by
native getters, register another controller-config message listener, or depend
on localized UI text. Getter wrappers may call only the named native getter for
the displayed app and matched app and merge copied arrays through pure helpers.
Query-time access may clear only the matched app's transient controller-config
query cache before issuing the supplemental read. No persistent Deck state is
part of this feature.

This plan changes frontend Steam integration, deterministic tests/device probes,
README behavior documentation, the committed `dist/index.js`, and the session
log. It does not change backend metadata, versions/releases, quick-link policy,
activity/community rendering, shortcut records, or selected controller layouts.

### Orchestrator execution boundary

This is one local-only orchestration plan. The machine-local configuration sets
`ORCH_BASE_BRANCH="dev"` and `ORCH_LOCAL_ONLY=1`; do not fetch, pull, push, create
a remote branch, or promote `dev` to `main`. The generated orchestration contract
below remains authoritative for branch creation, review notes, markers, and
finalization.

The implementation file boundary is:

- this plan file;
- new `src/steam/controllerLayoutPolicy.ts` and its colocated test;
- new `src/steam/controllerLayouts.ts` and its colocated test;
- `src/steam/install.ts` and the minimal Steam boundary in `src/types.ts`;
- new `scripts/deck/js/check_controller_layouts.js` and
  `scripts/deck/verify/smoke_controller_layouts.sh`;
- `scripts/deck/verify/run_all.sh` and
  `tests/test_deck_fixture_selection.py`;
- `README.md`, regenerated `dist/index.js`, and the session log; and
- durable review notes written by the orchestrator, never the implementer.

Do not edit `src/toast.tsx`; consume its existing `toastWarn` export. Do not
modify backend code, manifests, versions, other Steam patches, unrelated tests,
packaging scripts, orchestration configuration, or the existing untracked review.
If implementation needs a file outside this boundary, stop and report the
blocker instead of expanding scope.

The user has prohibited changing Deck state. Local quality gates plus the
injected fail-open suite are the implementation-round gate. Live verification is
permitted only after the user independently installs the new bundle. This
authorized deferral does not block committing, marking the round finished, or
review; record it exactly as `DEFERRED: awaiting user-installed bundle` and do
not claim live success. Reviewers must not request deployment, reload, shortcut
remapping, layout selection, or settings mutation to resolve that deferral.

**Slug used throughout this plan:** `matched-non-steam-controller-layouts`

---

## Orchestration Contract

**Slug:** `matched-non-steam-controller-layouts`

**Plan file:**

```text
docs/plans/2026-07-13_matched-non-steam-controller-layouts.md
```

**Implementation branch:**

```text
feat/matched-non-steam-controller-layouts
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/matched-non-steam-controller-layouts_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/matched-non-steam-controller-layouts_finalized
```

**Review notes:**

```text
docs/review/matched-non-steam-controller-layouts-review-*.md
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
git checkout -b feat/matched-non-steam-controller-layouts
```

Commit this plan first:

```bash
git add docs/plans/2026-07-13_matched-non-steam-controller-layouts.md
git commit -m "docs(plan): add matched-non-steam-controller-layouts implementation plan"
```

---

## Implementation Tasks

Work in order and use TDD for all pure policy and failure-boundary behavior.

### 1. Define the pure supplemental-layout policy

Create `src/steam/controllerLayoutPolicy.ts` and
`src/steam/controllerLayoutPolicy.test.ts`.

1. Define the minimal controller-config record shape used by this feature. Treat
   a non-empty `URL` as its stable identity and retain only the fields Steam
   supplies; do not synthesize or rewrite workshop/template URLs.
2. Add a pure source resolver that returns a matched source appid only when the
   displayed app is genuinely non-Steam according to the unpatched shortcut
   predicate and its metadata has a finite positive `steam_appid` different from
   the displayed appid. Store state must not gate the result: listed, delisted,
   and unknown matched records use the same source. Native and never-on-Steam
   inputs return no source.
3. Add base-first, stable deduplication by URL. Never mutate either input array or
   any record. Preserve native shortcut ordering, then append unique supplemental
   records in Steam's returned order.
4. Expose separate pure merge operations matching Steam's UI sections:
   - Official/Recommended official results merge the shortcut getter result with
     the matched-app official getter result;
   - Recommended templates supplement only matched records whose
     `bRecommended === true`, so generic templates, personal templates, and
     unrelated matched-app records do not leak into the shortcut;
   - Community results merge the already-filtered shortcut and matched-app
     workshop getter results.
5. Supplemental values are valid only when the getter returns an array and each
   record considered for insertion is an object with a non-empty string `URL`.
   Return a discriminated failure result for malformed supplemental data so the
   runtime adapter can trip its circuit breaker. Do not reject or rewrite the
   native base result; it belongs to SteamUI.
6. Cover listed, delisted, unknown, native, never-on-Steam, base-first ordering,
   URL deduplication, Recommended filtering, Official and Community merges,
   malformed supplemental arrays/records, and immutability. Explicitly cover a
   synthetic `bRecommended: true` record because the current Deck library has no
   matched Recommended fixture.

### 2. Build a transactional, fail-open SteamUI adapter

Create `src/steam/controllerLayouts.ts` with focused runtime-adapter tests in
`src/steam/controllerLayouts.test.ts`. Keep Steam-specific mutation and target
discovery out of the pure policy module.

1. Discover `SteamClient.Input` and `globalThis.controllerConfiguratorStore`
   through minimal typed boundaries. Use bounded delayed retries consistent with
   other installers. Fingerprint the store by the exact callable surface needed:
   `QueryConfigsForApp`, `GetOfficialConfigsForApp`,
   `GetTemplateConfigsForApp`, `GetWorkshopConfigsForApp`, and a
   `m_mapAppConfigs` value with `set` support. Do not traverse or enumerate the
   store's values.
2. Before patching, inspect and retain the exact property descriptors for
   `SteamClient.Input.QueryControllerConfigsForApp` and the three store prototype
   getter methods. Require callable, writable/configurable data descriptors.
   Treat a missing or incompatible target as an install miss: log once, install
   nothing, and leave SteamUI untouched.
3. Install all four wrappers as one transaction. Keep unpatch functions in a
   local stack until every section succeeds. If descriptor replacement or any
   later install section fails, restore every prior descriptor in reverse order
   before returning. Append only the final aggregate unpatcher to the plugin's
   unpatch list.
4. Do not use a wrapper helper that may retry the native method after it throws.
   Each wrapper must invoke its native original exactly once. A native exception
   retains native semantics; plugin recovery must never call that original a
   second time.
5. The query wrapper must:
   - call the native query once with the displayed appid and preserve its return;
   - when the pure resolver finds a matched source, safely reset only that source
     appid's transient `m_mapAppConfigs` entry and invoke the captured original
     query once for the matched appid with the same controller/filter arguments;
   - use the captured original, not the installed wrapper, so the supplemental
     call cannot recurse;
   - never delay, replace, or condition the native shortcut query on plugin work;
   - if any supplemental step fails, return the native result and trip the
     circuit breaker.
6. Each getter wrapper must call its native getter once for the displayed appid
   before any plugin work. When enabled and matched, call the captured native
   getter for the source appid, pass the two results to the matching pure merge,
   and return the merged copy. If source resolution, the supplemental getter, or
   validation/merge fails, return the already-produced native base result and
   trip the circuit breaker.
7. Implement one session-scoped circuit breaker shared by all four sections.
   The first plugin-side runtime failure records the failing section and concise
   shape/error metadata through existing frontend logging, once. Set the disabled
   state before doing any logging or notification work. Then invoke an injected
   best-effort notifier once; production wiring must use the existing
   `toastWarn` helper from `src/toast.tsx` with user-facing copy equivalent to:
   heading `Controller layouts disabled`, body `Using Steam's standard controller
   layout UI until Decky Metadata is reloaded.` Thereafter every wrapper
   immediately delegates only to its native original. Do not repeatedly log,
   toast, retry, partially augment another section, or throw from the breaker.
   Wrap the notifier call even though `toastWarn` already catches Decky toaster
   failures, so an injected or future notifier cannot escape the breaker.
8. After bounded target-discovery retries are exhausted, or when final target/
   descriptor validation proves the SteamUI contract incompatible, enter the same
   disabled fallback state and issue the same single toast. Do not toast for
   transient retry attempts. If transactional descriptor installation begins and
   a later section fails, restore prior descriptors first, then disable and
   notify; the standard UI must be restored before the user is told it is active.
9. Preserve native MobX reactivity by reading the matched app only through the
   store's native getter. Do not walk, clone, serialize, spread, or inspect the
   controller store itself during render. Do not register
   `RegisterForControllerConfigInfoMessages`; Steam's existing listener owns
   query ingestion.
10. On plugin unload, restore every original descriptor exactly. Cleanup must be
   idempotent and safe after a circuit trip or partial/failed installation.
11. Add adapter tests with fake bridge/store boundaries and an injected notifier
    proving:
    - native and never-on-Steam calls and results are byte-for-byte/pass-through
      equivalents and issue no supplemental query;
    - listed and delisted matches issue the native query first and one matched
      query, while getters merge only their intended sections;
    - selection/preview/edit methods are never patched or invoked;
    - native originals are called exactly once, including native-throw cases;
    - malformed targets cause zero installed patches;
    - failure on the second, third, or fourth install rolls back earlier sections;
    - query and each getter failure return native output, trip one shared breaker,
      log once, and make all subsequent sections pass through;
    - breaker state is disabled before the notifier runs, exactly one warning is
      requested across repeated/cross-section failures, and the production copy
      clearly names standard Steam UI as the fallback;
    - a notifier that throws is swallowed after the native result is secured,
      cannot escape a wrapper, cannot cause another native invocation, and is not
      retried on later calls;
    - exhausted discovery, malformed descriptors, and partial transactional
      install failure restore/pass through native behavior and notify once, while
      transient retries do not notify;
    - malformed supplemental arrays/records fail open;
    - repeated install/uninstall cycles restore exact function identities and
      descriptors.

### 3. Integrate with typed Steam startup boundaries

1. Extend only the minimal `SteamInternals` types in `src/types.ts` needed for
   `SteamClient.Input` and `controllerConfiguratorStore`; keep unknown fields
   opaque. Do not broaden unrelated Steam types or add a dependency.
2. Export an installer from `src/steam/controllerLayouts.ts` and call it from a
   dedicated guarded step in `src/steam/install.ts`. A controller-layout install
   miss/failure must not abort quick-links, activity, metadata, or any other
   existing patch section. Conversely, failures in another install section must
   not leave controller-layout descriptors half-installed.
3. Reuse `metadataCache` and the genuine non-Steam predicate from
   `src/steam/core.ts`. Do not call the spoofed `BIsModOrShortcut` path to decide
   eligibility, because matched shortcuts are deliberately presented as native
   on some Game Info render paths.
4. Keep logging bounded and free of controller-layout URLs, account identifiers,
   config titles/descriptions, or full object dumps. Log section name, displayed
   appid, matched appid when known, and a short invariant/error code only.
5. Import `toastWarn` from `src/toast.tsx` only in the production integration
   boundary and pass it to the controller-layout adapter as a notifier dependency.
   Keep the pure policy and adapter tests independent of Decky's toaster and JSX
   runtime. Do not add another toast abstraction or call `toaster.toast` directly.

### 4. Add non-mutating controller-layout verification tooling

Add `scripts/deck/js/check_controller_layouts.js` and
`scripts/deck/verify/smoke_controller_layouts.sh`, integrate the smoke into
`scripts/deck/verify/run_all.sh --no-launch`, and update the existing Python
device-tooling tests.

1. The JavaScript probe may use only query/read operations:
   `controllerConfiguratorStore.QueryConfigsForApp` followed by bounded waiting
   and the three named getter methods. Select the connected controller index from
   the existing controller list and emit machine-readable counts/URLs only as
   hashes or counts; do not emit titles, descriptions, account IDs, or full
   records.
2. The probe and shell smoke must never call selection, preview, clear, export,
   edit, save, shortcut, metadata-write, launch, navigation, or reload APIs.
   Add regression assertions over the committed probe text/behavior so accidental
   use of those mutating methods fails tests.
3. Reuse the semantic `listed_match`, `delisted_match`, and `never_on_steam`
   fixture manifest already produced by `select_fixtures.py`; do not add another
   fixture-selection system. For matched fixtures, compare the shortcut's
   augmented Community count/URL identities with a direct read-only query of its
   recorded real `steam_appid`. Assert the listed and delisted fixtures expose
   the real app's non-empty Community results without duplicates. Assert the
   never-on-Steam query remains its native result and triggers no expected source
   comparison.
4. Do not manufacture a Recommended fixture. The smoke should report
   Recommended/Official counts when naturally present but must not remap/create a
   shortcut, edit plugin metadata/settings, select a layout, or fail merely
   because the current matched library has no Recommended record. The pure and
   adapter suites are the required deterministic Recommended coverage.
5. Keep existing callers compatible and keep all generated evidence below
   `/tmp/Decky-Metadata`.
6. Extend `tests/test_deck_fixture_selection.py` to cover the new JavaScript
   probe, shell smoke, and `run_all.sh` integration. Source-text assertions for
   forbidden mutators apply to the device probe only; exercise production
   policy and runtime behavior through the TypeScript tests instead of brittle
   source-text matching.

### 5. Documentation, build artifact, and audit record

1. Update `README.md` to state that matched listed/delisted shortcuts can discover
   the matched Steam game's Recommended/Official and Community layouts while
   retaining shortcut-specific personal layouts/templates. State that selection
   remains Steam's native shortcut operation and that incompatible SteamUI builds
   fall back to standard UI with a one-time warning toast for the current plugin
   session.
2. Record the implementation, safety decisions, files changed, automated results,
   current live fixture evidence, and explicitly deferred live Recommended branch
   in
   `docs/agent_conversations/2026-07-13_matched-non-steam-controller-layouts.md`.
3. Regenerate and commit `dist/index.js` through the normal build. Do not change
   package/plugin versions, create a release, edit quick-link behavior, or modify
   unrelated files. Preserve the existing untracked thermo-nuclear review file.

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
6. all code/docs changes are committed; and
7. live verification has either passed against the user-installed new bundle or
   is recorded exactly as `DEFERRED: awaiting user-installed bundle`. An old
   installed bundle is not evidence for this implementation.

---

## Verification

### Static and automated verification

Before implementation, confirm routing and the affected checks:

```bash
scripts/decky doctor
scripts/decky verify-change dev --explain
```

During TDD, run focused frontend suites through the cache-isolating wrapper:

```bash
./run.sh npm test -- src/steam/controllerLayoutPolicy.test.ts src/steam/controllerLayouts.test.ts
./run.sh uv run --with pytest -- pytest -q tests/test_deck_fixture_selection.py
./run.sh npx tsc --noEmit
./run.sh node --check scripts/deck/js/check_controller_layouts.js
bash -n scripts/deck/verify/smoke_controller_layouts.sh
bash -n scripts/deck/verify/run_all.sh
```

Run shell/JavaScript syntax and the device-tooling tests selected by the actual
files changed. Then run the generated Quality Gates section exactly, followed by:

```bash
git diff --check
git status --short
```

Expected result: TypeScript, all Vitest tests, Rollup build, Python compile,
pytest, version drift, and review-note preservation pass; `dist/index.js` is
regenerated; no cache or generated evidence appears in the repository; and the
only pre-existing untracked path remains
`docs/review/2026-07-13_gpt-5_dev_thermo-nuclear-review.md`.

### Defensive failure verification

The focused adapter suite is a release-blocking gate. It must inject a failure at
every install and runtime section and prove all of the following:

1. failed installation leaves every native descriptor unchanged;
2. runtime failure returns the already-produced native result;
3. the native method is never called twice by recovery;
4. the first failure disables all four augmentation sections for the session;
5. disabled state is set before notification, exactly one warning toast is
   requested, and a throwing notifier cannot affect the secured native result;
6. later calls use native behavior only and do not log or toast repeatedly;
7. install-time incompatibility restores standard UI before notifying;
8. unload restores the exact original descriptors after success or circuit trip.

Do not weaken these tests to accept partial augmentation. A safe standard UI is
the required fallback.

### On-device verification without fixture or settings mutation

Do not deploy/reload automatically, create or remap shortcuts, edit
`decky_metadata.json`, call metadata save RPCs, select/preview/export/delete a
layout, launch a game, or change controller settings for this verification.

1. Build the fixed-name package locally without copying it to the Deck:

   ```bash
   ./run.sh npm run package
   ```

   Leave `Decky-Metadata.zip` local and uncommitted. Do not `scp`, install,
   deploy, or reload it. The user decides whether and when to install it.
2. After the user confirms that build is installed, run only read-only preflight
   and query probes:

   ```bash
   scripts/decky doctor --deck
   scripts/deck/logs.sh audit --json
   scripts/deck/verify/smoke_controller_layouts.sh
   scripts/deck/verify/run_all.sh --no-launch --extended
   ```

3. Confirm listed and delisted matched shortcuts expose the same non-empty
   Community URL identities as their real Steam app queries; never-on-Steam and
   a native Steam control remain unchanged; Controller Settings stays responsive;
   logs contain no circuit trip, repeated query loop, unhandled exception, or
   renderer error.
4. A physical-controller visual check may open the Recommended and Community
   sections and back out without activating any configuration. It must not select
   or preview a row.

Do not deliberately corrupt, remove, replace, or monkey-patch SteamUI methods on
the Deck to force the circuit breaker or toast. The exhaustive injected failure
suite is the required toast/circuit-breaker verification. If a genuine live
incompatibility trips the breaker, confirm one warning toast appears and standard
Controller Settings remains usable; otherwise record that the live failure path
was not naturally exercised.

Because the current matched library has no Recommended/Official record, live
Recommended population is explicitly deferred until such a fixture occurs
naturally. The automated pure/adapter Recommended tests remain mandatory. Do not
change Deck state to satisfy the deferred check. Record the deferral and owner in
the session log. Do not mark on-device verification as passed against an old
installed bundle; if the user does not install the implementation build, report
the live check as deferred rather than claiming success.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished matched-non-steam-controller-layouts
```

This writes:

```text
/tmp/Decky-Metadata/matched-non-steam-controller-layouts_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer matched-non-steam-controller-layouts`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/matched-non-steam-controller-layouts-review-*.md
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
   scripts/orchestration/clear-finished matched-non-steam-controller-layouts
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
   git add docs/review/matched-non-steam-controller-layouts-review-*.md
   git commit -m "docs(review): record matched-non-steam-controller-layouts review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished matched-non-steam-controller-layouts
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer matched-non-steam-controller-layouts` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed matched-non-steam-controller-layouts
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize matched-non-steam-controller-layouts
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/matched-non-steam-controller-layouts_finalized
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
scripts/orchestration/finalize matched-non-steam-controller-layouts
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/matched-non-steam-controller-layouts_finished
/tmp/Decky-Metadata/matched-non-steam-controller-layouts_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
