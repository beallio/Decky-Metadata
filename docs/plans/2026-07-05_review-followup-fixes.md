# Plan: Fix confirmed findings from retroactive agy reviews (review-followup-fixes)

## Context

Retroactive thermo-nuclear reviews (agy, write-to-file) of the merged backlog commits surfaced
a small set of **confirmed, orchestrator-vetted** defects. This plan fixes those; the many
subjective quality nits the reviews also produced are explicitly out of scope.

**Confirmed defects to fix:**

1. **Regression — save/remove error handling dropped (frontend).** The `components-tsx-decomposition`
   move lost `saveCurrent`'s error handling: the old `components.tsx` `saveCurrent` had a
   `try/catch → toastError("Save failed")`; the current `src/MetadataPage.tsx` `saveCurrent`
   (~103) has **no try/catch and no busy guard**, so a `saveMetadata` failure becomes a silent
   unhandled rejection with no user feedback, and the button can be double-invoked.
   `removeCurrent` (~177) is likewise unguarded (pre-existing, harden it), and `applyResult`
   (~162) has `try/finally` with **no `catch`** (errors swallowed).

2. **Behavior change — Steam-news image body-fallback dropped (backend).** `scan-pipeline-refactor`
   replaced the inline image collection in `_sanitize_steam_news` with
   `_collected_steam_news_image_sources`, which **dropped** the old fallback
   `if not image_sources: image_sources = self._steam_news_image_candidates(raw_body_source, 0)`.
   News items whose images live only in the raw body now yield no images. `raw_body_source` is
   still computed in `_sanitize_steam_news` (`main.py:1018`), so the fallback is trivially
   restorable.

3. **Type holes in the scan pipeline (backend).** `Plugin._run_scan_pipeline` (`main.py:566-567`)
   types `resolver: Any` / `saver: Any` while `backend/scan_runner.run_scan_pipeline` is properly
   typed; and `ScanPipelineResult.status` (`backend/scan_runner.py:11`) is `str` where the
   load-bearing invariant is `Literal["matched", "miss"]`.

**Intended outcome:** the save/remove/apply handlers all guard + report errors like their
siblings; news images with body-only sources are retained again; the scan-pipeline callables and
status are properly typed. Behavior otherwise unchanged.

### Relevant files
`src/MetadataPage.tsx` (handlers), `main.py` (`_sanitize_steam_news` fallback + `_run_scan_pipeline`
types), `backend/scan_runner.py` (`ScanPipelineResult.status` Literal), `tests/` (image-fallback
regression test), `dist/index.js` (rebuilt), `docs/agent_conversations/`.

**Out of scope (noted from the reviews, not fixed here):** `epochToDate` duplication, the
`_plog` callback duplication across `backend/` modules, `FocusableButton: any`,
`_save_scan_pipeline_metadata` thin wrapper, `status`/`source` further `Literal` on `source`, and
all file-size/decomposition-depth notes. These are subjective quality items for a possible later
pass; do NOT do them here.

> Source: retroactive agy thermo-nuclear reviews (2026-07-05), each finding verified against the
> current code by the orchestrator (stale/already-fixed findings excluded).

**Slug used throughout this plan:** `review-followup-fixes`

---

## Orchestration Contract

**Slug:** `review-followup-fixes`

**Plan file:**

```text
docs/plans/2026-07-05_review-followup-fixes.md
```

**Implementation branch:**

```text
feat/review-followup-fixes
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/review-followup-fixes_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/review-followup-fixes_finalized
```

**Review notes:**

```text
docs/review/review-followup-fixes-review-*.md
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
git checkout -b feat/review-followup-fixes
```

Commit this plan first:

```bash
git add docs/plans/2026-07-05_review-followup-fixes.md
git commit -m "docs(plan): add review-followup-fixes implementation plan"
```

---

## Implementation Tasks

Locate code by symbol. Behavior-preserving except the intended restorations below.

### Task 1 — Restore/add error handling in `src/MetadataPage.tsx`

Match the existing sibling pattern used by `applySteamAppId`/`search` (busy guard + `setBusy(true)`
+ `try` + `catch` → `toastError` + `finally` → `setBusy(false)`).

- `saveCurrent` (~103): add `if (busy) return;` after the `nonSteam` guard, then `setBusy(true)`
  and wrap the `saveMetadata`/`applyMetadata`/toast body in `try { … } catch (error) {
  toastError("Save failed", String(error)); } finally { setBusy(false); }`.
- `removeCurrent` (~177): same pattern, `catch` → `toastError("Remove failed", String(error))`.
- `applyResult` (~162): it already has `try/finally`; add a `catch (error) { toastError("Fetch
  failed", String(error)); }` before the `finally`.

Do not change the success paths, toasts' success wording, or the `nonSteam` early-returns. Rebuild
`dist` in Task 4.

### Task 2 — Restore the Steam-news image body-fallback (`main.py`)

In `_sanitize_steam_news` (~1003), immediately after
`image_sources = self._collected_steam_news_image_sources(item)` (~1029), restore the fallback:

```python
if not image_sources:
    image_sources = self._steam_news_image_candidates(raw_body_source, 0)
```

`raw_body_source` is already in scope (computed ~1018). This makes news items whose images live
only in the raw body keep their images, matching pre-refactor behavior. Do not otherwise change
`_collected_steam_news_image_sources` or the sanitize loop.

**TDD:** add `tests/test_steam_news_image_fallback.py` — a `_sanitize_steam_news` input whose
item has empty `image`/`image_url`/`image_sources` but a `raw_body`/`body` containing an image URL
must produce a non-empty `image_sources` (i.e. the fallback fires). Assert red before the fix,
green after.

### Task 3 — Tighten scan-pipeline types

- `main.py` `_run_scan_pipeline` (~566-567): change `resolver: Any` / `saver: Any` to
  `resolver: Callable[[ScanPipelineTarget], ScanPipelineResult]` and
  `saver: Callable[[int, dict[str, Any]], Awaitable[None]]`. Import `Callable`, `Awaitable` from
  `typing` if not already imported. `ScanPipelineTarget`/`ScanPipelineResult` are already imported
  from `backend.scan_runner`.
- `backend/scan_runner.py` `ScanPipelineResult.status` (~11): change `status: str` to
  `status: Literal["matched", "miss"]` (import `Literal` from `typing`). Leave `source` as `str`
  (out of scope to constrain further).
- These are annotation-only; runtime behavior is unchanged. `py_compile` + the type gate must stay
  green.

### Task 4 — Rebuild + session log

- `./run.sh npm run build`; stage `dist/`.
- Record `docs/agent_conversations/2026-07-05_review-followup-fixes.md`: the three confirmed
  findings (with their review source), the fixes, the restored-fallback TDD evidence, and the
  explicitly-deferred quality nits.

### Scope discipline

Only the three confirmed defects above. Do NOT touch the deferred quality items (epochToDate dup,
_plog dup, FocusableButton any, wrapper removal, file sizes). Preserve all other behavior.

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

Automated (via `./run.sh`):

```bash
./run.sh npx tsc --noEmit
./run.sh npm run build                              # dist rebuilt
./run.sh python3 -m py_compile main.py backend/*.py
./run.sh uv run --with pytest -- pytest -q           # incl new image-fallback test
scripts/orchestration/run-quality-gates
git status --short                                   # clean
```

Grep/scope gates:

```bash
# Task 1 — all three handlers now guard + report:
grep -nE "const (saveCurrent|removeCurrent|applyResult)" src/MetadataPage.tsx
grep -c "toastError" src/MetadataPage.tsx            # increased (save/remove/apply covered)
grep -nE "if \(busy\) return" src/MetadataPage.tsx    # save + remove guarded
# Task 2 — fallback restored:
grep -n "_steam_news_image_candidates(raw_body_source" main.py   # present again
# Task 3 — types tightened:
grep -nE "resolver: Callable|saver: Callable" main.py            # no more Any
grep -n 'Literal\["matched", "miss"\]' backend/scan_runner.py    # status Literal
git diff --name-only dev..HEAD                                    # scope: MetadataPage, main.py, scan_runner, tests, dist, docs
```

Static review:
- Save/remove/apply handlers mirror the sibling try/catch/finally + busy pattern; success paths
  unchanged.
- The image fallback fires only when `image_sources` is empty (same condition as pre-refactor);
  the new test proves red→green.
- Type changes are annotation-only (no runtime change); tsc + py_compile clean.

### Deferred verification — on-device
Sideload and confirm: saving/removing metadata shows a proper error toast on failure (no silent
hang) and buttons disable while in flight; Steam-news/activity cards still show images (including
items whose art is only in the article body).

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished review-followup-fixes
```

This writes:

```text
/tmp/Decky-Metadata/review-followup-fixes_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer review-followup-fixes`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/review-followup-fixes-review-*.md
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
   scripts/orchestration/clear-finished review-followup-fixes
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
   git add docs/review/review-followup-fixes-review-*.md
   git commit -m "docs(review): record review-followup-fixes review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished review-followup-fixes
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer review-followup-fixes` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed review-followup-fixes
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize review-followup-fixes
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/review-followup-fixes_finalized
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
scripts/orchestration/finalize review-followup-fixes
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/review-followup-fixes_finished
/tmp/Decky-Metadata/review-followup-fixes_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
