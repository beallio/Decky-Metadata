# Plan: Gate BIsModOrShortcut Spoof to Matched Games (matched-only-shortcut-spoof)

## Context

**Problem (confirmed on-device 2026-07-13 via CDP).** Non-Steam launcher
shortcuts we never matched — Heroic Games Launcher, Ludusavi — get stuck with
Steam's **"New to Library"** badge in Gaming Mode. Root cause: our
`BIsModOrShortcut` afterPatch spoofs these apps as **not a shortcut**
(returns `false`) by default, presenting them to Steam as real, never-played
apps → Steam applies the "new & never launched" badge. Measured signature on
both launchers (plugin installed): idle `BIsModOrShortcut()` = `[false×8]`; after
a `GetPerClientData()` call (which arms `bypassCounter = 4`) =
`[true,true,true,false,false,false,false,false]` — the exact output of
`decideBIsModOrShortcut`.

**Why it hits unmatched apps.** The spoof is only *intended* for **matched
games** (so their Game Info renders as a real Steam page). But its gate,
`isNonSteamAppWithoutPatchedMethod` (`src/steam/core.ts:79`), returns `true` for
**every** non-Steam shortcut via the `app_type === NON_STEAM_APP_TYPE` /
`BIsShortcut()` branches — `metadataCache` membership is only the *third* branch.
So Heroic/Ludusavi (not in `metadataCache`; our store holds only matched games)
are spoofed too. Matched games and *played* emulator shortcuts escape the badge
because they have playtime; the launcher tools do not.

**Intended outcome.** Spoof `BIsModOrShortcut` **only for apps present in
`metadataCache`** (matched games). For any other non-Steam shortcut, return
Steam's native value so it keeps its true shortcut status and Steam stops
tagging it. Matched-game behavior must be unchanged, and the 2026-07-11 launch
regression fix (in-call truth via `bypassCounter === -1`) must remain
top-ranked.

**Relevant files (the entire change surface):**
- `src/steam/spoofDecision.ts` — pure, unit-tested decision function. Add a
  `hasCache` input and an early "not-matched" passthrough.
- `src/steam/spoofDecision.test.ts` — TDD: add cases for the uncached passthrough
  and confirm cached (matched) behavior is preserved.
- `src/steam/metadataPatch.ts` — the single call site; pass the already-computed
  `hasCache` into the decision.

**Slug used throughout this plan:** `matched-only-shortcut-spoof`

---

## Orchestration Contract

**Slug:** `matched-only-shortcut-spoof`

**Plan file:**

```text
docs/plans/2026-07-13_matched-only-shortcut-spoof.md
```

**Implementation branch:**

```text
feat/matched-only-shortcut-spoof
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/matched-only-shortcut-spoof_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/matched-only-shortcut-spoof_finalized
```

**Review notes:**

```text
docs/review/matched-only-shortcut-spoof-review-*.md
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
git checkout -b feat/matched-only-shortcut-spoof
```

Commit this plan first:

```bash
git add docs/plans/2026-07-13_matched-only-shortcut-spoof.md
git commit -m "docs(plan): add matched-only-shortcut-spoof implementation plan"
```

---

## Implementation Tasks

Follow TDD: write the failing tests in step 2 first, watch them fail, then make
the change in steps 1 and 3 to turn them green. Do not modify any files outside
the three listed in Context.

### 1. `src/steam/spoofDecision.ts` — add the `hasCache` gate

- Add `"not-matched"` to the `SpoofReason` union type.
- Add `hasCache: boolean;` to the `SpoofInput` type.
- In `decideBIsModOrShortcut`, insert a new guard **immediately after the
  `bypassCounter === -1` (in-call-truth) block and before `const shieldHit =
  consumeShield();`** — so nothing outranks in-call truth and the uncached
  passthrough never consumes shield budget:

  ```ts
  // Only matched games (in metadataCache) are intentionally spoofed as
  // real Steam apps so their Game Info renders. For any OTHER non-Steam
  // shortcut (Heroic, Ludusavi, unmatched emulator entries), spoofing them
  // as real never-played apps makes Steam tag them "New to Library". Return
  // the native value so they keep their true shortcut status. Placed after
  // the in-call-truth check so nothing outranks bypassCounter === -1.
  if (!hasCache) {
    return { finalRet: originalRet, reason: "not-matched", shieldConsulted: false, shieldHit: false, nextBypassCounter: bypassCounter };
  }
  ```

- Do not change any existing branch. The default (cached) path must still return
  `finalRet: false` / reason `"normal-shortcut"` when idle.

### 2. `src/steam/spoofDecision.test.ts` — TDD cases (write first)

- Update the shared `base` fixture to include `hasCache: true` (matched-game
  path), so every existing assertion continues to represent a cached app and
  keeps passing unchanged.
- Add these cases:
  1. **Uncached apps are not spoofed (idle):** `{ ...base, hasCache: false }` with
     a `consumeShield: vi.fn(() => true)` → expect `finalRet: true` (the native
     `originalRet`), `reason: "not-matched"`, `shieldConsulted: false`,
     `nextBypassCounter: 0`, and assert `consumeShield` was **not** called.
  2. **Uncached passthrough outranks the render shield:** same as above, assert
     the shield is never consulted even though it would hit.
  3. **Uncached passthrough on the home route does not spoof:**
     `{ ...base, hasCache: false, path: "/library/home" }` → `finalRet: true`,
     `reason: "not-matched"` (not `"home-special-case"`).
  4. **Uncached passthrough ignores an armed truth window:**
     `{ ...base, hasCache: false, bypassCounter: 4 }` → `finalRet: true`,
     `reason: "not-matched"`, `nextBypassCounter: 4` (unchanged — no decrement).
  5. **In-call truth still wins for uncached apps:**
     `{ ...base, hasCache: false, bypassCounter: -1 }` → `finalRet: true`,
     `reason: "in-call-truth"`, `nextBypassCounter: -1` (the in-call-truth block
     runs before the new guard).
- Run `npx vitest run src/steam/spoofDecision.test.ts` and confirm the new cases
  fail before step 1/3 and pass after.

### 3. `src/steam/metadataPatch.ts` — thread `hasCache` into the call

- In the `BIsModOrShortcut` `safeAfterPatch` (around the
  `decideBIsModOrShortcut({ ... })` call), add `hasCache,` to the input object.
  `hasCache` is **already computed** just above as
  `const hasCache = !!metadataCache[String(appId)];` — reuse it; do not
  recompute. No other change to this file.

### 4. Commit

- Commit the code + test change together, e.g.
  `fix(steam): spoof BIsModOrShortcut only for matched games`.
- No docs/spec file documents this internal behavior, so no docs update is
  required (the runbook reference in `docs/runbooks/on-device-verification.md` is
  unaffected). Do not add new docs.

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

### Automated (must pass this round)

Run the full gate from the repo root:

```bash
scripts/orchestration/run-quality-gates
```

This runs `npx tsc --noEmit`, the rollup build, `npm test` (vitest — includes the
new `spoofDecision.test.ts` cases), Python byte-compile, and pytest. All must be
green. Also confirm the focused suite passes:

```bash
npx vitest run src/steam/spoofDecision.test.ts
```

### Deferred on-device verification (owner-run; NOT required to mark the round complete)

Requires reinstalling the built plugin on the Deck, so it happens after this
sub-plan merges to `dev`. The orchestrator/owner performs it using the committed
CDP tooling in `scripts/deck/` (see `docs/runbooks/on-device-verification.md`):

1. **Launchers report their true status again.** With the fixed bundle installed,
   in the idle state `appStore.GetAppOverviewByAppID(<heroic_appid>).BIsModOrShortcut()`
   returns **`true`** (native) instead of `false` — for Heroic (`3245664592`) and
   Ludusavi (`3867646107`). Before this fix the idle value was `false`.
2. **Badge clears.** After a Steam restart (Gaming Mode → STEAM → Power → Restart
   Steam, so the library recomputes), the **"New to Library"** badge is gone from
   Heroic and Ludusavi.
3. **No matched-game regression.** A matched game still renders its Game Info page
   normally (spoof still active for cached apps) and non-Steam matched games still
   launch — i.e. the 2026-07-11 launch path is intact.

State explicitly in the session log that on-device verification is **deferred**
to the owner and is not a blocker for round completion.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished matched-only-shortcut-spoof
```

This writes:

```text
/tmp/Decky-Metadata/matched-only-shortcut-spoof_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer matched-only-shortcut-spoof`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/matched-only-shortcut-spoof-review-*.md
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
   scripts/orchestration/clear-finished matched-only-shortcut-spoof
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
   git add docs/review/matched-only-shortcut-spoof-review-*.md
   git commit -m "docs(review): record matched-only-shortcut-spoof review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished matched-only-shortcut-spoof
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer matched-only-shortcut-spoof` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed matched-only-shortcut-spoof
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize matched-only-shortcut-spoof
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/matched-only-shortcut-spoof_finalized
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
scripts/orchestration/finalize matched-only-shortcut-spoof
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/matched-only-shortcut-spoof_finished
/tmp/Decky-Metadata/matched-only-shortcut-spoof_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
