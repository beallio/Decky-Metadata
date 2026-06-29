# Plan: SteamOS: Python test harness and pytest gate (steamos-test-harness)

## Context

The SteamOS-native work (platform capabilities, Steam-root/shortcut discovery, Linux
launch parsing, Xbox gating, icon fallback) is mostly pure backend logic in `main.py`
that must be unit-tested before it ships to real Steam Deck hardware. Today that is
impossible: `main.py` does an unconditional `import decky` at line 27, so the module
cannot be imported off-device, and the repo has no Python test runner at all.

This plan establishes a Python test harness so every later SteamOS backend plan can be
test-driven, and wires it into the quality gate so those tests are enforced. It changes
no product behavior in `main.py`.

Key facts about this repo (verify before relying on them):

- `main.py` is a single-file Decky backend (~7000 lines), not a package. Its only
  import-time external dependency is `import decky` (line 27); everything else is the
  Python standard library plus an optional `from PIL import Image` already wrapped in
  `try/except`.
- `uv` is installed and available; `pytest` is **not** installed. Use
  `uv run --with pytest` so pytest runs in an ephemeral, cache-isolated environment
  without adding a `pyproject.toml` or polluting the repo.
- **Supply-chain cooldown policy (do not bypass).** The user's `~/.config/uv/uv.toml`
  sets `exclude-newer = "7 days"`; `uv run --with pytest` honors it automatically. Do
  **not** pass `--exclude-newer`, edit uv config, or otherwise override the cooldown. For
  Node, only ever use `npm ci` / `pnpm install --frozen-lockfile` (lockfile-exact); never
  run an unpinned `npm install`/`npm install <pkg>@latest`, and add no new npm dependency.
- Caches must stay under `/tmp/Playhub-Metadata-local` per `AGENTS.md` and `run.sh`.
- This plan file is already committed on the base branch `dev`. If the Setup
  "commit this plan first" step finds nothing to commit, that is expected — continue.

**Slug used throughout this plan:** `steamos-test-harness`

---

## Orchestration Contract

**Slug:** `steamos-test-harness`

**Plan file:**

```text
docs/plans/2026-06-28_steamos-test-harness.md
```

**Implementation branch:**

```text
feat/steamos-test-harness
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/steamos-test-harness_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/steamos-test-harness_finalized
```

**Review notes:**

```text
docs/review/steamos-test-harness-review-*.md
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
git checkout -b feat/steamos-test-harness
```

Commit this plan first:

```bash
git add docs/plans/2026-06-28_steamos-test-harness.md
git commit -m "docs(plan): add steamos-test-harness implementation plan"
```

---

## Implementation Tasks

Do not change any runtime behavior in `main.py`. The only edit to `main.py` allowed in
this plan is making the `decky` import import-safe (task 1), and only if you choose the
import-guard approach over the pure-conftest stub. Prefer the conftest stub.

1. **Make `main.py` importable without the Decky runtime, without changing behavior.**
   Create `tests/conftest.py` that, *before* importing `main`, installs a fake `decky`
   module into `sys.modules` so `import decky` succeeds off-device. The fake must expose
   at minimum `logger` (a real `logging.Logger`) and tolerate arbitrary attribute access
   (implement a module-like object with `__getattr__` returning a no-op/`Mock`). Also
   insert the repository root onto `sys.path` so `import main` resolves. Do **not** edit
   the `import decky` line in `main.py` if this stub is sufficient (it is, because
   `decky` is only used at call time, not import time).

2. **Add a pytest configuration** at the repo root as `pytest.ini` (do not introduce a
   `pyproject.toml`; this is not a uv-managed project). It must set:
   - `testpaths = tests`
   - `cache_dir = /tmp/Playhub-Metadata-local/.pytest_cache`
   - quiet, no coverage requirement.

3. **Add a smoke test** `tests/test_import_smoke.py` that asserts `import main` succeeds
   and that `main.Plugin` exists and is a class. This proves the stub works and guards
   against future import-time regressions.

4. **Add a shared test helper** `tests/_plugin.py` (or a `conftest` fixture named
   `plugin`) that constructs a `main.Plugin` instance suitable for exercising pure
   helper methods, without running Decky's async `_main`. Use
   `plugin = main.Plugin.__new__(main.Plugin)` and set only the attributes the helpers
   under test read (later plans will document which). Document this pattern in a comment
   so later plans reuse it.

5. **Wire pytest into the quality gate.** Edit `scripts/orchestration-hooks/quality-gates`
   to run the Python tests after the existing tsc/build/py_compile steps, only when a
   `tests/` directory exists. Use:
   ```bash
   if [[ -d tests ]]; then
     export UV_CACHE_DIR="/tmp/Playhub-Metadata-local/.uv"
     mkdir -p "$UV_CACHE_DIR"
     uv run --with pytest -- pytest -q
   fi
   ```
   Keep the existing steps and the final `echo "quality-gates: OK"`.

6. **Update governance docs to match reality.** In `AGENTS.md` §6, add the pytest
   command to the quality-gate list. In `.protocol`, set `TDD_REQUIRED=true`. In
   `scripts/check_tdd.sh`, after the existing staged tsc/py_compile checks, add a step
   that runs `uv run --with pytest -- pytest -q` when `tests/` exists and any staged file
   matches `^main\.py$` or `^tests/`. Keep all existing behavior and the clean-skip
   guards.

7. **Gitignore** the test cache: ensure `.pytest_cache/` is ignored (the active cache is
   redirected to /tmp, but guard against a stray local one).

8. Record a session summary under `docs/agent_conversations/` per `AGENTS.md` §9.

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

Run, and confirm each passes:

```bash
export UV_CACHE_DIR=/tmp/Playhub-Metadata-local/.uv
uv run --with pytest -- pytest -q          # smoke test green; main imports
scripts/orchestration/run-quality-gates    # tsc + build + py_compile + pytest all pass
git status --short                         # clean
```

Expected:

- `pytest -q` collects and passes `tests/test_import_smoke.py`.
- The quality gate ends with `quality-gates: OK` and a non-zero pytest run (not "no
  tests ran").
- No caches or `.venv` are created inside the repository.

Deferred verification: none. This plan is tooling-only and fully verifiable in CI/local;
no on-device testing is required.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished steamos-test-harness
```

This writes:

```text
/tmp/Playhub-Metadata-local/steamos-test-harness_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer steamos-test-harness`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/steamos-test-harness-review-*.md
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
   scripts/orchestration/clear-finished steamos-test-harness
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
   git add docs/review/steamos-test-harness-review-*.md
   git commit -m "docs(review): record steamos-test-harness review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished steamos-test-harness
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer steamos-test-harness` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed steamos-test-harness
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize steamos-test-harness
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/steamos-test-harness_finalized
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
scripts/orchestration/finalize steamos-test-harness
```

Do not manually merge into `main` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/steamos-test-harness_finished
/tmp/Playhub-Metadata-local/steamos-test-harness_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
