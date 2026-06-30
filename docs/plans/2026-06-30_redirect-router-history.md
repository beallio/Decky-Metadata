# Plan: Redirect at React Router history for steamweb nav (redirect-router-history)

## Context

The native app-page Store/Community/Discussions/Guides buttons navigate via Steam's React
Router to `/routes/steamweb`, carrying the target URL in the route **state** (`state.url`,
e.g. `https://store.steampowered.com/app/<synthetic-appid>?snr=…`). The previous attempt
(`redirect-steamweb-route`) rewrote `window.history.pushState`'s state — but that is **too late**:
React Router captures the navigation state when **`m_history.push(...)`** is called and only
then calls `window.history.pushState`. So the page already received the synthetic URL; the
`[playhub:nav] steamweb rewrite` line fired but had no visible effect (confirmed on-device:
still opens the wrong app).

The correct intercept is one layer up — Steam's React Router history
(`Router.WindowStore.GamepadUIMainWindowInstance.m_history`). **The plugin already patches
`m_history.push`/`replace`** (steam.ts:4806-4837) for achievement/news redirects, using
`historyPathFromArgs(args)` (the target path) and `historyStateFromArgs(args)` (the user state
object, which for these buttons is `{ url, FocusNavHistoryID, … }`). Adding the URL rewrite in
that existing patch rewrites the state **before** React Router stores the location, so the
`/routes/steamweb` page loads the matched app.

The URL parser/rewriter already handles these URLs correctly (verified): `steamWebLinkTarget`
matches `store.steampowered.com/app/<id>` (with `?snr=` query) and `steamcommunity.com/app/<id>`,
and `rewriteSteamLinkToMatchedApp` (steam.ts ~254) replaces the synthetic appid with
`steamAppIdForApp(<id>)`.

Relevant code (all `src/steam.ts`): the existing `m_history` push/replace patch (4806-4837);
`historyPathFromArgs` / `historyStateFromArgs`; `rewriteSteamLinkToMatchedApp` (~254);
`steamAppIdForApp` (174); `frontendLog` (log bridge).

**Intended outcome:** tapping Store/Community/Discussions/Guides on a matched shortcut opens
the **correct** matched app's page (all four use the same `/routes/steamweb` + `state.url`
mechanism). Real Steam apps unaffected (their appids aren't shortcut keys → no rewrite).

**Out of scope:** removing the now-redundant `window.history` steamweb rewrite/log from
`redirect-steamweb-route` (harmless; leave it), the broader diagnostic trace cleanup, and the
Community-tab content.

**Slug used throughout this plan:** `redirect-router-history`

---

## Orchestration Contract

**Slug:** `redirect-router-history`

**Plan file:**

```text
docs/plans/2026-06-30_redirect-router-history.md
```

**Implementation branch:**

```text
feat/redirect-router-history
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/redirect-router-history_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/redirect-router-history_finalized
```

**Review notes:**

```text
docs/review/redirect-router-history-review-*.md
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
git checkout -b feat/redirect-router-history
```

Commit this plan first:

```bash
git add docs/plans/2026-06-30_redirect-router-history.md
git commit -m "docs(plan): add redirect-router-history implementation plan"
```

---

## Implementation Tasks

Frontend-only, `src/steam.ts`, inside the **existing** `m_history` push/replace patch
(steam.ts:4811 callback). No TS test runner (gate = `tsc --noEmit` + build + py_compile +
pytest). Never throw; always fall through to `original(...args)`.

1. In the `m_history` `patchMethod` callback (steam.ts:4811), after the existing
   `const state = historyStateFromArgs(args);` (and after the achievement/news handling so it
   does not interfere), add a steamweb rewrite:
   - compute `const path = String(target || "").toLowerCase();` (reuse the existing `target`
     from `historyPathFromArgs`); proceed only when `path.includes("steamweb")`;
   - only when `state && typeof state === "object" && typeof state.url === "string"`;
   - `const rewritten = rewriteSteamLinkToMatchedApp(state.url);`
   - if `rewritten.rewrote`: set `state.url = rewritten.url;` (mutating the state object in
     place — it is the transient nav state already referenced by `args`, so the mutated value
     flows through `original(...args)`), and log once:
     `void frontendLog("nav", "steamweb router rewrite", { from: rewritten.fromAppId, to: rewritten.toAppId }).catch(() => undefined);`
   - then continue to the existing `return original(...args);` (do not early-return; let the
     rest of the existing logic run unchanged — the mutation already applied).
   Wrap the new block in its own try/catch so a failure cannot break the existing
   achievement/news redirect or the navigation.

2. Confirm the rewrite uses the matched id: `rewriteSteamLinkToMatchedApp` →
   `steamAppIdForApp(syntheticAppId)` → the matched `steam_appid`. No new helper needed.

3. **Scope discipline:** add only this rewrite block inside the existing `m_history` patch. Do
   not change `historyPathFromArgs`/`historyStateFromArgs`, the achievement/news redirect
   logic, the `window.history` patches, matching, or appdetails. No npm deps; no `main.py`
   change.

4. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9.

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
2. Tap **Store Page** — confirm it now opens the **matched app's** store page (e.g. Space
   Marine 55150), not the main store; and Community/Discussions/Guides open the matched app's
   real community. Expect `[playhub:nav] steamweb router rewrite from=<synthetic> to=<matched>`
   lines in `playhub-metadata.log`.
3. If still wrong, capture whether the `steamweb router rewrite` line appears: if it appears
   but the page is still wrong, the page reads the URL from somewhere other than the router
   state (feed back for the next step); if it does not appear, `m_history` wasn't the call
   path used.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished redirect-router-history
```

This writes:

```text
/tmp/Playhub-Metadata-local/redirect-router-history_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer redirect-router-history`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/redirect-router-history-review-*.md
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
   scripts/orchestration/clear-finished redirect-router-history
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
   git add docs/review/redirect-router-history-review-*.md
   git commit -m "docs(review): record redirect-router-history review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished redirect-router-history
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer redirect-router-history` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed redirect-router-history
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize redirect-router-history
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/redirect-router-history_finalized
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
scripts/orchestration/finalize redirect-router-history
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/redirect-router-history_finished
/tmp/Playhub-Metadata-local/redirect-router-history_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
