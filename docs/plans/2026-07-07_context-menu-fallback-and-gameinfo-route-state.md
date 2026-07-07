# Plan: Context Menu Fallback and GameInfo Route State (context-menu-fallback-and-gameinfo-route-state)

## Context

The diagnostic build from
`docs/plans/2026-07-07_failed-gameinfo-and-context-menu-diagnostics.md`
proved two separate frontend issues on-device:

1. The context-menu leak into the Steam `Manage` submenu is fixed, but the
   diagnostic guard is now too strict for valid top-level non-Steam game menus.
   A newly installed shortcut, `Transformers Fall of Cybertron`, was detected
   and stored by the backend as shortcut app id `3276984150` with matched Steam
   app id `213120`, but the top-level context menu skipped insertion because
   Steam did not provide an owner app id:

   ```text
   context-menu phase='outer-rerender' ownerAppId='' fallbackAppId='3276984150' finalAppId='3276984150' isGameContextMenu='True' hasAppProperties='True' hasLaunchSource='True' removedExisting='' insertedOrSkipped='skipped'
   ```

   The intended fix is to allow child/fallback app-id insertion only for a
   strong top-level game context-menu shape, while keeping the `Manage` submenu
   ineligible. Do not reintroduce the submenu leak.

2. The Game Info quick-link issue persists for `Transformers Devastation`
   shortcut app id `3015223078`, matched Steam app id `338930`. Device logs
   show the steamweb rewrite and route-listener shield are firing:

   ```text
   mainwindow steamweb rewrite method='push' from='3015223078' to='338930'
   reentry shield armed appId='3015223078' trigger='listen' path='/library/app/3015223078/tab/GameInfo'
   ```

   However, the metadata decision hook remains route-blind in that call path:

   ```text
   BIsModOrShortcut decision appId='3015223078' path='' originalRet='True' finalRet='' reason='render-shield'
   ```

   The current global `bypassBypass` counter can be consumed by unrelated
   overview checks, and `currentRoutePath()` is empty inside the
   `BIsModOrShortcut` hook on-device. The intended fix is targeted, stateful
   route shielding keyed to the shortcut app id and armed route, not another
   guessed counter increase.

This plan depends on the diagnostic instrumentation and structure already
present on `feat/failed-gameinfo-and-context-menu-diagnostics`. Before starting
code changes, ensure `dev` contains that diagnostic branch's commits. If `dev`
does not contain them, stop and report blocked instead of reimplementing or
duplicating the diagnostics.

Primary files:

- `src/contextMenuPatch.tsx`
- `src/steam/core.ts`
- `src/steam/routerPatches.ts`
- `src/steam/metadataPatch.ts`
- `src/steam/install.ts` only if install/uninstall wiring must reset new state
- `dist/index.js`
- `dist/index.js.map`
- `docs/agent_conversations/2026-07-07_context-menu-fallback-and-gameinfo-route-state.md`

**Slug used throughout this plan:** `context-menu-fallback-and-gameinfo-route-state`

---

## Orchestration Contract

**Slug:** `context-menu-fallback-and-gameinfo-route-state`

**Plan file:**

```text
docs/plans/2026-07-07_context-menu-fallback-and-gameinfo-route-state.md
```

**Implementation branch:**

```text
feat/context-menu-fallback-and-gameinfo-route-state
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/context-menu-fallback-and-gameinfo-route-state_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/context-menu-fallback-and-gameinfo-route-state_finalized
```

**Review notes:**

```text
docs/review/context-menu-fallback-and-gameinfo-route-state-review-*.md
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
git checkout -b feat/context-menu-fallback-and-gameinfo-route-state
```

Commit this plan first:

```bash
git add docs/plans/2026-07-07_context-menu-fallback-and-gameinfo-route-state.md
git commit -m "docs(plan): add context-menu-fallback-and-gameinfo-route-state implementation plan"
```

---

## Implementation Tasks

### 1. Confirm prerequisite state and record the evidence

1. Follow `AGENTS.md` session initialization and use `./run.sh` for project
   commands.
2. Verify the diagnostic branch changes are present after branching from `dev`.
   Check for the current context-menu trace fields and the current
   `BIsModOrShortcut decision` diagnostics before editing. If they are missing,
   stop and report blocked because this plan builds on that diagnostic work.
3. Create the session log:

   ```text
   docs/agent_conversations/2026-07-07_context-menu-fallback-and-gameinfo-route-state.md
   ```

   Record the two device observations from the Context section, the files
   touched, design decisions, and validation results. Keep the log updated as
   implementation proceeds.

### 2. Fix top-level context-menu fallback without restoring submenu leakage

1. In `src/contextMenuPatch.tsx`, replace the current owner-app-id-only
   insertion eligibility with a two-layer decision:
   - Use `ownerAppId` when Steam provides a positive owner app id.
   - Use `fallbackAppId` only when the menu shape is a strong top-level game
     context menu.
   - Keep the app id positive before insertion.
2. A strong top-level game context menu must include the current structural
   evidence used by diagnostics, including a top-level game-context shape,
   `AppProperties`, and `launchSource`. Do not insert when those helpers are
   absent or false.
3. Keep cleanup unconditional: existing `Decky Metadata` entries must still be
   removed before deciding whether to insert.
4. Keep the existing `/decky-metadata/<appid>` destination behavior.
5. Preserve and improve diagnostic traces so on-device logs can distinguish:
   - owner app id used;
   - fallback app id used;
   - skipped because submenu/not top-level;
   - skipped because no valid app id;
   - skipped because the game-menu shape is incomplete.
6. Do not special-case specific game titles or app ids.
7. Acceptance target:
   - `Transformers Fall of Cybertron` top-level context menu is eligible with
     fallback app id `3276984150`.
   - Steam `Manage` submenu remains ineligible even if child items contain an
     app id.

### 3. Replace untargeted Game Info shielding with targeted route state

1. In `src/steam/core.ts`, extend `metadataState` with a small targeted route
   shield object. Use explicit fields such as:
   - `appId`;
   - `path`;
   - `trigger`;
   - `armedAt`;
   - `remaining`;
   - optional generation/sequence id if useful for tracing.
2. Provide helper functions in the existing steam patch layer if they keep the
   state handling readable. The helper behavior must be deterministic:
   - arm only for a positive shortcut app id;
   - decrement only when the `BIsModOrShortcut` hook is evaluating that same app
     id;
   - expire by age and/or remaining matching evaluations;
   - clear when exhausted, stale, or explicitly reset during uninstall.
3. In `src/steam/routerPatches.ts`, arm the targeted shield when the router
   render/listener/main-window path proves the user is entering the matched
   shortcut's game-detail route, especially `GameInfo`. Capture the intended
   path and trigger in the shield state.
4. Do not rely on `currentRoutePath()` inside the `BIsModOrShortcut` hook to
   decide whether the route is Game Info. Device logs prove that value can be
   empty there.
5. In `src/steam/metadataPatch.ts`, consult the targeted shield before falling
   back to broader route/path checks:
   - If `this.appid` matches the armed shortcut app id and the shield is still
     valid, return the spoofed/non-shortcut value needed to keep Steam's
     Game Info quick links visible.
   - If the app id does not match, do not decrement or consume the shield.
   - Preserve existing truth-window behavior where it is still applicable, but
     do not use a global untargeted counter as the primary Game Info fix.
6. Add diagnostics for the targeted decision:
   - armed app id;
   - evaluated app id;
   - target path;
   - trigger;
   - remaining before/after;
   - reason for hit, miss, expiry, or clear.
7. Ensure plugin uninstall/unpatch cleanup cannot leave stale targeted shield
   state behind.
8. Do not increase `bypassBypass` blindly and do not add title/app-id specific
   hacks.
9. Acceptance target:
   - On return to `Transformers Devastation` Game Info, quick links survive even
     if `currentRoutePath()` logs as empty in the decision hook.
   - Logs show a targeted shield hit for shortcut app id `3015223078`.
   - Unrelated app ids do not consume the shield.

### 4. Build artifact and documentation

1. Run the frontend build so `dist/index.js` and `dist/index.js.map` match the
   TypeScript source changes.
2. Keep backend files unchanged unless a verified reason appears. This plan is
   frontend Steam patch work; do not modify providers, matching, storage, or
   Python dependencies.
3. Update the session log with final validation commands and results.
4. Commit in small Conventional Commit steps:
   - plan commit first;
   - implementation commit(s);
   - build artifact/session log commit as appropriate.

---

## Quality Gates

Run before marking any round complete:

```bash
./run.sh npm run build
./run.sh scripts/orchestration/run-quality-gates
./run.sh scripts/orchestration/check-review-notes-not-deleted
git diff --check dev...HEAD
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

Automated/local verification:

1. `./run.sh npm run build`
2. `./run.sh scripts/orchestration/run-quality-gates`
3. `./run.sh scripts/orchestration/check-review-notes-not-deleted`
4. `git diff --check dev...HEAD`
5. `git status --short`

Deferred on-device verification:

1. Package and install the plugin on the Deck.
2. Enable debug logging and reload the plugin.
3. Open the top-level context menu for shortcut app id `3276984150`
   (`Transformers Fall of Cybertron`). Confirm the `Decky Metadata` entry is
   inserted and navigates to `/decky-metadata/3276984150`.
4. Open that game's `Manage` submenu. Confirm no `Decky Metadata` entry appears
   there.
5. Open `Transformers Devastation` shortcut app id `3015223078`, go to Game
   Info, use a Steam quick link such as Community or Guide, then return. Confirm
   Game Info quick links remain visible.
6. Inspect latest plugin logs. Confirm:
   - context-menu trace reports fallback eligibility for `3276984150`;
   - context-menu trace reports submenu skip for `Manage`;
   - targeted Game Info shield is armed for `3015223078`;
   - `BIsModOrShortcut` logs a targeted shield hit for `3015223078`;
   - unrelated app ids do not consume the targeted shield.
7. Spot-check an unmatched/non-Steam shortcut. Confirm the plugin does not add
   context-menu entries or Game Info spoofing where no matched metadata exists.

The implementer should not claim the on-device portion is complete unless those
manual Deck checks are actually performed. If only local gates are run, record
the Deck checks as deferred in the session log and round summary.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished context-menu-fallback-and-gameinfo-route-state
```

This writes:

```text
/tmp/Decky-Metadata/context-menu-fallback-and-gameinfo-route-state_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer context-menu-fallback-and-gameinfo-route-state`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/context-menu-fallback-and-gameinfo-route-state-review-*.md
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
   scripts/orchestration/clear-finished context-menu-fallback-and-gameinfo-route-state
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
   git add docs/review/context-menu-fallback-and-gameinfo-route-state-review-*.md
   git commit -m "docs(review): record context-menu-fallback-and-gameinfo-route-state review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished context-menu-fallback-and-gameinfo-route-state
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer context-menu-fallback-and-gameinfo-route-state` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed context-menu-fallback-and-gameinfo-route-state
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize context-menu-fallback-and-gameinfo-route-state
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/context-menu-fallback-and-gameinfo-route-state_finalized
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
scripts/orchestration/finalize context-menu-fallback-and-gameinfo-route-state
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/context-menu-fallback-and-gameinfo-route-state_finished
/tmp/Decky-Metadata/context-menu-fallback-and-gameinfo-route-state_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
