# Plan: Fix Game Info Focus Reset on Subsection Return (gameinfo-focus-reset)

## Context

**User-visible problem.** On a matched non-Steam game, entering a Game Info
subsection (e.g. Discussions) and pressing B to return lands the user at the top
of the page (the Play button) instead of where they were in the Game Info
section. Real Steam games restore the prior scroll/focus correctly.

**Root cause (on-device trace, 2026-07-10, Transformers Devastation
`3015223078` → `338930`).** The back navigation is **not** broken: the log shows
`goBack` returning to `path='/library/app/3015223078/tab/GameInfo'` — the correct
route. The problem is a redundant re-render on return. Our GAME_DETAIL_ROUTES
`renderFunc` patch (`src/steam/routerPatches.ts:39-74`) re-runs, for non-Steam
apps, on **every** render:

```ts
void ensureMetadataCache().then(() => {
  applyMetadata(appId);            // <-- re-writes appdetails cache
  void tryEnrichScreenshotsForApp(appId);
  void tryFetchMetadataForApp(appId);
});
void refreshDeckyNativeActivityForApp(appId);
```

`applyMetadata` (`src/steam/metadataPatch.ts:174-283`) calls
`appDetailsCache.SetCachedDataForApp(appId, "descriptions"|"associations"|
"screenshots", …)` (lines 259-282). Those cache writes notify Steam's
app-details subscribers, forcing the Game Info page to re-render and reset
scroll/focus to the top. On the return-from-subsection render the metadata is
unchanged, so the writes are pure churn. Steam games never hit this patch, which
is why only non-Steam games lose their place. (`tryFetch…`/`tryEnrich…`
early-return when data is already present, so the write in `applyMetadata` is the
live trigger; `refreshDeckyNativeActivityForApp` is a secondary suspect.)

**Intended outcome.** Returning from a Game Info subsection on a non-Steam game
keeps the user's place, exactly like Steam games — without regressing first-open
metadata rendering or the quick-link survival behavior (the reentry shield must
keep arming on every render).

**Relevant files:** `src/steam/metadataPatch.ts` (`applyMetadata`,
`metadataState`), `src/steam/routerPatches.ts` (the render patch that re-invokes
it), `src/steam/core.ts` (read-only reference — `metadataCache`, `metadataState`),
`dist/index.js` + `dist/index.js.map` (committed build artifacts).

**Slug used throughout this plan:** `gameinfo-focus-reset`

---

## Orchestration Contract

**Slug:** `gameinfo-focus-reset`

**Plan file:**

```text
docs/plans/2026-07-10_gameinfo-focus-reset.md
```

**Implementation branch:**

```text
feat/gameinfo-focus-reset
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/gameinfo-focus-reset_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/gameinfo-focus-reset_finalized
```

**Review notes:**

```text
docs/review/gameinfo-focus-reset-review-*.md
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
git checkout -b feat/gameinfo-focus-reset
```

Commit this plan first:

```bash
git add docs/plans/2026-07-10_gameinfo-focus-reset.md
git commit -m "docs(plan): add gameinfo-focus-reset implementation plan"
```

---

## Implementation Tasks

Frontend-only (TypeScript). No JS unit-test runner — the gate is `tsc --noEmit`
+ rollup build + Python `py_compile`/`pytest`. Do **not** add a JS test
framework. Never throw into Steam's render/call path.

### Task 1 — make the appdetails-cache write idempotent (`src/steam/metadataPatch.ts`)

The fix is to stop re-writing identical data into the appdetails cache (the
subscriber-notifying, re-render-causing step) when nothing changed since the last
application for that app. Do NOT skip the direct object mutations
(`overview.*`, `appData.descriptionsData`, `appData.associationData`,
`appData.screenshots`) — those are idempotent property sets and do not force a
re-render; only the `SetCachedDataForApp` writes do.

1. Add a per-app "last applied" marker to `metadataState` (e.g.
   `appliedMetadataRef: Record<string, MetadataData>`), tracking the
   `metadataCache[appId]` **object reference** that was last written to the
   appdetails cache.
2. In `applyMetadata` (`metadataPatch.ts:174-283`), keep all existing overview /
   appData mutations unchanged. Guard **only** the `SetCachedDataForApp` block
   (lines 259-282): compute whether this is a real change with
   `metadataState.appliedMetadataRef[String(appId)] !== metadata`. When it is a
   change, perform the writes and set
   `metadataState.appliedMetadataRef[String(appId)] = metadata`. When it is not
   (same object reference — i.e. a re-render with unchanged metadata), skip the
   `SetCachedDataForApp` writes entirely.
   - Because `metadataCache[appId]` is replaced with a **new object** whenever
     data genuinely changes (`tryFetchMetadataForApp` line 314,
     `tryEnrichScreenshotsForApp` line 344 assign fresh objects), the reference
     check correctly re-writes on real updates and skips on pure re-renders.
3. Clear the marker for an app when its metadata object is replaced is automatic
   (the reference differs); no explicit invalidation is needed. Do not clear it
   on navigation.

### Task 2 — do not re-run activity refresh on unchanged re-renders (`src/steam/routerPatches.ts`)

`refreshDeckyNativeActivityForApp(appId)` is called on every GAME_DETAIL_ROUTES
render (`routerPatches.ts:64`) and is a secondary re-render suspect. Guard it so
it only runs when the app changed since the last detail render (reuse
`metadataState.lastObservedGameDetailAppId`, which is set at
`routerPatches.ts:48`): capture the previous value before overwriting it, and
only call `refreshDeckyNativeActivityForApp(appId)` when the app id actually
changed (first entry to this game / switched games), not on same-app re-renders
such as a subsection return. Keep `armRouteShield(...)` and `applyMetadata`
scheduling on every render unchanged — quick-link survival depends on the shield
arming each render.

Note: Task 1 is the primary fix; Task 2 removes the remaining redundant work. If
on-device verification shows Task 1 alone fully fixes the focus reset, Task 2 is
still correct (it removes needless churn) but confirm it does not delay activity
data appearing on first open.

### Task 3 — rebuild dist and commit

```bash
./run.sh npm run build
git add dist/ src/
git status --short   # must be clean after the commit
```

### Task 4 — session log

Record a session summary at
`docs/agent_conversations/2026-07-10_gameinfo-focus-reset.md` per `AGENTS.md`,
covering: the trace proof that `goBack` returns to the correct route, that the
reset comes from redundant `SetCachedDataForApp` writes on re-render, the
reference-equality idempotency guard, and the deferred on-device verification.

### Scope discipline (exact allowed change list)

May change:

- `src/steam/metadataPatch.ts` — Task 1 (the `SetCachedDataForApp` idempotency
  guard + `metadataState` marker).
- `src/steam/routerPatches.ts` — Task 2 (guard the activity refresh on app-id
  change).
- `src/steam/core.ts` — only if the `metadataState` type needs the new
  `appliedMetadataRef` field declared there.
- `dist/index.js`, `dist/index.js.map` — rebuild output.
- `docs/plans/2026-07-10_gameinfo-focus-reset.md` (first commit),
  `docs/agent_conversations/` session log, committed review notes.

Must NOT change: the reentry shield arming, the `BIsModOrShortcut` spoof, the
navigation/history rewrites, `ROUTE_SHIELD_*` constants, `main.py`, `backend/`,
`tests/`, `package.json` dependencies. Do not alter the direct overview/appData
mutations in `applyMetadata`; only the cache-write step is gated.

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

Automated (runs in quality gates): `npx tsc --noEmit`, `npm run build`,
`py_compile`, `pytest -q`. These prove type/build integrity only — the
re-render/focus behavior is only verifiable on-device.

Source-inspection checks the reviewer must confirm from the diff:

1. Only the `SetCachedDataForApp` block is gated by the reference-equality check;
   the overview/appData object mutations still run every call.
2. The marker is set to the exact `metadataCache[appId]` object that was written,
   so a genuinely new metadata object (from fetch/enrich) re-writes.
3. The reentry shield still arms on every render; only the activity refresh is
   app-id-change gated.

**Deferred on-device verification (required before dev→main; performed by the
human/orchestrator on the Steam Deck, debug logging on):**

1. Matched non-Steam game (`Transformers: Devastation` `3015223078`) → Game Info
   → scroll/focus down into the section → Discussions → press B. Expected: return
   keeps the prior focus/scroll (no jump to the Play button). Repeat 3×.
2. Confirm the quick-link buttons still survive the round-trip (no regression of
   the shield fix) and metadata (description/screenshots) is intact.
3. First-open regression: open a non-Steam game fresh (from library) → metadata
   (description, developers, screenshots) still renders on first view; switching
   to a different non-Steam game still applies that game's metadata.
4. In `decky-metadata.log`, confirm the return render no longer coincides with a
   fresh appdetails re-render for the same appid, and that `goBack` still targets
   `/library/app/<appid>/tab/GameInfo`.
5. Compare against a real Steam game to confirm parity (both keep their place on
   subsection return).

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished gameinfo-focus-reset
```

This writes:

```text
/tmp/Decky-Metadata/gameinfo-focus-reset_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer gameinfo-focus-reset`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/gameinfo-focus-reset-review-*.md
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
   scripts/orchestration/clear-finished gameinfo-focus-reset
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
   git add docs/review/gameinfo-focus-reset-review-*.md
   git commit -m "docs(review): record gameinfo-focus-reset review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished gameinfo-focus-reset
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer gameinfo-focus-reset` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed gameinfo-focus-reset
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize gameinfo-focus-reset
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/gameinfo-focus-reset_finalized
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
scripts/orchestration/finalize gameinfo-focus-reset
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/gameinfo-focus-reset_finished
/tmp/Decky-Metadata/gameinfo-focus-reset_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
