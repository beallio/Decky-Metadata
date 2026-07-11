# Plan: Fix Game Info Route Shield Exhaustion (gameinfo-shield-exhaustion)

## Context

**User-visible problem.** On a matched non-Steam game's page, the Game Info
quick-link buttons (Store Page / Community Hub / Discussions / Guides / Support)
disappear after entering a subsection such as Discussions (`/steamweb`) and
returning. Leaving the game page entirely and re-entering restores them. This
persists after the targeted route shield shipped in
`context-menu-fallback-and-gameinfo-route-state` (merged as `b040ad4`,
review-reworked in `40d1a92`) — that plan's acceptance target ("quick links
survive return to Game Info") is not met.

**Root cause (log-proven on-device).** The targeted shield
(`armRouteShield`/`consumeRouteShield`, `src/steam/core.ts:492-520`) is armed
with `remaining: 4` and a 2000 ms TTL. Device log
(2026-07-07 22:36:48, debug traces from the current build) shows the return
navigation arming the shield (seq 56 via `listen`, then seq 57 via
`route-render`, each `remaining: 4`) and the shield being fully consumed within
~4 ms; the very next `BIsModOrShortcut` call for the same appid in the same
render burst fell through to the truth window (`bypassCounter === -1`, which
`GetPerClientData`/`BHasRecentlyLaunched` re-arm essentially continuously,
`src/steam/metadataPatch.ts:491-535`) and returned `true`. Steam then
re-renders Game Info in "shortcut" mode and drops the quick-link buttons. The
Game Info re-render burst makes well over 4 `BIsModOrShortcut` calls for the
target appid; the pre-rework global shield used 11 globally-decremented calls,
and the per-app budget of 4 undershoots strictly.

The 2000 ms TTL is load-bearing for launch safety: a Play press more than 2 s
after navigation must see the truth (`BIsModOrShortcut === true`) so launch
flows run the shortcut executable. The TTL must therefore stay at 2000 ms; only
the call budget is wrong.

**Prerequisite.** This fix is only observable on-device once
`cold-boot-patch-install` (plan `docs/plans/2026-07-10_cold-boot-patch-install.md`)
is merged — in the current Deck session the patches are not installed at all.
Implementation is independent; on-device verification is not.

**Intended outcome.** Quick-link buttons survive the subsection round-trip on
matched non-Steam games; launch behavior (Play <2 s and >2 s after entering the
page), unmatched shortcuts, and real Steam games are unchanged.

**Relevant files:** `src/steam/core.ts` (shield constants/logic),
`src/steam/routerPatches.ts` (read-only reference — arming sites),
`src/steam/metadataPatch.ts` (read-only reference — consume site),
`dist/index.js` + `dist/index.js.map` (committed build artifacts).

**Slug used throughout this plan:** `gameinfo-shield-exhaustion`

---

## Orchestration Contract

**Slug:** `gameinfo-shield-exhaustion`

**Plan file:**

```text
docs/plans/2026-07-10_gameinfo-shield-exhaustion.md
```

**Implementation branch:**

```text
feat/gameinfo-shield-exhaustion
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/gameinfo-shield-exhaustion_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/gameinfo-shield-exhaustion_finalized
```

**Review notes:**

```text
docs/review/gameinfo-shield-exhaustion-review-*.md
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
git checkout -b feat/gameinfo-shield-exhaustion
```

Commit this plan first:

```bash
git add docs/plans/2026-07-10_gameinfo-shield-exhaustion.md
git commit -m "docs(plan): add gameinfo-shield-exhaustion implementation plan"
```

---

## Implementation Tasks

Frontend-only (TypeScript). No JS unit-test runner exists in this repo — the
quality gate is `tsc --noEmit` + rollup build + Python `py_compile`/`pytest`.
Do **not** add a JS test framework. Keep the plugin invariant: never throw into
Steam's call path.

### Task 1 — make the TTL the primary expiry (`src/steam/core.ts`)

In `armRouteShield` / `consumeRouteShield` (`core.ts:492-520`):

1. Raise the shield call budget from 4 to 64. Introduce it as a named
   module-level constant (e.g. `ROUTE_SHIELD_MAX_HITS = 64`) with a one-line
   comment stating the constraint: the budget exists only as a runaway
   backstop; the 2000 ms TTL is the real expiry and is required by launch
   flows.
2. Keep the TTL at exactly 2000 ms, also lifted into a named constant
   (e.g. `ROUTE_SHIELD_TTL_MS = 2000`). Do not change the age check semantics.
3. Change nothing else about the shield: single-slot, appid-targeted,
   non-matching appids neither hit nor decrement it (`core.ts:508`), stale or
   exhausted shields clear to null, `clearRouteShield` still runs on unpatch
   (`routerPatches.ts:230-241`).

### Task 2 — no other behavior changes

Explicitly out of scope: the truth-window armers
(`GetPerClientData`, `BHasRecentlyLaunched`, `metadataPatch.ts:491-535`), the
in-call `-1` windows (`GetGameID`/`GetPrimaryAppID`,
`metadataPatch.ts:502-512`), the `/library/home` special case, the arming sites
in `routerPatches.ts`, and the two history-rewrite layers
(`navigationRedirect.ts`, `activity.ts`). Launch flows depend on the truth
windows; do not touch them. Do not add title- or appid-specific hacks.

The existing shield traces (`shieldState` with `remaining` before/after in the
`BIsModOrShortcut decision` trace, and the `reentry shield armed/skip` lines)
already carry everything on-device verification needs — do not add new trace
lines.

### Task 3 — rebuild dist and commit

```bash
./run.sh npm run build
git add dist/ src/
git status --short   # must be clean after the commit
```

### Task 4 — session log

Record a session summary at
`docs/agent_conversations/2026-07-10_gameinfo-shield-exhaustion.md` per
`AGENTS.md`, covering: the log-proven exhaustion mechanism (seq 57, 4 hits in
4 ms, truth-window fall-through), why the TTL stays at 2000 ms, and the
deferred on-device verification below.

### Scope discipline (exact allowed change list)

May change:

- `src/steam/core.ts` — the two shield constants and their wiring only.
- `dist/index.js`, `dist/index.js.map` — rebuild output.
- `docs/plans/2026-07-10_gameinfo-shield-exhaustion.md` (first commit),
  `docs/agent_conversations/` session log, committed review notes.

Must NOT change: `src/steam/metadataPatch.ts`, `src/steam/routerPatches.ts`,
`src/steam/install.ts`, `src/steam/navigationRedirect.ts`,
`src/steam/activity.ts`, `src/index.tsx`, `main.py`, `backend/`, `tests/`,
`package.json` dependencies.

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
`py_compile`, `pytest -q`. The behavior itself is only verifiable on-device.

**Deferred on-device verification (required before dev→main; performed by the
human/orchestrator on the Steam Deck, not by the implementer). Prerequisite:
`cold-boot-patch-install` merged and verified, plugin debug logging enabled.**

1. Open a matched non-Steam game (e.g. Transformers Devastation, shortcut
   appid 3015223078 → Steam appid 338930) → Game Info tab → confirm the
   quick-link buttons render.
2. Enter Discussions (`/steamweb` subsection) → press B to return. Expected:
   the quick-link buttons are still present. Repeat 3× in a row.
3. In `~/homebrew/logs/Decky-Metadata/decky-metadata.log`, confirm on the
   return: `reentry shield armed` fires, subsequent `BIsModOrShortcut decision`
   traces for that appid show `reason='render-shield'` with `remaining` never
   reaching 0 mid-burst, and no `reason='truth-window'` line with
   `finalRet='True'` coincides with the return re-render for that appid.
4. Launch regressions: (a) Play from the game page immediately (<2 s) after
   entering it — the shortcut must launch; (b) Play again after sitting on the
   page >2 s — must also launch. Both must run the non-Steam executable, not a
   Steam appid.
5. Regressions: an unmatched non-Steam game still shows no quick-link row; a
   real Steam game's page and subsection round-trip are unchanged.
6. If buttons still vanish and the log shows the shield exhausted (remaining
   reaches 0 during the burst even at 64), stop, attach the log window, and
   escalate in a review note rather than raising the constant blind.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished gameinfo-shield-exhaustion
```

This writes:

```text
/tmp/Decky-Metadata/gameinfo-shield-exhaustion_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer gameinfo-shield-exhaustion`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/gameinfo-shield-exhaustion-review-*.md
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
   scripts/orchestration/clear-finished gameinfo-shield-exhaustion
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
   git add docs/review/gameinfo-shield-exhaustion-review-*.md
   git commit -m "docs(review): record gameinfo-shield-exhaustion review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished gameinfo-shield-exhaustion
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer gameinfo-shield-exhaustion` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed gameinfo-shield-exhaustion
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize gameinfo-shield-exhaustion
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/gameinfo-shield-exhaustion_finalized
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
scripts/orchestration/finalize gameinfo-shield-exhaustion
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/gameinfo-shield-exhaustion_finished
/tmp/Decky-Metadata/gameinfo-shield-exhaustion_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
