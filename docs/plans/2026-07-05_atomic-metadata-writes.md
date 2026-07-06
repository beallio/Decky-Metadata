# Plan: Atomic writes for the metadata store (atomic-metadata-writes)

## Context

The thermo-nuclear review (`docs/reviews/2026-07-05_thermo-nuclear-fable.md`, MAJOR 7) found that
the canonical metadata store is written **non-atomically**. On a handheld that is routinely
hard-suspended and can lose power mid-write, a crash during the write truncates the user's entire
`decky_metadata.json` database.

**Verified against current code:**

1. **Non-atomic write (the defect).** `backend/storage.py:48-53` `save_data`:
   ```python
   def save_data(data_file: Path, data: dict[str, Any]) -> tuple[dict[str, Any], int]:
       data_file.write_text(
           json.dumps(data, ensure_ascii=False, indent=2),
           encoding="utf-8",
       )
       return copy.deepcopy(data), data_file.stat().st_mtime_ns
   ```
   A direct `write_text` to the live path: an interrupted write leaves a partial/truncated file that
   subsequent `load_data` cannot parse (`json.loads` raises → `load_data` returns `None` → the store
   silently reverts to `default_data()` on the next load path in `main.py`).

2. **The correct pattern already exists in-repo.** `backend/providers/delisted.py:76-84`
   `save_delisted_index` writes a temp sibling then `os.replace`:
   ```python
   target.parent.mkdir(parents=True, exist_ok=True)
   temp_path = target.with_name(f"{target.name}.tmp")
   temp_path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
   os.replace(temp_path, target)
   ```
   `os.replace` is atomic on the same filesystem, so a reader always sees either the old complete
   file or the new complete file — never a partial one.

3. **Callers/consumers (behavior to preserve).** `save_data` is called only from
   `main.py:470-472` `Plugin._save_data`, which uses the returned `(cache, mtime_ns)` tuple to seed
   `self._data_cache` / `self._data_cache_mtime_ns`. `load_data` (`backend/storage.py:21-45`)
   compares `st_mtime_ns` for its cache. The return signature and the mtime semantics must be
   preserved so the load-cache continues to work. Existing tests
   `tests/test_load_data_caching.py` and `tests/test_clear_cache.py` exercise the round-trip and
   must stay green.

**Intended outcome:** `save_data` writes via temp-file + `os.replace`, matching the delisted-index
pattern, so an interrupted write can never truncate the metadata store. The function's signature,
return tuple, mtime semantics, and JSON formatting are unchanged. This is the one intended behavior
change (durability); everything else is byte-for-byte identical output.

### Relevant files
`backend/storage.py` (`save_data` → atomic), optionally a shared `atomic_write_json` helper reused
by `delisted.py` (see Task 2 — optional, guarded), `tests/` (new atomicity regression test),
`dist/index.js` (unchanged by this plan — backend only; still rebuilt if the gate requires it),
`docs/agent_conversations/`.

**Out of scope / deferred (needs its own effort):** the review's companion suggestion to **drop the
`copy.deepcopy` on every cache hit** and collapse the `_data_cache` / `_data_cache_mtime_ns` tuple
by redefining `Plugin._data` as the single mutable authority is a broader ownership refactor with
behavioral risk — deferred to its own plan. This plan changes **only** the write path to atomic and
leaves the deepcopy/caching semantics exactly as they are.

> Source: thermo-nuclear review (2026-07-05) MAJOR 7, verified against current code by the author.

**Slug used throughout this plan:** `atomic-metadata-writes`

---

## Orchestration Contract

**Slug:** `atomic-metadata-writes`

**Plan file:**

```text
docs/plans/2026-07-05_atomic-metadata-writes.md
```

**Implementation branch:**

```text
feat/atomic-metadata-writes
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/atomic-metadata-writes_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/atomic-metadata-writes_finalized
```

**Review notes:**

```text
docs/review/atomic-metadata-writes-review-*.md
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
git checkout -b feat/atomic-metadata-writes
```

Commit this plan first:

```bash
git add docs/plans/2026-07-05_atomic-metadata-writes.md
git commit -m "docs(plan): add atomic-metadata-writes implementation plan"
```

---

## Implementation Tasks

Behavior-preserving except the intended durability change (atomic write). Follow TDD: write the
atomicity regression test first, watch it fail against the current `write_text` implementation, then
make it pass.

### Task 1 — TDD: atomicity regression test

Add `tests/test_atomic_metadata_writes.py` covering `backend.storage.save_data`:

- **Round-trip (must stay green):** `save_data(path, data)` writes the file; `path.read_text()`
  parses back to `data`; the returned tuple is `(deepcopy(data), st_mtime_ns)` — assert the returned
  mtime equals `path.stat().st_mtime_ns` and the returned dict equals `data` but is not the same
  object.
- **No leftover temp file:** after a successful `save_data`, assert no `*.tmp` sibling remains in the
  directory (`list(path.parent.glob("*.tmp")) == []`).
- **Atomicity under failure (the load-bearing assertion):** pre-write a valid JSON file with known
  content; monkeypatch `os.replace` (as seen by `backend.storage`) to raise `OSError`; call
  `save_data` and assert it raises; then assert the **original file is intact** (still parses to the
  known content, not truncated/empty). Against the current `write_text` implementation this test
  fails (the live file is already overwritten before any replace), and passes once the write goes to
  a temp file first.

Run the suite and confirm the atomicity test is **red** before Task 2.

### Task 2 — Make `save_data` atomic

Rewrite `backend/storage.py` `save_data` to mirror `delisted.save_delisted_index`:

```python
def save_data(data_file: Path, data: dict[str, Any]) -> tuple[dict[str, Any], int]:
    data_file.parent.mkdir(parents=True, exist_ok=True)
    temp_path = data_file.with_name(f"{data_file.name}.tmp")
    temp_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    os.replace(temp_path, data_file)
    return copy.deepcopy(data), data_file.stat().st_mtime_ns
```

- Add `import os` to `backend/storage.py` (currently absent).
- Preserve the exact JSON formatting (`ensure_ascii=False, indent=2`), the return tuple shape, and
  the post-replace `st_mtime_ns` read (so the load cache keeps working).
- **Optional (only if it stays trivially behavior-preserving):** factor a single
  `atomic_write_json(path, obj)` helper and have both `storage.save_data` and
  `delisted.save_delisted_index` call it. If this adds any import cycle risk or touches
  `delisted.py`'s error-logging contract, do NOT do it — keep the fix local to `storage.py` and note
  the shared-helper idea in the session log for a later pass.

Do not touch `load_data`, the deepcopy-on-hit behavior, or `Plugin._save_data` / the cache fields in
`main.py`.

### Task 3 — Gates + session log

- `./run.sh python3 -m py_compile main.py backend/*.py backend/providers/*.py`.
- `./run.sh uv run --with pytest -- pytest -q` (incl. the new atomicity test and the existing
  `test_load_data_caching` / `test_clear_cache`).
- `./run.sh npm run build`; stage `dist/` if the quality-gate script requires a fresh bundle
  (this change is backend-only, but keep `dist` consistent with the gate).
- Record `docs/agent_conversations/2026-07-05_atomic-metadata-writes.md`: the MAJOR 7 finding and
  review source, the atomic-write fix, the TDD red→green evidence, and the explicitly-deferred
  deepcopy/caching refactor.

### Scope discipline

Only the `save_data` write path. Do NOT remove the deepcopy, collapse the cache tuple, change
`load_data`, or refactor `Plugin`'s cache fields. Preserve all other behavior and output formatting.

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
./run.sh python3 -m py_compile main.py backend/*.py backend/providers/*.py
./run.sh uv run --with pytest -- pytest -q            # incl new atomicity test
./run.sh npx tsc --noEmit
scripts/orchestration/run-quality-gates
git status --short                                    # clean
```

Grep/scope gates:

```bash
# Task 2 — atomic write in place, mirroring delisted.py:
grep -n "os.replace" backend/storage.py               # present
grep -n "with_name" backend/storage.py                # temp sibling used
grep -n "^import os" backend/storage.py               # import added
grep -c "data_file.write_text" backend/storage.py     # 0 (direct live-path write gone)
# Task 1 — regression test exists and asserts intact-on-failure:
grep -n "os.replace" tests/test_atomic_metadata_writes.py   # monkeypatched failure path
git diff --name-only dev..HEAD                         # scope: storage.py, tests, (dist), docs
```

Static review:
- `save_data` writes to `<name>.tmp` then `os.replace`s onto the target; an interrupted write cannot
  truncate the live file.
- Return tuple, JSON formatting, and mtime semantics are unchanged; `load_data` and the caller's
  cache fields are untouched.
- The new test proves red (current `write_text`) → green (atomic write) for the intact-on-failure
  case, and the existing caching/clear-cache tests still pass.

### Deferred verification — on-device
Sideload, save metadata for a game, then confirm the store survives a hard power-off during heavy
use (best-effort): metadata persists and `decky_metadata.json` remains valid JSON after abrupt
suspend/resume cycles.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished atomic-metadata-writes
```

This writes:

```text
/tmp/Decky-Metadata/atomic-metadata-writes_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer atomic-metadata-writes`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/atomic-metadata-writes-review-*.md
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
   scripts/orchestration/clear-finished atomic-metadata-writes
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
   git add docs/review/atomic-metadata-writes-review-*.md
   git commit -m "docs(review): record atomic-metadata-writes review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished atomic-metadata-writes
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer atomic-metadata-writes` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed atomic-metadata-writes
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize atomic-metadata-writes
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/atomic-metadata-writes_finalized
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
scripts/orchestration/finalize atomic-metadata-writes
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/atomic-metadata-writes_finished
/tmp/Decky-Metadata/atomic-metadata-writes_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
