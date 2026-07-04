# Plan: Decompose src/steam.ts monolith into focused modules (steam-ts-decomposition)

## Context

`src/steam.ts` is a **3,219-line monolith** (post `dead-code-removal`; earlier drafts of this
plan cited 4,745 — that figure is stale) mixing many orthogonal concerns: the Steam
client/store bridge, non-Steam metadata patching, native Activity event modelling, the native
Activity/partner store patches, navigation/history redirects, diagnostic tracing, tab/app-id
detection, non-Steam game discovery, **unmatched app-links hiding**, **community-feed passthrough
+ vote patching**, and **router detail/activity render patches**. Its size and shared mutable
state make it hard to scan or change safely.

**Intended outcome:** split by ownership into focused modules under `src/steam/`, keeping
`src/steam.ts` as a **stable public barrel** and `installSteamPatches` as a thin installer that
wires the module installers together in the current order. **Behavior-preserving** — move code
verbatim, do not rewrite logic.

**Ordering (hard constraints):**
- Run **after** `dead-code-removal` (done) and **after** `tracing-behind-debug-flag` (done — the
  diagnostic-trace installs are already gated behind `getDebugLogging()` at ~`steam.ts:2727`;
  preserve that gating when moving them).
- Run **before** `type-boundary-hardening`. Decomposition moves code verbatim with no type edits;
  typing the resulting small modules afterward is far cleaner than typing the monolith and then
  re-moving everything. Do **not** interleave the two — high merge/churn risk.

### Current public export surface (must stay stable — all 19)
`allNonSteamGames`, `applyMetadata`, `appName`, `cleanTitle`, `ensureMetadataCache`, `getOverview`,
`hasActivityStore`, `hasAppDetailsStore`, `hasSteamInternals`, `installSteamPatches`,
`isNonSteamApp`, `metadataCache`, `patchInstallStatus`, `refreshMetadataCache`,
`rewriteSteamLinkToMatchedApp`, `startMetadataBootstrap`, `steamAppIdForApp`,
`tryEnrichScreenshotsForApp`, `tryFetchMetadataForApp`.

### Consumers of `./steam` (import surface — THREE files, not two)
- `src/index.tsx` — `installSteamPatches`, `refreshMetadataCache`, `startMetadataBootstrap`.
- `src/contextMenuPatch.tsx` — `getOverview`, `isNonSteamApp`, `patchInstallStatus`, `hasSteamInternals`.
- `src/components.tsx` — `allNonSteamGames`, `appName`, `applyMetadata`, `cleanTitle`, `getOverview`,
  `isNonSteamApp`, `metadataCache`, `refreshMetadataCache`. **This third importer was missed in the
  first draft; it is the reason the barrel + `metadataCache` singleton constraints below are load-bearing.**

### Shared mutable state / hidden coupling (do NOT duplicate or reassign)
These are read/written across multiple would-be modules and must live in ONE shared core module
that every feature module imports:
- `metadataCache` (`export const` at `steam.ts:38`) — an **exported live object** that
  `components.tsx` mutates directly (`metadataCache[String(appId)] = …` at lines 740/761/765).
  Keep it a shared singleton; never replace it with reassignment.
- `bypassCounter` / `bypassBypass` (`steam.ts:54-55`) — non-Steam spoofing counters mutated across
  prototype patches and route patches (`~2904-2931`, `~3120`).
- `lastObservedGameDetailAppId` (`steam.ts:60`) — written at `~2982/3119/3147`, read at `~1576`.
- Metadata load state: `metadataLoaded`, `metadataLoadPromise`, `loadingMetadata`,
  `loadingScreenshots` (`~56-59`).
- Native caches `__deckyNativeActivityCache`, `__deckyNativePartnerEvents`,
  `__deckyNativePartnerEventStore` (`~713-785`), cleared by the activity-refresh listener (`~2692`).
- Patch primitives `patchMethod` / `safeAfterPatch` (`~1669-1706`), and route/history helpers
  (`currentRoutePath` `~80`, `historyPathFromArgs`/`historyStateFromArgs`).

### Relevant files
`src/steam.ts` (becomes the barrel) → new `src/steam/*.ts` incl. `src/steam/core.ts`;
`src/index.tsx`, `src/contextMenuPatch.tsx`, `src/components.tsx` (import surfaces — must be
unchanged); `dist/` (rebuilt).

> Source: thermo-nuclear code-quality review (2026-07-03), findings corroborated by two independent reviewers (codex gpt-5.5 + agy) and verified against the code by the orchestrator.


**Slug used throughout this plan:** `steam-ts-decomposition`

---

## Orchestration Contract

**Slug:** `steam-ts-decomposition`

**Plan file:**

```text
docs/plans/2026-07-03_steam-ts-decomposition.md
```

**Implementation branch:**

```text
feat/steam-ts-decomposition
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/steam-ts-decomposition_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/steam-ts-decomposition_finalized
```

**Review notes:**

```text
docs/review/steam-ts-decomposition-review-*.md
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
git checkout -b feat/steam-ts-decomposition
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_steam-ts-decomposition.md
git commit -m "docs(plan): add steam-ts-decomposition implementation plan"
```

---

## Implementation Tasks

Behavior-preserving extraction. Move symbols **verbatim**; only adjust import paths and add
re-exports. No logic, no type changes.

### Task 0 — Snapshot the invariants before moving anything
Record, in the session log, two things you will re-check after the split:
- The **current `installSteamPatches` install order** — the exact sequence of `safeInstallStep(...)`
  calls and inline patch installs from `~steam.ts:2678` through `~3172`, including that several
  steps (unmatched app-links hider, native activity/partner store patches, activity-refresh
  listener) run **before** the `hasSteamInternals()` retry branch, and that the diagnostic traces
  install **inside** the async `getDebugLogging()` callback. This order must be identical afterward.
- The **teardown order**: one shared `unpatchers` array is reversed on dismount (`~2679`,
  `~3163-3172`). Modules must append into that **same shared array in the same order** — do not
  give modules independent teardown arrays.

### Task 1 — Create the shared core module first (`src/steam/core.ts`)
Move the shared mutable state + primitive helpers listed in Context into `src/steam/core.ts`:
`metadataCache` (as `export const` — keep it the same object identity), `bypassCounter`/`bypassBypass`,
`lastObservedGameDetailAppId`, the metadata load-state flags, the native caches, `patchMethod`/
`safeAfterPatch`, `currentRoutePath`, and the history-arg helpers. Everything else imports from
core. **Rule: feature modules import `core`, never each other** — this keeps the module graph
acyclic without needing a hand-drawn dependency diagram.

### Task 2 — Extract feature modules by ownership
Group by cohesion; **do not create near-empty modules** — if a concern is tiny (e.g.
`allNonSteamGames`, ~44 lines at `~3175-3219`), fold it into a related module rather than minting a
file for it. Fewer, cohesive modules beat eight fragments. Suggested grouping (adjust to the real
clusters you find):
- `metadataPatch.ts` — cache/bootstrap/apply (`~38-462`), fetch/enrichment (`~1618-1666`),
  details/overview prototype patches incl. `bypassCounter` behavior (`~2817-3001`).
- `activityModel.ts` — news/activity/native partner-event builders + caches (`~484-1273`).
- `activityStorePatch.ts` — native activity + partner-event store patch installers (`~1275-1505`)
  and the activity-refresh listener (`~2692-2701`).
- `navigationRedirect.ts` — Steam link parse/rewrite (`~119-260`), nav redirects (`~1932-2106`),
  native-news history helpers (`~2599-2676`), inline history patches (`~2739-2815`).
- `diagnostics.ts` — click/nav/history traces (`~2108-2578`), installed via the existing
  `getDebugLogging()` gate (preserve it).
- `tabDetection.ts` — route/app-id detection (`~1507-1616`).
- `appLinks.ts` / `communityFeed.ts` (or fold appropriately) — the unmatched app-links hider
  (`~1856-1930`), community-feed passthrough + vote patch (`~3003-3107`), and router detail/activity
  render patches (`~3110-3161`). **These were omitted from the first draft — they must be assigned.**

### Task 3 — Keep `src/steam.ts` as the stable public barrel
`src/steam.ts` must remain the module that `./steam` resolves to, re-exporting **all 19 public
symbols** (listed in Context) from the new modules, and defining/exporting `installSteamPatches`
(or re-exporting it). Do **not** create a `src/steam/index.ts` and leave the old `steam.ts` in
place — `import "./steam"` would keep resolving to the old file. Do not rename any exported symbol.

### Task 4 — Fix moved relative imports + preserve init/side-effect order
- Any relative import in moved code must be re-based: code moving into `src/steam/` that did
  `import … from "./backend"` (or `"./communityFeed"`, `"./tokens"`, etc.) becomes `"../backend"`.
  Note the dynamic `await import("./backend")` in `allNonSteamGames` (`~3212`) → `"../backend"`.
- steam.ts's module state is mostly lazy (initialized inside functions), so import/side-effect
  order risk is low — but the barrel must import/re-export in an order that preserves any
  module-load side effects. State declarations live in `core.ts`, imported first.

### Task 5 — Build + session log
- `./run.sh npx tsc --noEmit` and `./run.sh npm run build` green; rebuild `dist/`.
- Session log: the recorded install/teardown order, the module map, and confirmation the 19-export
  surface + all three consumers are unchanged. Aim each module under ~800 lines (a slightly larger
  cohesive module is fine; a fragmented tiny one is not).

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

```bash
./run.sh npx tsc --noEmit
./run.sh npm run build                  # dist rebuilt
scripts/orchestration/run-quality-gates # full gate, not just tsc/build
git status --short                      # clean after rebuild
```

**Public-surface / consumer diffs (must be empty):**
```bash
# The exported symbols of ./steam are unchanged (all 19):
git show dev:src/steam.ts | grep -oE '^export (const|function|async function|let|class|type|interface) [A-Za-z0-9_]+' | awk '{print $NF}' | sort > /tmp/exports-before.txt
# after: barrel must re-export the same set — compare the resolved ./steam surface
# Consumer import blocks unchanged in ALL THREE importers:
git diff dev..HEAD -- src/index.tsx src/contextMenuPatch.tsx src/components.tsx   # expect EMPTY
```
- The `installSteamPatches` `safeInstallStep` order + inline patch order is byte-identical to the
  Task-0 snapshot (installs-before-`hasSteamInternals()` retry preserved; traces still inside the
  `getDebugLogging()` gate).
- `metadataCache` is still a single exported `const` object (not reassigned); grep the new core
  module.
- Modules import `core`, never each other (no feature-module→feature-module import cycles):
  `grep -rn "from \"\\./" src/steam/*.ts` reviewed for cross-feature edges.
- Module sizes reasonable: `wc -l src/steam/*.ts src/steam.ts` — cohesive, none needlessly tiny or
  oversized.
- Backend pytest unaffected.

### Deferred — on-device smoke checklist (cannot run here)
Sideload and confirm each patched surface still works: metadata **editor reads/writes**, the
**context-menu entry**, **activity cards/modals**, **community-feed passthrough**, **unmatched
app-link hiding**, **Steam-link redirects**, **native-news back-stack** behavior, and non-Steam
game discovery. No visual/behavioral change vs. before.


---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished steam-ts-decomposition
```

This writes:

```text
/tmp/Decky-Metadata/steam-ts-decomposition_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer steam-ts-decomposition`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/steam-ts-decomposition-review-*.md
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
   scripts/orchestration/clear-finished steam-ts-decomposition
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
   git add docs/review/steam-ts-decomposition-review-*.md
   git commit -m "docs(review): record steam-ts-decomposition review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished steam-ts-decomposition
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer steam-ts-decomposition` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed steam-ts-decomposition
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize steam-ts-decomposition
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/steam-ts-decomposition_finalized
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
scripts/orchestration/finalize steam-ts-decomposition
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/steam-ts-decomposition_finished
/tmp/Decky-Metadata/steam-ts-decomposition_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
