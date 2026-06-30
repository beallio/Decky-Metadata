# Plan: Redirect steamweb nav on the correct main-window history (redirect-mainwindow-history)

## Context

On-device diagnostics identified the **exact** history instance the native app-page
Store/Community/Discussions/Guides/Market buttons use to navigate:

```
[playhub:trace] history instances labels=['SteamUIStore.m_WindowStore.MainWindowInstance.m_history', ...]
[playhub:trace] history call instance='SteamUIStore.m_WindowStore.MainWindowInstance.m_history'
                method='push' path='/steamweb' url='https://steamcommunity.com/app/2405230651/guides/'
```

So the navigation goes through **`SteamUIStore.m_WindowStore.MainWindowInstance.m_history`** —
NOT `Router.WindowStore.GamepadUIMainWindowInstance.m_history`, which the previous attempt
(`redirect-router-history`) patched (and which never fired). The path at this layer is
`/steamweb`, and the target URL is in `state.url` (synthetic appid `2405230651`). The rewrite
logic already exists and is correct (`rewriteSteamLinkToMatchedApp` →
`steamAppIdForApp(synthetic)` = matched `steam_appid`); it was simply bound to the wrong
instance.

This plan binds the same `state.url` rewrite to the **correct** instance's `push`/`replace`,
and extends the URL parser to also cover the **Market** button, which uses a query form
(`steamcommunity.com/market/search?appid=<id>`) rather than `/app/<id>`.

Relevant code (all `src/steam.ts`): `installSteamPatches` (install onto `unpatchers`); the
existing `m_history` patch shape (4806-4837) and `historyPathFromArgs` / `historyStateFromArgs`;
`steamWebLinkTarget` (197) and `rewriteSteamLinkToMatchedApp` (~254); `steamAppIdForApp` (174);
`frontendLog`.

**Intended outcome:** tapping Store Page / Community Hub / Discussions / Guides (and Market) on
a matched shortcut opens the **correct matched app** (e.g. Wobbly Life 1211020, Space Marine
55150). Real Steam apps unaffected. This is the precise binding that the multi-step diagnosis
led to.

**Out of scope:** removing the now-noisy diagnostics (a cleanup pass after buttons are
confirmed working); the Community-tab content.

**Slug used throughout this plan:** `redirect-mainwindow-history`

---

## Orchestration Contract

**Slug:** `redirect-mainwindow-history`

**Plan file:**

```text
docs/plans/2026-06-30_redirect-mainwindow-history.md
```

**Implementation branch:**

```text
feat/redirect-mainwindow-history
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/redirect-mainwindow-history_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/redirect-mainwindow-history_finalized
```

**Review notes:**

```text
docs/review/redirect-mainwindow-history-review-*.md
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
git checkout -b feat/redirect-mainwindow-history
```

Commit this plan first:

```bash
git add docs/plans/2026-06-30_redirect-mainwindow-history.md
git commit -m "docs(plan): add redirect-mainwindow-history implementation plan"
```

---

## Implementation Tasks

Frontend-only, `src/steam.ts`. No TS test runner (gate = `tsc --noEmit` + build + py_compile +
pytest). Never throw; always fall through to the original navigation.

1. **Add `installMainWindowHistoryRedirect(unpatchers)`** (called from `installSteamPatches`,
   pushing teardown onto `unpatchers`; idempotent via a `globalState.__playhubMainWindowHistoryRedirect`
   guard):
   - resolve the history instance:
     `const history = (window as any)?.SteamUIStore?.m_WindowStore?.MainWindowInstance?.m_history
      ?? (globalThis as any)?.Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history;`
   - if `history` or its `push`/`replace` aren't functions yet, **retry** on a short timer
     (e.g. every 500ms, up to ~30 attempts) — mirror the retry pattern other patches use — then
     install once available; clear the timer on teardown;
   - patch `push` and `replace` (use the existing `patchMethod` helper for consistency). In the
     wrapper: `const path = historyPathFromArgs(args); const state = historyStateFromArgs(args);`
     then, inside its own try/catch, when `String(path).toLowerCase().includes("steamweb")` and
     `state && typeof state === "object" && typeof state.url === "string"`:
     `const rewritten = rewriteSteamLinkToMatchedApp(state.url); if (rewritten.rewrote) {
       state.url = rewritten.url;
       void frontendLog("nav", "mainwindow steamweb rewrite", { method, from: rewritten.fromAppId, to: rewritten.toAppId }).catch(()=>undefined);
     }` — then `return original(...args);` (mutating `state.url` in place so the matched URL
     flows through before React Router stores the location).
   - never throw; restore `push`/`replace` on teardown if still ours.

2. **Cover the Market query form** in `steamWebLinkTarget` (steam.ts:197). In addition to the
   existing `/app/(\d+)` matches, also match a query-param appid on Steam community/store URLs,
   e.g. `url.match(/(?:store\.steampowered\.com|steamcommunity\.com)\/[^?#]*[?&]appid=(\d+)/i)`.
   Keep the same `{ kind, appId, replace }` return contract — `replace(mapped)` must swap only
   that captured id substring (compute its index as the existing code does with
   `match.index + match[0].lastIndexOf(match[1])`), preserving the rest of the URL/query. Use
   `kind: "community"` for steamcommunity, else `"store"`. Order the matches so the existing
   `/app/<id>` forms still take precedence when both could match.

3. **Scope discipline:** only the new install function + its `installSteamPatches` call + the
   `steamWebLinkTarget` query-appid extension. Do not change matching, appdetails, the existing
   redirects/diagnostics, or other navigation. No npm deps; no `main.py` change.

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
2. Tap **Store Page** — confirm it now opens the **matched app's** store page (not the main
   store / wrong app); and Community Hub / Discussions / Guides / Market open the matched app.
   Expect `[playhub:nav] mainwindow steamweb rewrite method='push' from=<synthetic> to=<matched>`
   lines in `playhub-metadata.log`.
3. If still wrong, capture whether the `mainwindow steamweb rewrite` line appears (if yes but
   the page is wrong, the page reads the URL from a source other than the router state; if no,
   the instance/path guard needs adjustment) — feed back for the next step.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished redirect-mainwindow-history
```

This writes:

```text
/tmp/Playhub-Metadata-local/redirect-mainwindow-history_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer redirect-mainwindow-history`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/redirect-mainwindow-history-review-*.md
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
   scripts/orchestration/clear-finished redirect-mainwindow-history
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
   git add docs/review/redirect-mainwindow-history-review-*.md
   git commit -m "docs(review): record redirect-mainwindow-history review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished redirect-mainwindow-history
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer redirect-mainwindow-history` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed redirect-mainwindow-history
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize redirect-mainwindow-history
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/redirect-mainwindow-history_finalized
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
scripts/orchestration/finalize redirect-mainwindow-history
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/redirect-mainwindow-history_finished
/tmp/Playhub-Metadata-local/redirect-mainwindow-history_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
