# Plan: Hide native link buttons on unmatched games (hide-applinks-unmatched)

## Context

Matched non-Steam shortcuts now correctly show working native Store/Community/Discussions/
Guides/Market buttons (the plugin makes them "look like a real app", and the steamweb
navigation is redirected to the matched `steam_appid`). But **non-Steam games with NO Steam
match** (e.g. *X-Men Origins: Wolverine*, delisted/Nintendo titles) also get the "look real"
treatment, so they show the same native link buttons — which go nowhere (no `steam_appid`).
The user wants those buttons **hidden** for unmatched games while **keeping the rich app
page** (Steam ties the buttons to the same "looks real" flag, so they can't be removed
without the page; hence a targeted hide).

From the Deck's steamui, the app-page link buttons use the CSS-module class family
**`LinkRow`** (`LinkRow`, `LinkRowText`, `LinkRowIcon`, `LinkRowIconContainer`) — i.e. in the
live DOM the buttons are elements whose `class` contains `LinkRow`. So the cleanest, re-render-
proof hide is a **scoped CSS rule** (`display:none` on `[class*="LinkRow"]`) gated by a body
class that is present **only while viewing an unmatched non-Steam game's detail page**. This
leaves matched games' working buttons untouched (their body class is never set) and survives
React re-renders (CSS, not element removal).

Relevant code (all `src/steam.ts`): `GAME_DETAIL_ROUTES` (52) and its render hook; route
helpers `currentRoutePath` (137) and `currentGameDetailAppId` (1759); the existing periodic
`routeGuard` interval (used for achievement redirects) as a model for a route-aware toggler;
`steamAppIdForApp` (174), `isNonSteamApp`, `getOverview`; the existing `document.createElement
("style")` injection pattern (e.g. 2398/4708); `Unpatch` teardown.

**Intended outcome:** when the user opens an **unmatched** non-Steam game's page, the native
link-button row (`LinkRow`) is hidden; the rest of the page (info, etc.) stays. Matched games
and real Steam apps are unaffected. Navigating away removes the hide.

**Out of scope:** the Community-tab fabricated content (separate); the broader diagnostics
cleanup. NOTE: `LinkRow` is the best on-device-derived target but is unverified visually —
on-device tuning of the selector is expected (see Verification).

**Slug used throughout this plan:** `hide-applinks-unmatched`

---

## Orchestration Contract

**Slug:** `hide-applinks-unmatched`

**Plan file:**

```text
docs/plans/2026-06-30_hide-applinks-unmatched.md
```

**Implementation branch:**

```text
feat/hide-applinks-unmatched
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/hide-applinks-unmatched_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/hide-applinks-unmatched_finalized
```

**Review notes:**

```text
docs/review/hide-applinks-unmatched-review-*.md
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
git checkout -b feat/hide-applinks-unmatched
```

Commit this plan first:

```bash
git add docs/plans/2026-06-30_hide-applinks-unmatched.md
git commit -m "docs(plan): add hide-applinks-unmatched implementation plan"
```

---

## Implementation Tasks

Frontend-only, `src/steam.ts`. No TS test runner (gate = `tsc --noEmit` + build + py_compile +
pytest). Never throw; passive (no navigation changes).

1. **Add `installUnmatchedAppLinksHider(unpatchers)`** (called from `installSteamPatches`, push
   teardown to `unpatchers`; idempotent via a `globalState.__playhubAppLinksHider` guard).

2. **Inject a scoped style once** (id `playhub-hide-applinks-style`, reuse the existing
   `document.createElement("style")` pattern):
   ```css
   body.playhub-hide-applinks [class*="LinkRow"] { display: none !important; }
   ```
   Append to `document.head`. Track it for teardown removal.

3. **Toggle the body class by route.** Install a small poller (e.g. `window.setInterval(..., 400)`
   — mirror the existing `routeGuard` interval shape; clear it on teardown) that:
   - resolves the current detail appId: `const appId = currentGameDetailAppId();`
   - decides "should hide": `true` when `appId > 0` AND `isNonSteamApp(getOverview(appId))` AND
     `steamAppIdForApp(appId) === 0` (unmatched non-Steam shortcut on a detail page);
     otherwise `false` (matched game, real app, or not on a detail page);
   - `document.body.classList.toggle("playhub-hide-applinks", shouldHide);`
   - wrap in try/catch; the poller must never throw.
   On teardown, remove the body class and the style element and clear the interval.

4. **Scope discipline:** only the style injection + route-aware body-class toggle. Do not change
   the `BIsModOrShortcut` patch, matching, redirects, appdetails, or community content. No npm
   deps; no `main.py` change.

5. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9, noting that
   `[class*="LinkRow"]` is the on-device-derived selector and may need tuning.

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

Deferred verification (requires hardware — performed by the human/orchestrator; selector
tuning expected):

1. Rebuild from `dev`, sideload.
2. Open an **unmatched** non-Steam game (e.g. *X-Men Origins: Wolverine*) — confirm the
   Store/Community/Discussions/Guides/Market button row is **hidden**, while the rest of the
   page remains.
3. Open a **matched** game (e.g. *Space Marine*, *Wobbly Life*) — confirm its buttons are
   **still visible and working** (body class not applied).
4. Confirm nothing else on those pages disappears (i.e. `[class*="LinkRow"]` isn't hiding
   unrelated UI). If it over-hides or under-hides, capture the button row's actual DOM class
   (e.g. via a screenshot/inspection) and refine the selector.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished hide-applinks-unmatched
```

This writes:

```text
/tmp/Playhub-Metadata-local/hide-applinks-unmatched_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer hide-applinks-unmatched`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/hide-applinks-unmatched-review-*.md
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
   scripts/orchestration/clear-finished hide-applinks-unmatched
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
   git add docs/review/hide-applinks-unmatched-review-*.md
   git commit -m "docs(review): record hide-applinks-unmatched review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished hide-applinks-unmatched
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer hide-applinks-unmatched` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed hide-applinks-unmatched
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize hide-applinks-unmatched
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/hide-applinks-unmatched_finalized
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
scripts/orchestration/finalize hide-applinks-unmatched
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/hide-applinks-unmatched_finished
/tmp/Playhub-Metadata-local/hide-applinks-unmatched_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
