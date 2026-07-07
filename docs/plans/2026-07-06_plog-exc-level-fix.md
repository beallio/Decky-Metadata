# Plan: Fix _plog Silently Escalating WARNING to ERROR When exc=True (plog-exc-level-fix)

## Context

**Problem.** `_plog` in `main.py` (lines 90-99) accepts a `level` argument, but when
`exc=True` it unconditionally calls `decky.logger.error(text, exc_info=True)`,
ignoring `level` entirely:

```python
if exc:
    decky.logger.error(text, exc_info=True)
else:
    decky.logger.log(level, text)
```

Two call sites in `backend/providers/steam.py` intentionally pass
`level=logging.WARNING, exc=True` for expected/recoverable failures and are being
silently escalated to ERROR:

- `steam_deck_compat_for_appid`, lines 296-302 — "deck compat fetch failed" (routine
  for apps with no published Deck Verified rating; confirmed on-device as spurious
  ERROR-with-traceback for `steam_appid='224060'` on 11 occurrences across three days).
- `steam_appdetails_for_appid`, lines 425-431 — "appdetails fetch failed".

**Intended outcome.** `_plog(..., level=logging.WARNING, exc=True)` emits a
WARNING-level record with the traceback attached. Callers that explicitly pass
`level=logging.ERROR, exc=True` — `main.py:261` (backend startup failed) and
`main.py:1200` (failed reading Steam shortcuts) — must continue to emit ERROR.

**Scope.** Backend-only, Python-only. The fix is a single line in `_plog` in
`main.py`. Do **not** modify the call sites in `backend/providers/steam.py` — they
already pass the correct arguments. No frontend/`src` changes, no `dist` rebuild.

**Relevant files:**

- `main.py` — `_plog` at lines 90-99 (the fix); `exc=True` call sites at 261 and 1200 (must not regress).
- `backend/providers/steam.py` — WARNING-intent call sites at ~296-302 and ~425-431 (read-only reference; do not edit).
- `tests/test_logging.py` — existing `_plog` tests to extend (uses `caplog` against `main.decky.logger`).

**Slug used throughout this plan:** `plog-exc-level-fix`

---

## Orchestration Contract

**Slug:** `plog-exc-level-fix`

**Plan file:**

```text
docs/plans/2026-07-06_plog-exc-level-fix.md
```

**Implementation branch:**

```text
feat/plog-exc-level-fix
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/plog-exc-level-fix_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/plog-exc-level-fix_finalized
```

**Review notes:**

```text
docs/review/plog-exc-level-fix-review-*.md
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
git checkout -b feat/plog-exc-level-fix
```

Commit this plan first:

```bash
git add docs/plans/2026-07-06_plog-exc-level-fix.md
git commit -m "docs(plan): add plog-exc-level-fix implementation plan"
```

---

## Implementation Tasks

Work TDD: write the failing test first (Task 1), see it fail, then apply the fix
(Task 2), then see it pass.

### Task 1: Add failing test for `exc=True` level handling

Extend `tests/test_logging.py` (do not create a new test file). Follow the existing
pattern in `test_plog_never_raises_and_respects_logger_level`: use `caplog` with
`caplog.set_level(logging.DEBUG, logger=main.decky.logger.name)` and call
`main._plog(...)` directly, then assert on `caplog.records`.

Add one new test, `test_plog_exc_respects_caller_level`, that raises a real
exception so `exc_info=True` has an active exception to capture, e.g.:

```python
def test_plog_exc_respects_caller_level(caplog) -> None:
    logger = main.decky.logger
    caplog.set_level(logging.DEBUG, logger=logger.name)

    try:
        raise ValueError("boom-warning")
    except ValueError:
        main._plog("steam", "deck compat fetch failed", level=logging.WARNING, exc=True)

    try:
        raise ValueError("boom-error")
    except ValueError:
        main._plog("load", "backend startup failed", level=logging.ERROR, exc=True)

    warning_records = [r for r in caplog.records if "deck compat fetch failed" in r.getMessage()]
    assert len(warning_records) == 1
    assert warning_records[0].levelno == logging.WARNING
    assert warning_records[0].exc_info is not None  # traceback still attached

    error_records = [r for r in caplog.records if "backend startup failed" in r.getMessage()]
    assert len(error_records) == 1
    assert error_records[0].levelno == logging.ERROR
    assert error_records[0].exc_info is not None
```

This covers:

- (a) `level=logging.WARNING, exc=True` → WARNING record with `exc_info` attached (the bug; currently fails because the record is ERROR);
- (b) `level=logging.ERROR, exc=True` → still ERROR with `exc_info` (regression guard for `main.py:261` and `main.py:1200`).

Coverage (c) — the `exc=False` path (`level=logging.DEBUG` suppressed below the
logger threshold, INFO emitted) — is already provided by the existing
`test_plog_never_raises_and_respects_logger_level`; leave that test unchanged and
confirm it still passes.

Run the new test and confirm it fails on the WARNING assertion before proceeding:

```bash
pytest tests/test_logging.py -q
```

Commit the failing test only after Task 2 makes it pass (single atomic commit for
test + fix is acceptable per repo convention, or test-first in its own commit if
the quality gates allow a red intermediate state — prefer one commit containing
both test and fix so every commit is green).

### Task 2: Fix `_plog` to respect `level` when `exc=True`

In `main.py`, `_plog` (lines 90-99), change only the `exc` branch:

```python
if exc:
    decky.logger.error(text, exc_info=True)
```

becomes:

```python
if exc:
    decky.logger.log(level, text, exc_info=True)
```

Do not change `_plog`'s signature, the `try/except Exception: pass` wrapper, the
redaction/formatting logic, or the `else` branch. Do not touch any call sites.

Run the full suite:

```bash
pytest -q
```

Commit test + fix together, e.g.:

```text
fix(logging): _plog respects caller level when exc=True
```

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

1. `pytest tests/test_logging.py -q` — new test `test_plog_exc_respects_caller_level`
   passes; existing `_plog` tests unchanged and green.
2. `pytest -q` — full suite green (pure Python change; no build/dist step needed).
3. `git diff dev --stat` — confirm the only source changes are `main.py` and
   `tests/test_logging.py` (plus this plan and any committed review notes). No
   changes under `src/`, `dist/`, or `backend/providers/steam.py`.
4. Spot-check `main.py:261` and `main.py:1200` still pass `level=logging.ERROR, exc=True`
   (unchanged) — the regression-guard assertion in the new test covers their behavior.

**Deferred verification (on-device, not part of this round):** after the next
deploy to the Steam Deck, confirm in the plugin log that
`[decky:steam] deck compat fetch failed steam_appid='224060'` now appears at
WARNING (with traceback) instead of ERROR. This is observation-only and does not
block finalization.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished plog-exc-level-fix
```

This writes:

```text
/tmp/Decky-Metadata/plog-exc-level-fix_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer plog-exc-level-fix`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/plog-exc-level-fix-review-*.md
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
   scripts/orchestration/clear-finished plog-exc-level-fix
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
   git add docs/review/plog-exc-level-fix-review-*.md
   git commit -m "docs(review): record plog-exc-level-fix review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished plog-exc-level-fix
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer plog-exc-level-fix` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed plog-exc-level-fix
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize plog-exc-level-fix
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/plog-exc-level-fix_finalized
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
scripts/orchestration/finalize plog-exc-level-fix
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/plog-exc-level-fix_finished
/tmp/Decky-Metadata/plog-exc-level-fix_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
