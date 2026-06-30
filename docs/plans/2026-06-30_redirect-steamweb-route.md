# Plan: Redirect steamweb route navigation to matched app (redirect-steamweb-route)

## Context

On-device diagnostics finally pinned down how the native app-page **Store Page / Community
Hub / Discussions / Guides** buttons navigate. For a matched non-Steam shortcut they do **not**
call any `Navigation.*` / `SteamClient.*` method we patch — instead they go straight through
**`window.history.pushState(state, '', '/routes/steamweb')`** (confirmed: the install-trace
showed the patches loaded — `Navigation:14`, `SteamClient.Apps:116`, etc. — and the only thing
firing on a tap was `[playhub:trace] history pushState url='/routes/steamweb'`). So Steam's
in-client web route `/routes/steamweb` is the vehicle, and the target URL/appid is carried in
the **pushState `state` object (first arg)**, not the path — which is why every prior
intercept (URL openers, `ShowStore`) missed it.

We already wrap `history.pushState`/`replaceState` for the trace (steam.ts:4098-4127, logging
only `args[2]`, the path). This plan extends that single intercept to (a) **log the `state`**
so its shape is captured, and (b) **rewrite** any store/community URL inside the state from the
synthetic shortcut appid to the matched `steam_appid` (reusing `rewriteSteamLinkToMatchedApp`,
steam.ts ~254, and `steamAppIdForApp`). If the state carries the URL as a string, this **fixes
the Store button outright**; if the appid is carried some other way, the logged state reveals
the exact shape for a precise follow-up.

Relevant code (all `src/steam.ts`): the history wrap inside `installNavigationTrace`
(4098-4127); `rewriteSteamLinkToMatchedApp` (the pure URL→matched-app rewriter);
`steamAppIdForApp` (174); `frontendLog` (the log bridge); `truncateTraceValue` (the existing
truncation helper used by the trace).

**Intended outcome:** when a matched shortcut's button pushes `/routes/steamweb`, any
store/community URL in the route state is rewritten to the matched app, so the in-client page
opens the **correct** game; the state is also logged so we can confirm/adjust. Real Steam apps
are unaffected (their appids aren't shortcut keys, so nothing rewrites).

**Out of scope:** the Community-tab tile content; removing the broader diagnostic trace (a
later cleanup once buttons are confirmed working).

**Slug used throughout this plan:** `redirect-steamweb-route`

---

## Orchestration Contract

**Slug:** `redirect-steamweb-route`

**Plan file:**

```text
docs/plans/2026-06-30_redirect-steamweb-route.md
```

**Implementation branch:**

```text
feat/redirect-steamweb-route
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/redirect-steamweb-route_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/redirect-steamweb-route_finalized
```

**Review notes:**

```text
docs/review/redirect-steamweb-route-review-*.md
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
git checkout -b feat/redirect-steamweb-route
```

Commit this plan first:

```bash
git add docs/plans/2026-06-30_redirect-steamweb-route.md
git commit -m "docs(plan): add redirect-steamweb-route implementation plan"
```

---

## Implementation Tasks

Frontend-only, `src/steam.ts`, extending the existing `history` wrap. No TS test runner (gate
= `tsc --noEmit` + build + py_compile + pytest). Everything must never throw and must fall back
to the original navigation on any error.

1. **Add a safe state serialiser** `safeStringifyTrace(value, max = 500)`: `try { JSON.stringify
   } catch { String(value) }` with a replacer that turns functions into `"[fn]"` and guards
   against circular refs (track a `WeakSet`), then truncate to `max` via the existing
   `truncateTraceValue`. Used only for logging.

2. **Add a state rewriter** `rewriteSteamwebNavState(state: any): { state: any; rewrote: boolean }`:
   - if `state` is null/undefined or not an object → return `{ state, rewrote: false }`;
   - attempt a deep clone: `try { const clone = structuredClone(state); } catch { return { state, rewrote: false }; }`
     (non-cloneable state → no rewrite, just logging);
   - deep-walk the clone (objects/arrays, depth-bounded ~6, guard circular via a `WeakSet`);
     for every **string** value, run `rewriteSteamLinkToMatchedApp(str)` and, if it reports
     `rewrote`, replace the value in place and set an overall `rewrote = true`;
   - return `{ state: clone, rewrote }`. Never throw (wrap the whole thing; on error return the
     original `state`, `rewrote:false`).

3. **Extend the `history` pushState/replaceState wrap** (steam.ts:4103-4112). Keep the existing
   path log. Then, when `String(args[2] ?? "")` includes `"steamweb"` (case-insensitive):
   - log the state shape once per call:
     `void frontendLog("trace", "history-state", { method: methodName, url: truncateTraceValue(String(args[2] ?? ""), 120), state: safeStringifyTrace(args[0]) }).catch(()=>undefined);`
   - compute `const { state: newState, rewrote } = rewriteSteamwebNavState(args[0]);`
   - if `rewrote`, log `void frontendLog("nav", "steamweb rewrite", { method: methodName }).catch(()=>undefined);`
     and call `original.apply(this, [newState, args[1], args[2]] as any)`;
   - otherwise call `original.apply(this, args)` unchanged.
   All inside the existing try/catch so any failure falls through to `original.apply(this, args)`.

4. **Scope discipline:** only the history wrap enhancement + the two helpers. Do not change the
   redirect's URL/appid openers, matching, appdetails, the broader trace targets, or button
   behavior elsewhere. No npm deps; no `main.py` change.

5. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9.

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

1. Rebuild from `dev`, sideload, re-open a matched game's page fresh.
2. Tap **Store Page** (and the others). In `playhub-metadata.log`:
   - a `[playhub:trace] history-state … state=…` line shows the pushState state shape (confirms
     where the appid/URL lives);
   - if the Store page now opens the **correct** matched game, the fix worked — expect a
     `[playhub:nav] steamweb rewrite` line.
3. If the page still opens the wrong app, paste the logged `history-state` `state=…` back: it
   reveals whether the appid is carried as a non-URL field (e.g. a bare number or a nav id),
   which dictates the precise follow-up rewrite.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished redirect-steamweb-route
```

This writes:

```text
/tmp/Playhub-Metadata-local/redirect-steamweb-route_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer redirect-steamweb-route`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/redirect-steamweb-route-review-*.md
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
   scripts/orchestration/clear-finished redirect-steamweb-route
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
   git add docs/review/redirect-steamweb-route-review-*.md
   git commit -m "docs(review): record redirect-steamweb-route review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished redirect-steamweb-route
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer redirect-steamweb-route` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed redirect-steamweb-route
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize redirect-steamweb-route
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/redirect-steamweb-route_finalized
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
scripts/orchestration/finalize redirect-steamweb-route
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/redirect-steamweb-route_finished
/tmp/Playhub-Metadata-local/redirect-steamweb-route_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
