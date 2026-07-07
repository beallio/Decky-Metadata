# Plan: Fix GameInfo Quick-Links Loss on Subsection Return and Manage-Submenu Entry (gameinfo-quicklinks-and-menu)

## Context

Two user-reported, on-device-reproduced defects on matched non-Steam games
(repro: Transformers Devastation, shortcut appid 3015223078 matched to Steam
appid 338930). Full diagnosis with log evidence:
`/tmp/fable-reviews/gameinfo-quicklinks-diagnosis.md`.

**Bug A — GameInfo quick-link buttons vanish after returning from a subsection.**
Open the game page → Game Info tab (Store Page / Community Hub / Discussions /
Guide / Market / Support buttons visible) → enter any subsection (e.g.
Discussions, which opens `/steamweb`) → back → the buttons are gone. Fully
leaving the game page and re-entering restores them.

Root cause (diagnosed, mechanism pinned by elimination; exact call ordering on
the return path is inferred and must be confirmed on-device — this task is
**evidence-conditioned**): the buttons only render for a shortcut because the
counter-gated `BIsModOrShortcut` spoof answers "not a shortcut" during the app
page render (`src/steam/metadataPatch.ts:374-388`). On a fresh route mount the
game-detail route render patch arms an 11-call render shield
(`metadataState.bypassBypass = 11`, `src/steam/routerPatches.ts:42`) that
shields the render burst from the 4-call "truth window" armed by
`GetPerClientData` / `BHasRecentlyLaunched` (`src/steam/metadataPatch.ts:390-397`
and `:423-430`). The return from `/steamweb` is a pop (`goBack`) that re-renders
the already-mounted GameInfo tree **without** a fresh route render, so nothing
re-arms the shield; a truth-window arm during the same re-render makes the
quick-links `BIsModOrShortcut` call return `true`, and Steam renders the
`GameInfoQuickLinks` row without buttons. The plugin's two history-rewrite
layers (`src/steam/navigationRedirect.ts:135-171`,
`src/steam/activity.ts:1137-1151` and `:1182-1191`) were investigated and
**refuted** — they preserve every state field and are idempotent; do not touch
them.

**Bug B — "Decky metadata..." leaks into the Manage... submenu.** Our per-game
entry must appear once, in the main game context menu. Two injection paths in
`src/contextMenuPatch.tsx` call `syncOurEntry` without the `isGameContextMenu`
gate that the first-render path has (line 183): the `shouldComponentUpdate`
afterPatch (lines 194-209) and the outer re-render branch (lines 213-219). The
Manage... submenu renders through the same patched `LibraryContextMenu` class,
hits the ungated branch, and `insertOurEntry` (lines 118-139) anchors above the
item whose handler mentions `AppProperties` — which inside Manage is
Properties..., placing our entry inside the submenu.

Intended outcome: (A) the quick-link buttons survive the subsection round-trip
on matched non-Steam games, with debug-gated tracing that lets on-device
verification confirm the diagnosed mechanism; (B) the context-menu entry appears
exactly once, only in the main per-game menu, never inside Manage....

Relevant files: `src/steam/metadataPatch.ts`, `src/steam/routerPatches.ts`,
`src/steam/core.ts`, `src/steam/install.ts`, `src/contextMenuPatch.tsx`,
`dist/` (built artifact, committed).

**Slug used throughout this plan:** `gameinfo-quicklinks-and-menu`

---

## Orchestration Contract

**Slug:** `gameinfo-quicklinks-and-menu`

**Plan file:**

```text
docs/plans/2026-07-06_gameinfo-quicklinks-and-menu.md
```

**Implementation branch:**

```text
feat/gameinfo-quicklinks-and-menu
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/gameinfo-quicklinks-and-menu_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/gameinfo-quicklinks-and-menu_finalized
```

**Review notes:**

```text
docs/review/gameinfo-quicklinks-and-menu-review-*.md
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
git checkout -b feat/gameinfo-quicklinks-and-menu
```

Commit this plan first:

```bash
git add docs/plans/2026-07-06_gameinfo-quicklinks-and-menu.md
git commit -m "docs(plan): add gameinfo-quicklinks-and-menu implementation plan"
```

---

## Implementation Tasks

Frontend-only (TypeScript). There is no JS unit-test runner in this repo — the
quality gate is `tsc --noEmit` + `rollup` build + Python `py_compile`/`pytest`
(see `scripts/orchestration-hooks/quality-gates`). Do **not** add a JS test
framework. TDD is therefore not applicable to these patches; behavior
verification is on-device (see Verification). Every task below must keep the
plugin's invariant: a patch must never throw into Steam's call path — wrap new
logic in try/catch like the surrounding code does.

### Task 1 — Bug B: gate every context-menu injection path (`src/contextMenuPatch.tsx`)

1. In the `shouldComponentUpdate` afterPatch (currently lines 194-209): keep
   `removeOurEntry(nextProps.children)` unconditional (it only removes our own
   keyed entry and must keep cleaning up any menu), but only inject when the
   menu is the per-game menu:

   ```ts
   removeOurEntry(nextProps.children);
   if (shouldUpdate === true && isGameContextMenu(nextProps.children)) {
     syncOurEntry(nextProps.children, appId);
   }
   ```

2. In the outer re-render branch (currently lines 213-219,
   `else if (Array.isArray(menu?.props?.children))`): add the same gate —
   call `syncOurEntry(menu.props.children, appId)` only when
   `isGameContextMenu(menu.props.children)` is true. Consider calling
   `removeOurEntry(menu.props.children)` first unconditionally so any entry
   already leaked into a non-game menu instance is cleaned up on its next
   render.

3. Do **not** change `insertOurEntry`'s anchor. Once both paths are gated, the
   anchor only runs against the main game menu's top-level item list, where the
   `AppProperties` probe resolves to the top-level Manage... item (entry lands
   above Manage...) or falls back to end-of-menu; both placements are correct.
   Record this decision in the session log.

### Task 2 — Bug A, part 1: debug-gated bypass tracing (`src/steam/metadataPatch.ts`)

Purpose: the fix is evidence-conditioned; this trace is what on-device
verification uses to confirm (or falsify) the diagnosed mechanism.

1. In the `BIsModOrShortcut` afterPatch (metadataPatch.ts:374-388), when the
   patch is about to return `true` (i.e. the truth window is armed:
   `bypassCounter === -1 || bypassCounter > 0` after the decrement) **and** the
   app is a matched non-Steam app currently on a game-detail route
   (`metadataCache[String(this.appid)]` exists and
   `gameDetailAppIdFromPath(currentRoutePath()) === Number(this.appid)`), emit a
   trace log, e.g.
   `frontendLog("trace", "bypass truth window hit", { appId, bypassCounter })`.
2. In the two truth-window armers (`BHasRecentlyLaunched` at
   metadataPatch.ts:390-397 and `GetPerClientData` at :423-430), emit an arm
   trace (`frontendLog("trace", "bypass armed", { source: "GetPerClientData" | "BHasRecentlyLaunched" })`).
   `GetPerClientData` is called extremely often across the whole UI: the arm
   trace MUST be throttled/deduplicated (e.g. only log when `bypassCounter` was
   0 before arming, and rate-limit to at most one line per source per second)
   and MUST be gated so it is a no-op unless debug logging is enabled.
3. Gate all of the above on the plugin's debug-logging setting, following the
   existing pattern in `src/steam/install.ts:69-79` (`getDebugLogging()` →
   install trace behavior only when enabled). The simplest conforming shape: a
   module-level `let bypassTraceEnabled = false` in `metadataPatch.ts` with an
   exported setter, flipped from the same `getDebugLogging().then(...)` block in
   `install.ts`. When disabled, the hot paths must do no string building and no
   backend calls.

### Task 3 — Bug A, part 2: re-arm the render shield on return navigation (`src/steam/routerPatches.ts`, wired in `src/steam/install.ts`)

Add a new installer `installGameDetailReentryShield(unpatchers: Unpatch[])` in
`src/steam/routerPatches.ts` (exported, wired in `install.ts` right after
`installRouterRenderPatches`). It mirrors the mount-path shield
(`routerPatches.ts:42`) for pop/return navigation:

1. Resolve the main-window history with the same accessor and retry pattern used
   by `installMainWindowHistoryRedirect` (`src/steam/navigationRedirect.ts:131-133`
   and `:173-188`): `(window as any)?.SteamUIStore?.m_WindowStore?.MainWindowInstance?.m_history ??
   (globalThis as any)?.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history`,
   retrying on a 500 ms timeout up to 30 attempts, with cancel-on-unpatch.
2. Define a helper `armShieldForPath(path: string)`: if
   `gameDetailAppIdFromPath(path) > 0`, the overview is a non-Steam app
   (`isNonSteamApp(getOverview(appId))`), and `metadataCache[String(appId)]`
   exists, set `metadataState.bypassBypass = 11`. (Same condition and value as
   the route render patch at routerPatches.ts:40-42; import `metadataCache` from
   `./core`.) When the bypass trace from Task 2 is enabled, log an arm event
   (`"reentry shield armed"`, with the appId and trigger).
3. Wrap `goBack` (and `go`, when present) on that history via `patchMethod`
   (`core.ts:396-419`): before delegating to the original, compute the
   destination entry when the memory history exposes `entries` and `index`
   (destination index `index - 1` for `goBack`, `index + n` for `go(n)`,
   bounds-checked); take its `pathname` and call `armShieldForPath`. If
   `entries`/`index` are unavailable, skip arming (the listener in step 4 is the
   fallback) — never arm unconditionally.
4. Also register `history.listen((location) => armShieldForPath(location?.pathname || ""))`
   when `typeof history.listen === "function"`, keeping the returned unlisten
   function as an unpatcher. This covers return paths that do not go through
   `goBack`/`go`. Arming twice for one navigation is harmless (it just resets
   the shield to 11, exactly as repeated route renders already do today).
5. Everything inside the wrappers/listener goes in try/catch; on any error fall
   through to the original behavior. Push all teardown (unpatch, unlisten,
   timeout cancel) onto `unpatchers`.

Explicitly out of scope for this task: do NOT modify the two history-rewrite
layers (`navigationRedirect.ts`, `activity.ts`) — they were investigated and
exonerated; do NOT change the `BIsModOrShortcut` decision logic, the truth
windows, or the `/library/home` special case (launch flows depend on the truth
windows).

### Task 4 — rebuild dist and commit

Frontend changes require a dist rebuild and the rebuilt artifact committed:

```bash
npm run build
git add dist/ src/
git status --short   # must be clean after the commit
```

The quality-gates hook runs `tsc --noEmit` and `npm run build` itself; the tree
must be clean (dist committed) when the round is marked complete.

### Task 5 — session log

Record a session summary under `docs/agent_conversations/` per `AGENTS.md`
(e.g. `docs/agent_conversations/2026-07-06_gameinfo-quicklinks-and-menu.md`)
covering: the diagnosed bypass-counter mechanism, the evidence-conditioned
nature of the Bug A fix and what on-device verification must confirm, and the
Bug B gating + anchor decision.

### Scope discipline (exact allowed change list)

May change:

- `src/contextMenuPatch.tsx` — the two gates in Task 1 only.
- `src/steam/metadataPatch.ts` — debug-gated tracing in Task 2 only; no
  behavior change to any return value.
- `src/steam/routerPatches.ts` — new `installGameDetailReentryShield` (Task 3).
- `src/steam/install.ts` — wiring for Tasks 2 and 3 only.
- `dist/index.js`, `dist/index.js.map` — rebuild output.
- `docs/plans/2026-07-06_gameinfo-quicklinks-and-menu.md` (this plan, first
  commit), `docs/agent_conversations/` session log, committed review notes.

Must NOT change: `src/steam/navigationRedirect.ts`, `src/steam/activity.ts`,
`src/steam/appLinks.ts`, `src/steam/core.ts` (import-only usage; no edits),
`src/steam/diagnostics.ts`, `main.py`, `backend/`, `tests/`, `package.json`
dependencies, or any existing test expectations. No new npm packages, no JS
test framework.

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
`py_compile`, `pytest -q`. These prove type/build integrity only — neither bug
is covered by automated tests (no JS test runner in this repo).

**Deferred on-device verification (required before dev→main; performed by the
human/orchestrator on the Steam Deck, not by the implementer):**

Bug A (evidence-conditioned — the fix stands only if these confirm the
diagnosis):

1. Enable the plugin's debug logging. Open a matched non-Steam game
   (e.g. Transformers Devastation, appid 3015223078 → 338930) → Game Info tab →
   confirm the six quick-link buttons render.
2. Enter Discussions (steamweb subsection) → press B to return. Expected with
   the fix: the quick-link buttons are still present.
3. In `~/homebrew/logs/Decky-Metadata/`, confirm the new traces on the return:
   a `"reentry shield armed"` line fires before the GameInfo re-render, and no
   `"bypass truth window hit"` line coincides with the return re-render for
   that appid. If, instead, the buttons still vanish and no truth-window hit is
   logged, the diagnosis is falsified — stop, attach the log window, and
   escalate in a review note rather than iterating blind.
4. Regressions: (a) launch the shortcut from its game page — Play must still
   launch the non-Steam app (truth windows intact); (b) an UNMATCHED non-Steam
   game must still show no quick-link row (appLinks hider unaffected); (c) a
   real Steam game's page and subsection round-trip must be unchanged;
   (d) Activity/news navigation (open a news item, close it) must not gain
   duplicate back-stack entries (the native-news history redirects were not
   touched).
5. Repeat step 2 with debug logging disabled: buttons must still survive and
   no trace lines appear (hot-path gating works).

Bug B:

1. Long-press (or menu-button) a matched non-Steam game in the library:
   "Decky metadata..." appears exactly once in the main context menu (above
   Manage... or at the end), and selecting it opens `/decky-metadata/<appid>`.
2. Open Manage... : our entry must NOT appear inside the submenu. Re-open the
   menu several times in a row (re-render path) — still exactly one entry, in
   the main menu only.
3. Context menu of a real Steam game and of non-game menus (e.g. screenshot
   manager): no injected entry.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished gameinfo-quicklinks-and-menu
```

This writes:

```text
/tmp/Decky-Metadata/gameinfo-quicklinks-and-menu_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer gameinfo-quicklinks-and-menu`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/gameinfo-quicklinks-and-menu-review-*.md
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
   scripts/orchestration/clear-finished gameinfo-quicklinks-and-menu
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
   git add docs/review/gameinfo-quicklinks-and-menu-review-*.md
   git commit -m "docs(review): record gameinfo-quicklinks-and-menu review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished gameinfo-quicklinks-and-menu
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer gameinfo-quicklinks-and-menu` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed gameinfo-quicklinks-and-menu
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize gameinfo-quicklinks-and-menu
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/gameinfo-quicklinks-and-menu_finalized
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
scripts/orchestration/finalize gameinfo-quicklinks-and-menu
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/gameinfo-quicklinks-and-menu_finished
/tmp/Decky-Metadata/gameinfo-quicklinks-and-menu_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
