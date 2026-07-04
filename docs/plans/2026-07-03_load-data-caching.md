# Plan: Cache backend data instead of re-reading JSON per call (load-data-caching)

## Context

`Plugin._load_data()` is called at **13 sites** and its body does
`json.loads(self._data_file.read_text(...))` **every call** with no caching — including during
~800ms scan-progress polling. This re-reads and re-parses the settings/metadata JSON dozens of
times per minute.

**Intended outcome:** cache the parsed data with an **mtime check**, reloading only when the file
changed on disk; the save path keeps the cache fresh. **Behavior-preserving.**

### Relevant files
`main.py`, `tests/`.

> Source: thermo-nuclear code-quality review (2026-07-03), findings corroborated by two independent reviewers (codex gpt-5.5 + agy) and verified against the code by the orchestrator.


**Slug used throughout this plan:** `load-data-caching`

---

## Orchestration Contract

**Slug:** `load-data-caching`

**Plan file:**

```text
docs/plans/2026-07-03_load-data-caching.md
```

**Implementation branch:**

```text
feat/load-data-caching
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/load-data-caching_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/load-data-caching_finalized
```

**Review notes:**

```text
docs/review/load-data-caching-review-*.md
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
git checkout -b feat/load-data-caching
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_load-data-caching.md
git commit -m "docs(plan): add load-data-caching implementation plan"
```

---

## Implementation Tasks

1. Add an mtime-guarded cache to `_load_data`: remember the last-seen file mtime and the
   parsed data; if the file's mtime is unchanged since the last load, return the cached data
   without re-reading/parsing. Preserve the current default-merge semantics exactly.
2. Ensure `_save_data` updates the in-memory data and the cached mtime so a save is immediately
   reflected (no stale reload).
3. Keep behavior identical for the "file changed externally" case (reload on mtime bump).
4. **TDD:** add tests — (a) repeated `_load_data` with an unchanged file parses the file **once**
   (monkeypatch/count `read_text`); (b) an external mtime bump triggers a reload; (c) save-then-load
   returns the saved data. Full pytest green.

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

```bash
./run.sh uv run --with pytest -- pytest -q      # incl new caching tests
./run.sh python3 -m py_compile main.py
scripts/orchestration/run-quality-gates
git status --short
```
- New tests prove single-parse on unchanged file and correct reload on change.
- All existing tests still pass (no semantic change to loaded data).


---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished load-data-caching
```

This writes:

```text
/tmp/Decky-Metadata/load-data-caching_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer load-data-caching`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/load-data-caching-review-*.md
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
   scripts/orchestration/clear-finished load-data-caching
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
   git add docs/review/load-data-caching-review-*.md
   git commit -m "docs(review): record load-data-caching review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished load-data-caching
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer load-data-caching` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed load-data-caching
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize load-data-caching
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/load-data-caching_finalized
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
scripts/orchestration/finalize load-data-caching
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/load-data-caching_finished
/tmp/Decky-Metadata/load-data-caching_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
