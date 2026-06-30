# Plan: Robustify and diagnose the unmatched app-links hider (fix-applinks-hider-robust)

## Context

The unmatched-app-links hider (hide the native Store/Community/Discussions/Guides/Market
button row on non-Steam games with **no** Steam match) **still does not work on-device** — the
buttons remain visible after the `fix-applinks-hider-class` runtime-hash fix. The hider emits
**no logs**, so we can't tell which stage fails. We need it to work *and* be self-diagnosing.

On-device facts gathered for this plan:
- The live Steam UI (Italian locale) exports the app-details link-section CSS module as
  `{ teLinkSection, RemotePlayInviteLinkSection, LinkRow:"_1tN7mH20YhTaXLqtoW2hR-",
  LinkRowText:"_2sIHGS_555xUrHvjOwV0Y2", LinkRowIcon:"_3UDCWUbI0_05r9ATmvC2HD", … }`. So the
  resolver's target (a module exporting `LinkRow`+`LinkRowText`+`LinkRowIcon`) **exists** and
  the correct hash is `_1tN7mH20YhTaXLqtoW2hR-`. A second, unrelated `LinkRow`
  (`_28suSIoHpEKoSXeeSCR5Vd`, in the SteamFrame/QR module) is correctly excluded by the
  `LinkRowText`/`LinkRowIcon` disambiguation. The device is **Italian** locale — any
  text/label-based approach is off the table; the CSS-hash approach is correct.

Two live suspects for the failure (both must be addressed):
1. **`shouldHideUnmatchedAppLinks()`** (src/steam.ts:3904-3910) requires a strict
   `gameDetailAppIdFromPath(currentRoutePath())` (`pathAppId`) and bails if it's 0 — whereas
   every *working* feature in this file (the redirect, the activity/news guards) resolves the
   current app via **`currentGameDetailAppId()`** (src/steam.ts:1759), which has DOM/title/
   `lastObservedGameDetailAppId` fallbacks. If this device's route path doesn't carry
   `/library/app/<id>` at the moment the poller runs, `pathAppId` is 0 and the hider never
   toggles the body class.
2. **`resolveAppDetailsLinkRowClasses()`** (src/steam.ts:3866-3882) may return `[]` if
   `findModuleChild` misses the module, in which case `buildUnmatchedAppLinksHiderStyle` falls
   back to the useless `[class*="LinkRow"]` selector (hashed classes don't contain the literal
   `LinkRow`), so nothing is hidden even when the body class is applied.

Because each on-device round-trip is expensive (the user must sideload via Decky), this plan
**both robustifies the likely fixes and adds throttled diagnostics** so a single next build
either works or tells us exactly why (`shouldHide` inputs, resolved classes, and whether the
resolved class is present in the live DOM).

Relevant code (all `src/steam.ts`): `installUnmatchedAppLinksHider` (3912-3965),
`shouldHideUnmatchedAppLinks` (3904), `resolveAppDetailsLinkRowClasses` (3866),
`buildUnmatchedAppLinksHiderStyle` (3889), `currentGameDetailAppId` (1759),
`gameDetailAppIdFromPath` (1708), `currentRoutePath` (137), `isNonSteamApp`/`getOverview`
(170-186), `steamAppIdForApp` (173), `frontendLog` (the log bridge), `findModuleChild`.

**Intended outcome:** on an unmatched non-Steam game's detail page the native link-button row
is hidden; matched games and real Steam apps are unaffected; and `playhub-metadata.log` shows
one diagnostic line per state-change describing the decision and resolved class so any residual
failure is pinpointable without guessing.

**Out of scope:** the Steam App ID override (separate plan `steam-appid-override`); the
community-media swap (already merged); the button-redirect (already working). The diagnostics
added here are explicitly temporary and may be removed in a later cleanup pass once the hide is
confirmed on-device.

**Slug used throughout this plan:** `fix-applinks-hider-robust`

---

## Orchestration Contract

**Slug:** `fix-applinks-hider-robust`

**Plan file:**

```text
docs/plans/2026-06-30_fix-applinks-hider-robust.md
```

**Implementation branch:**

```text
feat/fix-applinks-hider-robust
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/fix-applinks-hider-robust_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/fix-applinks-hider-robust_finalized
```

**Review notes:**

```text
docs/review/fix-applinks-hider-robust-review-*.md
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
git checkout -b feat/fix-applinks-hider-robust
```

Commit this plan first:

```bash
git add docs/plans/2026-06-30_fix-applinks-hider-robust.md
git commit -m "docs(plan): add fix-applinks-hider-robust implementation plan"
```

---

## Implementation Tasks

Frontend-only, `src/steam.ts`, in/around `installUnmatchedAppLinksHider` and
`shouldHideUnmatchedAppLinks`. No TS test runner (gate = `tsc --noEmit` + build + py_compile +
pytest). **Never throw**; the hider is passive UI polish and must never affect navigation or
rendering. Italian-locale device: no text/label matching.

### 1. Robustify `shouldHideUnmatchedAppLinks()` to use the same app resolver as working features

Replace the strict `pathAppId` gate so it mirrors how the redirect/guards detect the current
game, while still only firing on a **game-detail** page (not achievements/other subpages, not
non-detail routes):

- Compute `const path = currentRoutePath();`
- Require we are on a game-detail route: derive a boolean `onDetailRoute` that is true when
  `path` matches a library app/details detail route **and not** an `/achievements` (or other
  known sub-route) tail. Reuse existing helpers/constants where possible
  (`GAME_DETAIL_ROUTES` (52), `gameDetailAppIdFromPath` (1708)); a pragmatic check:
  `gameDetailAppIdFromPath(path) > 0 || /\/library\/(app|details)\//i.test(path)` AND
  `!/\/achievements(\b|\/)/i.test(path)`. (Keep it conservative — false negatives just mean the
  row isn't hidden; avoid false positives that would hide buttons on real apps.)
- Resolve the app id with the **fallback resolver**: `const appId = currentGameDetailAppId();`
- Return `onDetailRoute && appId > 0 && isNonSteamApp(getOverview(appId)) &&
  steamAppIdForApp(appId) === 0;`
- Keep the function pure (no logging here; logging lives in the poller, task 3).

### 2. Make the class resolver more robust and confirm we can reach the live class

In `resolveAppDetailsLinkRowClasses()` (3866) keep the existing `isAppDetailsLinkRowModule`
strategy, and **additionally**, if `findModuleChild` returns nothing, do a second pass that
also accepts a module whose own enumerable values include an object with string `LinkRow` +
`LinkRowText` + `LinkRowIcon` (the current inner-prop loop already does this — keep it). Still
return `[]` on failure (the poller's diagnostics will report the miss). Do **not** hardcode the
hash (it changes across Steam updates). The `[class*="LinkRow"]` fallback in
`buildUnmatchedAppLinksHiderStyle` stays as a last resort.

### 3. Add throttled diagnostics to the poller (`installUnmatchedAppLinksHider`)

Inside `update()` (3944), after computing the decision, emit **at most one** log line per
*changed* state (dedupe on a small signature string so the 400ms interval doesn't spam the
log). Use the existing `frontendLog` bridge (area `"applinks"`), wrapped in its own try/catch:

- Build `const decision = shouldHideUnmatchedAppLinks();` once (don't call it twice).
- Build a signature like `` `${decision}|${resolvedLinkRowClasses.join(",")}|${appId}` `` where
  `appId = currentGameDetailAppId()` (recomputed for logging only) and only log when the
  signature differs from the last logged one (store in a closure var).
- Log fields: `{ decision, appId, isNonSteam: <bool>, steamAppId: <number>,
  resolvedClasses: resolvedLinkRowClasses, classPresentInDom: <bool> }` where
  `classPresentInDom` is, for the first resolved class `c`, whether
  `document.querySelector('.' + <css-escaped c>)` finds an element (guard with try/catch;
  this is a read-only probe, it must not throw). This single line tells us (a) whether the
  decision fired, (b) whether the class resolved, and (c) whether that class is actually in the
  live DOM — covering all three failure modes at once.
- Then apply the toggle using the already-computed `decision`:
  `document.body?.classList.toggle(PLAYHUB_HIDE_APP_LINKS_CLASS, decision);`
- All of this stays inside the existing `try/catch` in `update()`; logging failures must be
  swallowed.

### 4. Keep behavior otherwise intact

Do not change the 400ms interval, the style-node lifecycle, the idempotency guard, or teardown
(which already removes the body class, style node, and interval). The style content still comes
from `buildUnmatchedAppLinksHiderStyle(resolvedLinkRowClasses)`.

### 5. Scope discipline

Only: `shouldHideUnmatchedAppLinks` robustification, the resolver hardening, and the throttled
diagnostics + using the single computed `decision`. Do **not** change the redirect, matching,
appdetails, community media, the override, or other navigation. No npm deps; no `main.py`
change. Use `npm ci` if an install is needed.

### 6. Session log

Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9, noting the
diagnostics are temporary and the confirmed live hash is `_1tN7mH20YhTaXLqtoW2hR-` (for
reference only — not hardcoded).

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

Run and confirm:

```bash
export UV_CACHE_DIR=/tmp/Playhub-Metadata-local/.uv
scripts/orchestration/run-quality-gates    # tsc --noEmit + rollup build + py_compile + pytest
git status --short                          # clean
```

Expected: `tsc`/build pass; pytest unchanged-green; tree clean.

Deferred verification (requires hardware — performed by the human/orchestrator):

1. Rebuild from `dev`, sideload.
2. Open an **unmatched** non-Steam game (e.g. *X-Men Origins: Wolverine*) — confirm the
   Store/Community/Discussions/Guides/Market button row is now **hidden**, rest of page intact.
3. Open a **matched** game (Space Marine / Wobbly Life) — confirm its buttons are still
   **visible and working**.
4. In `playhub-metadata.log` confirm a `[playhub:applinks]` line on each page with
   `decision`, `appId`, `isNonSteam`, `steamAppId`, `resolvedClasses`, `classPresentInDom`.
   - If still visible: read that line. `decision=false` → the route/app detection still misses
     (capture the route path); `resolvedClasses=[]` → `findModuleChild` miss; `decision=true`
     and `resolvedClasses` non-empty but `classPresentInDom=false` → the live row uses a
     different class (capture the row's actual DOM `class`). This pinpoints the next fix with no
     guessing.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished fix-applinks-hider-robust
```

This writes:

```text
/tmp/Playhub-Metadata-local/fix-applinks-hider-robust_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer fix-applinks-hider-robust`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/fix-applinks-hider-robust-review-*.md
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
   scripts/orchestration/clear-finished fix-applinks-hider-robust
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
   git add docs/review/fix-applinks-hider-robust-review-*.md
   git commit -m "docs(review): record fix-applinks-hider-robust review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished fix-applinks-hider-robust
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer fix-applinks-hider-robust` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed fix-applinks-hider-robust
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize fix-applinks-hider-robust
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/fix-applinks-hider-robust_finalized
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
scripts/orchestration/finalize fix-applinks-hider-robust
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/fix-applinks-hider-robust_finished
/tmp/Playhub-Metadata-local/fix-applinks-hider-robust_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
