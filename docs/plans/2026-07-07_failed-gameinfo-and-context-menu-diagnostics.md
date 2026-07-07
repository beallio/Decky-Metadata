# Plan: Failed GameInfo and Context Menu Diagnostics (failed-gameinfo-and-context-menu-diagnostics)

## Context

The previous feature branch `feat/gameinfo-quicklinks-and-menu` attempted to fix
two on-device bugs, then was locally merged to `dev` at merge commit `d055c61`.
After the packaged build `0.1.0+d055c61` was installed on the Steam Deck, the
user reported that neither fix worked.

Observed installed package state on the Deck:

```text
/home/deck/homebrew/plugins/Decky-Metadata/plugin.json version = 0.1.0+d055c61
```

The previous GameInfo quick-link hypothesis is now falsified as written. The
Deck log showed the new reentry shield firing repeatedly on the repro shortcut
`3015223078` (Transformers Devastation, matched to Steam app `338930`), including
on return from `/steamweb` to `/routes/library/app/3015223078/tab/GameInfo`:

```text
reentry shield armed appId='3015223078' trigger='listen'
```

However, the quick-link buttons still disappeared, and the expected matching
`"bypass truth window hit"` trace did not appear for the failing return. Do not
increase the shield counter or stack another guessed fix on top of the failed
approach. The next implementation must add focused diagnostics at the actual
Steam render and metadata decision boundaries, then leave enough evidence for
the orchestrator/human to identify the real failing path.

The context-menu leak has a clearer likely cause. HLTB for Deck was inspected at
upstream commit `f75e4bb843772b52c2e9454e98659bd673d35e3e`
(`https://github.com/SDH-Stewardship/hltb-for-deck`). Its context-menu patch in
`src/patches/LibraryContextMenu.tsx` reads the app id directly from
`component._owner.pendingProps.overview.appid` and does not use a broad child
tree fallback before deciding menu eligibility. Our current patch in
`src/contextMenuPatch.tsx` first reads the owner app id, but then falls back to
`resolveAppId(menu?.props?.children ?? [], 0)`. That fallback can make a
non-top-level menu such as Manage eligible by recovering a nested or stale app id.
The fix should make top-level menu eligibility strict, while still using cleanup
to remove leaked entries from any menu render.

Relevant source:

- `src/contextMenuPatch.tsx` — context menu app-id resolution, top-level menu
  classification, injection, cleanup, and new diagnostics.
- `src/steam/metadataPatch.ts` — `BIsModOrShortcut` spoof decision tracing and
  existing bypass counters.
- `src/steam/routerPatches.ts` — route render shield and reentry shield tracing.
- `src/steam/install.ts` — debug-gated tracing wiring.
- `src/backend.ts`, `main.py` — existing `frontendLog` bridge and debug logging
  setting; do not add a new backend API.
- `dist/index.js`, `dist/index.js.map` — committed frontend build output.
- `docs/agent_conversations/` — session summary required by `AGENTS.md`.

**Slug used throughout this plan:** `failed-gameinfo-and-context-menu-diagnostics`

---

## Orchestration Contract

**Slug:** `failed-gameinfo-and-context-menu-diagnostics`

**Plan file:**

```text
docs/plans/2026-07-07_failed-gameinfo-and-context-menu-diagnostics.md
```

**Implementation branch:**

```text
feat/failed-gameinfo-and-context-menu-diagnostics
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/failed-gameinfo-and-context-menu-diagnostics_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/failed-gameinfo-and-context-menu-diagnostics_finalized
```

**Review notes:**

```text
docs/review/failed-gameinfo-and-context-menu-diagnostics-review-*.md
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
git checkout -b feat/failed-gameinfo-and-context-menu-diagnostics
```

Commit this plan first:

```bash
git add docs/plans/2026-07-07_failed-gameinfo-and-context-menu-diagnostics.md
git commit -m "docs(plan): add failed-gameinfo-and-context-menu-diagnostics implementation plan"
```

---

## Implementation Tasks

Frontend-focused, diagnostic-first work. There is still no JS unit-test runner in
this repo; do not add one. Use existing TypeScript checks, rollup build, Python
syntax/tests, and on-device diagnostics. New diagnostic logging must be gated by
the existing debug logging setting and must never throw into Steam's call path.

### Task 1 — Preserve the failed-branch evidence in the session log

Create `docs/agent_conversations/2026-07-07_failed-gameinfo-and-context-menu-diagnostics.md`.
Record:

- the installed failing build version `0.1.0+d055c61`;
- that `"reentry shield armed"` appeared for `3015223078` on the return path;
- that `"bypass truth window hit"` did not appear for the failing return;
- that the prior quick-link shield hypothesis is therefore falsified as written;
- the HLTB comparison: HLTB relies on owner `pendingProps.overview.appid`, while
  our broader child-tree fallback can make a submenu eligible.

### Task 2 — Tighten context-menu eligibility and add debug-gated menu traces

Modify only `src/contextMenuPatch.tsx` for this task.

1. Add a debug-gated context-menu trace helper that calls the existing
   `frontendLog("trace", ...)` bridge only when debug logging is enabled. Reuse
   the same setting source used by the Steam patch installer; do not add a new
   backend setting or third-party dependency. The helper must be cheap when
   disabled and must catch/log-ignore backend failures.
2. Emit structured trace records for each relevant context-menu path:
   `first-render`, `should-update`, and `outer-rerender`. Each trace should
   include, when cheaply available:
   - path name;
   - owner app id from `_owner.pendingProps.overview.appid`;
   - fallback app id from child scanning;
   - final app id chosen for insertion;
   - whether `isGameContextMenu` returned true;
   - whether the menu has an `AppProperties` anchor;
   - whether the menu has a `launchSource` handler;
   - whether the plugin removed an existing entry;
   - whether the plugin inserted or skipped insertion;
   - a small list of top-level child keys and text snippets, capped to avoid log spam.
3. Change insertion eligibility so a menu is eligible only when the current
   `LibraryContextMenu` render has a positive owner app id from
   `_owner.pendingProps.overview.appid` and the existing top-level game menu
   shape check passes. Do not let `resolveAppId(menu.props.children, 0)` make a
   menu eligible by itself. The child-tree fallback may still refine the app id
   after eligibility is established, but it must not turn a submenu into an
   eligible menu.
4. Keep `removeOurEntry(...)` unconditional on update/re-render paths so any
   already leaked entry is cleaned up when that menu instance renders again.
5. Keep `insertOurEntry` anchored around `AppProperties` for eligible top-level
   menus only. Do not add a second menu item or change the route
   `/decky-metadata/<appid>`.
6. All new logic inside Steam patch callbacks must be wrapped or routed through
   helpers that cannot throw into Steam rendering.

Expected result for Bug B after this task: HLTB-style owner-appid eligibility
prevents the Manage submenu from becoming eligible, while the existing cleanup
removes prior leaked entries if Steam reuses the affected menu tree.

### Task 3 — Add decision-level diagnostics for GameInfo quick-link disappearance

Modify `src/steam/metadataPatch.ts`, `src/steam/routerPatches.ts`, and
`src/steam/install.ts` only as needed for this task.

1. Extend the existing bypass trace flag so GameInfo diagnostics are enabled by
   the same debug logging setting and disabled on plugin unpatch.
2. In the `BIsModOrShortcut` afterPatch, trace decision-level data for matched
   non-Steam apps on game-detail routes, including:
   - app id;
   - route path from `currentRoutePath()`;
   - original return value;
   - final return value;
   - reason, one of `not-nonsteam`, `original-not-shortcut`, `render-shield`,
     `home-special-case`, `truth-window`, or `normal-shortcut`;
   - `metadataState.bypassBypass` before/after;
   - `metadataState.bypassCounter` before/after;
   - whether `metadataCache[String(appId)]` exists.
3. Rate-limit this trace per app/reason so it is usable on-device. A reasonable
   default is at most one line per app/reason per second, with no logging at all
   when debug logging is disabled.
4. In `installRouterRenderPatches`, trace each time the route-render shield arms
   for a matched non-Steam game, including route, app id, and trigger
   `route-render`.
5. In `installGameDetailReentryShield`, enrich the existing
   `"reentry shield armed"` trace with destination path, trigger, and a compact
   history snapshot when available (`index`, `entries.length`, destination
   pathname). Also trace a debug-gated skip reason when the listener/wrapper sees
   a destination but does not arm because there is no app id, no non-Steam
   overview, or no metadata cache entry.
6. Do not change `BIsModOrShortcut` return semantics, truth-window values,
   `/library/home` special-case behavior, route redirect behavior, or the
   shield value in this diagnostic round unless a review note later supplies
   Deck-log evidence requiring it.

Expected result for Bug A after this task: the next Deck repro produces enough
logs to identify whether Steam is rendering the quick-link row based on a
different app id, a different route state, a later metadata decision, DOM hiding,
or another path outside the previous shield hypothesis.

### Task 4 — Keep scope bounded

Allowed code changes:

- `src/contextMenuPatch.tsx`
- `src/steam/metadataPatch.ts`
- `src/steam/routerPatches.ts`
- `src/steam/install.ts`
- `dist/index.js`
- `dist/index.js.map`
- `docs/agent_conversations/2026-07-07_failed-gameinfo-and-context-menu-diagnostics.md`

Allowed docs-only change:

- this plan file as the first commit on the feature branch.

Do not modify:

- `src/steam/navigationRedirect.ts`
- `src/steam/activity.ts`
- `src/steam/appLinks.ts`
- `src/steam/core.ts` unless a type export is strictly necessary for the
  diagnostics and the session log explains why;
- `main.py`, `backend/`, `tests/`, `package.json`, `package-lock.json`;
- any existing test expected values.

Do not add npm packages or a JS test framework.

### Task 5 — Build, validate, and record the round

1. Rebuild the frontend so `dist/index.js` and `dist/index.js.map` match source:

   ```bash
   ./run.sh npm run build
   ```

2. Run the full quality gate:

   ```bash
   ./run.sh scripts/orchestration/run-quality-gates
   ./run.sh scripts/orchestration/check-review-notes-not-deleted
   git status --short
   ```

3. Commit the implementation and session log after the gate passes.
4. Mark the round complete only when the working tree is clean.

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

Automated verification for the implementer:

```bash
./run.sh npm run build
./run.sh scripts/orchestration/run-quality-gates
./run.sh scripts/orchestration/check-review-notes-not-deleted
git status --short
```

The automated gate proves type/build/backend integrity only. The target bugs are
Steam Game Mode behaviors and require Deck verification after the diagnostic
package is installed.

Deferred on-device verification for the orchestrator/human after this round:

1. Package and install the build on the Deck.
2. Enable debug logging in the plugin settings and reload the plugin or Steam UI
   if needed so frontend diagnostics are active.
3. Reproduce Bug B:
   - open a matched non-Steam game's main context menu;
   - confirm `"Decky metadata..."` appears exactly once in the main menu;
   - open Manage and confirm `"Decky metadata..."` does not appear;
   - collect the new context-menu traces showing owner app id, fallback app id,
     top-level menu classification, insertion, and skip decisions.
4. Reproduce Bug A on a matched non-Steam game such as shortcut `3015223078`
   matched to Steam app `338930`:
   - open GameInfo and confirm the quick-link buttons initially render;
   - open a subsection such as Community, Discussions, or Guides;
   - press Back to return;
   - observe whether quick-link buttons disappear;
   - collect the new route-render, reentry-shield, and `BIsModOrShortcut`
     decision traces.
5. If Bug A still reproduces, do not guess at a fix. Write a review note with
   the captured logs and `STATUS: CHANGES_REQUESTED`; the next implementer round
   should use those logs to target the actual failing path.
6. If Bug B still reproduces, write a review note with the context-menu traces,
   including whether the Manage submenu had an owner app id, `launchSource`,
   `AppProperties`, and a child-derived fallback app id.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished failed-gameinfo-and-context-menu-diagnostics
```

This writes:

```text
/tmp/Decky-Metadata/failed-gameinfo-and-context-menu-diagnostics_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer failed-gameinfo-and-context-menu-diagnostics`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/failed-gameinfo-and-context-menu-diagnostics-review-*.md
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
   scripts/orchestration/clear-finished failed-gameinfo-and-context-menu-diagnostics
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
   git add docs/review/failed-gameinfo-and-context-menu-diagnostics-review-*.md
   git commit -m "docs(review): record failed-gameinfo-and-context-menu-diagnostics review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished failed-gameinfo-and-context-menu-diagnostics
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer failed-gameinfo-and-context-menu-diagnostics` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed failed-gameinfo-and-context-menu-diagnostics
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize failed-gameinfo-and-context-menu-diagnostics
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/failed-gameinfo-and-context-menu-diagnostics_finalized
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
scripts/orchestration/finalize failed-gameinfo-and-context-menu-diagnostics
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/failed-gameinfo-and-context-menu-diagnostics_finished
/tmp/Decky-Metadata/failed-gameinfo-and-context-menu-diagnostics_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
