# Plan: Add Log Levels to Frontend Log Channel (frontend-log-levels)

## Context

**Problem.** The only channel the frontend has to write into the backend file
log (`~/homebrew/logs/Decky-Metadata/decky-metadata.log`) is the `frontend_log`
callable (`main.py:370-378`), which hard-codes every line to `logging.DEBUG`:

```python
_plog(str(area or "ui"), str(message or ""), **clean_fields, level=logging.DEBUG)
```

`_plog` emits through `decky.logger.log(level, text)` (`main.py:91-100`), and
`decky.logger` sits at `logging.INFO` whenever plugin debug logging is disabled —
the default on-device state (`main.py:321`, `main.py:334`;
`set_debug_logging` flips it between `DEBUG` and `INFO`). Records below the
logger's effective level are dropped before reaching the file handler (proven by
`tests/test_logging.py::test_plog_never_raises_and_respects_logger_level`). So
**no frontend log line is ever visible in the file log unless debug logging is
on.**

This blocks the `cold-boot-patch-install` follow-up. That plan (merged into
`dev` as `b0312e5`) added three status lines through `frontendLog` —
`steam patches installed`, `steam patches NOT installed`,
`installSteamPatches failed` — intended (Task 3.4) to be *the* signal that
distinguishes a dead-patch session from a healthy one in the default config. As
shipped they emit at DEBUG and are invisible with debug logging off, so a
cold-boot dead-patch session still looks silent. That plan's session log records
this as a known limitation and names this follow-up.

**Intended outcome.** `frontend_log` accepts an optional severity level so the
frontend can emit at `info` / `warning` / `error`, which clear the INFO gate and
reach the file log even when debug logging is off. Existing callers that omit the
level are unchanged (still DEBUG). The three cold-boot patch-status lines are
upgraded to real levels so cold-boot patch health is visible in the default
configuration.

**Design decision (settled by the repo, not open).** Extend the existing
`frontend_log` callable with a trailing optional `level` argument rather than add
a second callable — this mirrors the codebase's existing trailing-optional
callable pattern (`searchMetadata` is `[query, limit?]`, `src/backend.ts:38-41`),
keeps the ~25 existing `frontendLog` trace call sites untouched (they omit
`level` → default `debug`), and preserves the `test_frontend_log.py` contract
(default still passes `level=logging.DEBUG` into `_plog`). Do not add a new
callable and do not rename `frontend_log`.

**Prerequisite / ordering.** This plan edits the `frontendLog` call sites that
`cold-boot-patch-install` introduced in `src/steam/install.ts` and
`src/index.tsx`, so it must branch from a `dev` that already contains that merge
(it does, as of `b0312e5`). It is otherwise independent of
`gameinfo-shield-exhaustion` and `delisted-state-load-migration`.

**Relevant files:** `main.py` (`frontend_log`, the level mapping), `src/backend.ts`
(the `frontendLog` callable type), `src/steam/install.ts` and `src/index.tsx`
(the three patch-status call sites), `tests/` (new focused test file),
`dist/index.js` + `dist/index.js.map` (committed build artifacts). Read-only
reference: `main.py:91-100` (`_plog`), `tests/test_frontend_log.py`,
`tests/test_logging.py`.

**Slug used throughout this plan:** `frontend-log-levels`

---

## Orchestration Contract

**Slug:** `frontend-log-levels`

**Plan file:**

```text
docs/plans/2026-07-10_frontend-log-levels.md
```

**Implementation branch:**

```text
feat/frontend-log-levels
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/frontend-log-levels_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/frontend-log-levels_finalized
```

**Review notes:**

```text
docs/review/frontend-log-levels-review-*.md
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
git checkout -b feat/frontend-log-levels
```

Commit this plan first:

```bash
git add docs/plans/2026-07-10_frontend-log-levels.md
git commit -m "docs(plan): add frontend-log-levels implementation plan"
```

---

## Implementation Tasks

Backend + frontend. `.protocol: TDD_REQUIRED=true` — the backend behavior change
is testable, so write the failing Python tests first, then implement. Run Python
through `./run.sh`. There is no JS unit-test runner; the frontend gate is
`tsc --noEmit` + rollup build. Keep the plugin invariant: never throw into
Steam's call path (all edited frontend call sites already use the
`void frontendLog(...).catch(() => undefined)` fire-and-forget form — preserve
it).

### Task 1 — backend tests first (`tests/test_frontend_log_levels.py`)

Create a new focused test file, following the fixture/monkeypatch patterns in
`tests/test_frontend_log.py` (monkeypatch `main._plog`, local `make_plugin`) and
the `caplog` level-assertion pattern in `tests/test_logging.py`
(`test_plog_never_raises_and_respects_logger_level`,
`test_plog_exc_respects_caller_level`). Do **not** edit the existing
`tests/test_frontend_log.py` — its assertion that the default call passes
`level=logging.DEBUG` is the backward-compat contract and must keep passing
unchanged. Cover at least:

1. `frontend_log(area, message, fields, level="info")` forwards
   `level=logging.INFO` to `_plog` (monkeypatch `_plog`, capture the `level`
   kwarg), and `level="warning"` → `logging.WARNING`, `level="error"` →
   `logging.ERROR`, `level="debug"` → `logging.DEBUG`.
2. Omitting the level entirely still forwards `level=logging.DEBUG` (backward
   compat — assert explicitly here too, in the new file).
3. The level string is normalized case/space-insensitively: `" INFO "` →
   `logging.INFO`; accept `"warn"` as an alias for `logging.WARNING`.
4. An unrecognized level (`"bogus"`, `""`, `None`, a non-string) falls back to
   `logging.DEBUG` — never raises, always returns `True`.
5. End-to-end visibility with `caplog`: set `main.decky.logger` to
   `logging.INFO` (the debug-off state), then assert that a
   `level="info"` call produces a visible record at `levelno == logging.INFO`
   while a default (DEBUG) call in the same block is filtered out. Restore the
   logger level in a `finally`, exactly as `test_logging.py` does.

### Task 2 — backend: accept a level on `frontend_log` (`main.py`)

1. Add a small module-level mapping near `_plog` (e.g.
   `_FRONTEND_LOG_LEVELS`) from normalized level names to `logging` constants:
   `debug`→`DEBUG`, `info`→`INFO`, `warning`/`warn`→`WARNING`, `error`→`ERROR`.
2. Change the signature to
   `async def frontend_log(self, area="ui", message="", fields=None, level="debug")`.
   Resolve the level inside the existing `try` with
   `str(level or "").strip().lower()`, look it up in the mapping, and default to
   `logging.DEBUG` on any miss. Pass the resolved integer as the `level=` kwarg
   to `_plog` in place of the hard-coded `logging.DEBUG`. Keep the whole body
   exception-safe (the existing `try/except: pass` stays) and keep returning
   `True`.
3. Do not change `_plog`, the logger-level wiring (`set_debug_logging`), or the
   file handler. Do not touch any other backend method.

### Task 3 — frontend: thread `level` through the `frontendLog` binding (`src/backend.ts`)

Extend the `frontendLog` callable type (`src/backend.ts:34-37`) to add a
trailing optional level argument, e.g.:

```ts
export const frontendLog = callable<
  [area: string, message: string, fields?: Record<string, unknown> | null, level?: "debug" | "info" | "warning" | "error"],
  boolean
>("frontend_log");
```

Do not change the callable name (`"frontend_log"`) or the first three
parameters. Existing call sites that pass only `area, message[, fields]` must
continue to type-check unchanged.

### Task 4 — upgrade the cold-boot patch-status lines to real levels

Update exactly these four `frontendLog` call sites (added by
`cold-boot-patch-install`) to pass an explicit level as the 4th argument,
keeping their existing `area` (`"patch"`), message, and `fields` unchanged:

- `src/steam/install.ts` — `"steam patches installed"` → level `"info"`.
- `src/steam/install.ts` — `"steam patches NOT installed"` (poll exhaustion) →
  level `"warning"`.
- `src/steam/install.ts` — `"installSteamPatches failed"` (the `tick` catch) →
  level `"error"`.
- `src/index.tsx` — `"installSteamPatches failed"` (top-level catch) → level
  `"error"`.

Leave every other `frontendLog` call site in the codebase untouched (they stay
at the default `debug`). Preserve the fire-and-forget `.catch(() => undefined)`
form at all four sites.

### Task 5 — rebuild dist and commit

```bash
./run.sh npm run build
git add dist/ src/ main.py tests/
git status --short   # must be clean after the commit
```

### Task 6 — session log

Record a session summary at
`docs/agent_conversations/2026-07-10_frontend-log-levels.md` per `AGENTS.md`,
covering: why frontend lines were invisible with debug logging off (fixed-DEBUG
channel + INFO logger gate), the optional-`level` extension and its backward
compatibility, the four upgraded cold-boot status lines, and the deferred
on-device verification below.

### Scope discipline (exact allowed change list)

May change:

- `main.py` — Task 2 only (`frontend_log` + the level mapping).
- `src/backend.ts` — Task 3 only (the `frontendLog` type).
- `src/steam/install.ts`, `src/index.tsx` — Task 4 only (add the 4th `level`
  arg to the four named call sites).
- `tests/test_frontend_log_levels.py` — new file (Task 1).
- `dist/index.js`, `dist/index.js.map` — rebuild output.
- `docs/plans/2026-07-10_frontend-log-levels.md` (first commit),
  `docs/agent_conversations/` session log, committed review notes.

Must NOT change: `_plog` or the logger-level wiring in `main.py`,
`tests/test_frontend_log.py` and other existing tests' expected values,
`backend/`, any other `frontendLog` call site, `package.json` dependencies. No
new npm packages, no JS test framework, no new backend callable.

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

Automated (must pass before any round is marked complete):

```bash
./run.sh uv run --with pytest -m pytest tests/test_frontend_log_levels.py tests/test_frontend_log.py tests/test_logging.py -q
scripts/orchestration/run-quality-gates
```

The new tests are the primary proof of the backend behavior. `test_frontend_log.py`
must still pass unchanged (backward-compat contract). `run-quality-gates` also
covers `npx tsc --noEmit` and `npm run build`, which prove the four upgraded
frontend call sites and the extended `frontendLog` type compile and that `dist/`
was rebuilt.

Source-inspection checks the reviewer must confirm from the diff:

1. `frontend_log` passes a resolved integer `level` to `_plog` (not a hard-coded
   `logging.DEBUG`), defaulting to `DEBUG` on any missing/unknown value; `_plog`
   and the logger-level wiring are untouched.
2. Exactly the four named call sites gained a `level` argument
   (`installed`→info, `NOT installed`→warning, both `failed`→error); no other
   `frontendLog` call site changed.
3. `dist/index.js` reflects the four upgraded call sites.

**Deferred on-device verification (required before dev→main; performed by the
human/orchestrator on the Steam Deck, not by the implementer). This closes the
`cold-boot-patch-install` visibility gap, so it supersedes that plan's log-check
step:**

1. Install the built `dev` plugin on the Deck with plugin debug logging
   **disabled** (the default). Fully restart Steam / reboot for a cold boot.
2. Confirm `~/homebrew/logs/Decky-Metadata/decky-metadata.log` now contains the
   `steam patches installed` line at INFO for the session **even though debug
   logging is off** — i.e. the line is present without enabling debug logging.
3. Confirm the pre-existing `trace`-area `frontendLog` lines (e.g.
   `BIsModOrShortcut decision`) are still absent with debug logging off (they
   remain DEBUG — this change must not make the log noisy).
4. Force the failure path once if practical (e.g. confirm from a prior/known
   dead-patch capture, or by reasoning from the code) that
   `steam patches NOT installed` / `installSteamPatches failed` would appear at
   WARNING/ERROR with debug logging off.
5. Enable debug logging and confirm normal `trace` lines return, proving the
   default path is unchanged.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished frontend-log-levels
```

This writes:

```text
/tmp/Decky-Metadata/frontend-log-levels_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer frontend-log-levels`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/frontend-log-levels-review-*.md
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
   scripts/orchestration/clear-finished frontend-log-levels
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
   git add docs/review/frontend-log-levels-review-*.md
   git commit -m "docs(review): record frontend-log-levels review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished frontend-log-levels
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer frontend-log-levels` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed frontend-log-levels
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize frontend-log-levels
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/frontend-log-levels_finalized
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
scripts/orchestration/finalize frontend-log-levels
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/frontend-log-levels_finished
/tmp/Decky-Metadata/frontend-log-levels_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
