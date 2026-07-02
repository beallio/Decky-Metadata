# Plan: Refresh button and status for the delisted index (delisted-index-ui)

## Context

The backend plan `delisted-index-backend` adds a cached steam-tracker delisted appid index
(auto-downloaded lazily during a scan) plus two callables: `refresh_delisted_index()` →
`{ ok, count, fetched_at }` and `get_delisted_index_status()` → `{ count, fetched_at }`. This
plan adds a small **UI** to trigger a manual refresh and show status, so the user can populate/
update the index on demand (and see how many delisted apps are cached and when) instead of
waiting for a scan to lazily download it.

**Depends on:** `delisted-index-backend` (must be merged first — the callables must exist).

The QAM plugin content (`Content` in `src/components.tsx`) already has a **Clear cache** button
using the existing `ButtonItem`/`PanelSectionRow` pattern; the frontend callable bindings live
in `src/backend.ts` (e.g. `clearMetadataCache`). Add the delisted controls alongside, following
those patterns.

**Note:** the i18n layer has been removed project-wide — all UI text is now **literal English
strings** inlined at the call site (there is no `t(...)` helper and no `src/i18n.ts`). Use plain
string literals for the new labels; do **not** add i18n keys or reintroduce `t(...)`.

**Intended outcome:** a "Refresh delisted index" button in the plugin's Quick Access panel that
calls `refresh_delisted_index()`, shows a spinner/disabled state while running, then toasts the
result and displays `N apps · updated <date>` (from `get_delisted_index_status()`), loaded on
panel open. Failures toast gracefully.

**Relevant files:** `src/backend.ts` (two new callable bindings), `src/components.tsx`
(the button + status in `Content`, with literal English strings — no i18n).

**Out of scope:** the backend index/matcher (separate plan); any scan/matching change.

**Slug used throughout this plan:** `delisted-index-ui`

---

## Orchestration Contract

**Slug:** `delisted-index-ui`

**Plan file:**

```text
docs/plans/2026-07-01_delisted-index-ui.md
```

**Implementation branch:**

```text
feat/delisted-index-ui
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/delisted-index-ui_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/delisted-index-ui_finalized
```

**Review notes:**

```text
docs/review/delisted-index-ui-review-*.md
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
git checkout -b feat/delisted-index-ui
```

Commit this plan first:

```bash
git add docs/plans/2026-07-01_delisted-index-ui.md
git commit -m "docs(plan): add delisted-index-ui implementation plan"
```

---

## Implementation Tasks

Frontend-only (`src/backend.ts`, `src/components.tsx`, `src/i18n.ts`). No TS test runner
(gate = `tsc --noEmit` + build + py_compile + pytest). Match existing component/i18n patterns.

1. **Callable bindings** (`src/backend.ts`), mirroring existing `callable<...>` bindings:
   ```ts
   export const refreshDelistedIndex = callable<[], { ok: boolean; count: number; fetched_at: number }>(
     "refresh_delisted_index"
   );
   export const getDelistedIndexStatus = callable<[], { count: number; fetched_at: number }>(
     "get_delisted_index_status"
   );
   ```

2. **UI in the QAM `Content`** (`src/components.tsx`, near the Clear-cache button), using the
   existing `PanelSection`/`PanelSectionRow`/`ButtonItem` patterns and **literal English
   strings** (no `t(...)`):
   - Local state: `const [delistedStatus, setDelistedStatus] = useState<{count:number;fetched_at:number}|null>(null);`
     and a `busy`/loading flag (reuse the panel's existing busy pattern if there is one).
   - On mount (an existing `useEffect` in `Content`, or add one), call `getDelistedIndexStatus()`
     and store the result (guard with try/catch).
   - A `ButtonItem` labelled `"Refresh delisted index"` whose `onClick` sets busy, `await
     refreshDelistedIndex()`, toasts `{ title: "Playhub Metadata", body: "Delisted index updated" }`
     on success (or `body: "Delisted index refresh failed"` on error), then refreshes status via
     `getDelistedIndexStatus()`; clears busy in `finally`.
   - A short status line (existing small-text style, e.g. `compactTextStyle`) that **shows when
     it was last refreshed**: when `delistedStatus?.count` and `fetched_at` are set, render
     something like `` `${count} delisted apps · updated ${date}` `` where `date` is derived from
     `fetched_at` (epoch **seconds**) — reuse the editor's `epochToDate` helper if it fits, else
     `new Date(fetched_at * 1000).toLocaleDateString()`; when empty/`0`, render
     `"Delisted index not downloaded yet"`.

3. **Scope discipline:** only the two callable bindings and the button+status in `Content`. No
   backend change (this plan assumes `delisted-index-backend` is already merged); no scan/matching
   change; no i18n (it has been removed) and no npm deps.

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

1. Rebuild from `dev` (with `delisted-index-backend` already merged), sideload.
2. Open the Playhub Quick Access panel → tap **Refresh delisted index** → the status line shows
   a count (~10.9k) and today's date; a re-open shows the persisted status.
3. Trigger a scan and confirm a delisted title matches (covered by the backend plan).

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished delisted-index-ui
```

This writes:

```text
/tmp/Playhub-Metadata-local/delisted-index-ui_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer delisted-index-ui`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/delisted-index-ui-review-*.md
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
   scripts/orchestration/clear-finished delisted-index-ui
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
   git add docs/review/delisted-index-ui-review-*.md
   git commit -m "docs(review): record delisted-index-ui review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished delisted-index-ui
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer delisted-index-ui` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed delisted-index-ui
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize delisted-index-ui
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/delisted-index-ui_finalized
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
scripts/orchestration/finalize delisted-index-ui
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/delisted-index-ui_finished
/tmp/Playhub-Metadata-local/delisted-index-ui_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
