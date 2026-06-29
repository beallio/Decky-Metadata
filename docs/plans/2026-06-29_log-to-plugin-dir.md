# Plan: Persist logs to the Decky plugin log directory (log-to-plugin-dir)

## Context

The plugin now emits detailed structured logs via `decky.logger`, but they are **not
persisted to a file in the plugin's own log directory** — there is no `FileHandler`
anywhere (`decky.logger` only has its level set), so on a Steam Deck the logs are hard to
retrieve. This plan adds a rotating file handler that writes the plugin's logs to a file in
the Decky **plugin log directory**, so a Deck user can pull a single log file to diagnose
issues (e.g. the greyed-buttons / empty-`games` problem). It is observability plumbing only
— no behavior change.

Key facts (verify before relying on them):

- `decky.logger` is a standard `logging.Logger`; `import logging` is already present. The
  per-plugin log directory is `decky.DECKY_PLUGIN_LOG_DIR` (Decky also exposes
  `DECKY_PLUGIN_RUNTIME_DIR` / `DECKY_PLUGIN_DIR` / `DECKY_PLUGIN_SETTINGS_DIR`). Access via
  `getattr(decky, "DECKY_PLUGIN_LOG_DIR", None)` with a fallback chain, because not all
  Decky builds expose every attribute (this is the same defensiveness used at main.py:274,
  and the opposite of the unguarded main.py:265).
- The debug-verbosity toggle already flips `decky.logger` to DEBUG/INFO via
  `_apply_debug_logging()` (main.py:788); `set_debug_logging` / `get_debug_logging` exist.
- `_main` (main.py:294) is the async startup; `__init__` (main.py:264) runs before it.
- The test harness (`steamos-test-harness`) is available for unit-testing the installer.
- This plan file is already committed on base branch `dev`; a no-op "commit this plan
  first" is expected.

**Slug used throughout this plan:** `log-to-plugin-dir`

---

## Orchestration Contract

**Slug:** `log-to-plugin-dir`

**Plan file:**

```text
docs/plans/2026-06-29_log-to-plugin-dir.md
```

**Implementation branch:**

```text
feat/log-to-plugin-dir
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/log-to-plugin-dir_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/log-to-plugin-dir_finalized
```

**Review notes:**

```text
docs/review/log-to-plugin-dir-review-*.md
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
git checkout -b feat/log-to-plugin-dir
```

Commit this plan first:

```bash
git add docs/plans/2026-06-29_log-to-plugin-dir.md
git commit -m "docs(plan): add log-to-plugin-dir implementation plan"
```

---

## Implementation Tasks

1. **Add a rotating file-handler installer** in `main.py`, e.g. a module-level function:
   ```python
   _LOG_FILE_HANDLER: logging.Handler | None = None

   def _resolve_log_dir() -> Path | None:
       for attr in ("DECKY_PLUGIN_LOG_DIR", "DECKY_PLUGIN_RUNTIME_DIR", "DECKY_PLUGIN_SETTINGS_DIR"):
           value = getattr(decky, attr, None)
           if value:
               return Path(str(value))
       return None

   def _install_file_logging() -> str:
       global _LOG_FILE_HANDLER
       try:
           if _LOG_FILE_HANDLER is not None:
               return getattr(_LOG_FILE_HANDLER, "baseFilename", "")
           log_dir = _resolve_log_dir()
           if log_dir is None:
               return ""
           log_dir.mkdir(parents=True, exist_ok=True)
           log_path = log_dir / "playhub-metadata.log"
           from logging.handlers import RotatingFileHandler
           handler = RotatingFileHandler(log_path, maxBytes=2 * 1024 * 1024, backupCount=3, encoding="utf-8")
           handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
           handler.setLevel(logging.DEBUG)  # file captures full detail; logger level still gates emission
           decky.logger.addHandler(handler)
           _LOG_FILE_HANDLER = handler
           return str(log_path)
       except Exception:
           return ""  # logging setup must never break the plugin
   ```
   Requirements: **idempotent** (never add a second handler on reload — guard with the
   module global or by checking existing handlers), **never raises**, and uses a
   size-bounded `RotatingFileHandler` (≈2 MiB × 3 backups) so the log can't grow unbounded.

2. **Install it as early as possible** so startup logs are captured. Call
   `_install_file_logging()` at the very start of `_main` — before the existing
   `_plog("load", "backend startup begin")` — and log the resolved path once, e.g.
   `_plog("load", "file logging enabled", path=<resolved or "unavailable">)`. (Installing in
   `__init__` would capture even earlier, but `__init__` is out of scope here; `_main` start
   is sufficient.)

3. **Respect the verbosity toggle.** Keep `decky.logger.setLevel(...)` as the gate (the file
   handler is set to DEBUG so it records whatever the logger emits). Do not change
   `_apply_debug_logging` / `set_debug_logging` behavior other than ensuring the file handler
   is installed (it can be installed once at load; the toggle continues to control level).

4. **No secrets in the file.** The existing `_redact` already masks API keys before logging;
   do not add any new log line that bypasses it. The file handler must not introduce
   un-redacted content (it only formats records already produced via `_plog`/`decky.logger`).

5. **Tests** `tests/test_log_file.py` (use the harness, monkeypatching the `decky` stub):
   - with `decky.DECKY_PLUGIN_LOG_DIR` set to a `tmp_path`, `_install_file_logging()` returns
     the `playhub-metadata.log` path, creates the file, and a subsequent `decky.logger`
     emission is written to it;
   - it is **idempotent** — calling it twice does not add a second handler to `decky.logger`;
   - when no log-dir attribute resolves (all unset) it returns `""` and does not raise;
   - when the directory cannot be created/written it returns `""` and does not raise.
   Reset/remove the handler between tests to avoid cross-test handler leakage.

6. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9.

Scope discipline: observability only. Do not change control flow, the discovery/greyed-UI
behavior, or any feature. The file handler must never raise or alter return values.

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
uv run --with pytest -- pytest -q tests/test_log_file.py
scripts/orchestration/run-quality-gates    # tsc + build + py_compile + full pytest
git status --short                          # clean
```

Expected:

- With `DECKY_PLUGIN_LOG_DIR` pointed at a temp dir, `_install_file_logging()` creates
  `playhub-metadata.log`, attaches a single `RotatingFileHandler` to `decky.logger`, and
  log records land in the file; a second call adds no further handler.
- With no log-dir attribute it returns `""` and does not raise; an unwritable dir likewise.
- The full quality gate passes (tsc/build/py_compile + pytest including the new file-logging
  tests). Tree clean.

Deferred verification (record in the session log; requires hardware): on a real Steam Deck,
after launching the plugin, confirm a `playhub-metadata.log` appears under the plugin's Decky
log directory and contains the `[playhub:load]` / `[playhub:shortcuts]` lines (with the
debug toggle on), and that no API key appears in the file.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished log-to-plugin-dir
```

This writes:

```text
/tmp/Playhub-Metadata-local/log-to-plugin-dir_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer log-to-plugin-dir`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/log-to-plugin-dir-review-*.md
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
   scripts/orchestration/clear-finished log-to-plugin-dir
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
   git add docs/review/log-to-plugin-dir-review-*.md
   git commit -m "docs(review): record log-to-plugin-dir review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished log-to-plugin-dir
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer log-to-plugin-dir` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed log-to-plugin-dir
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize log-to-plugin-dir
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/log-to-plugin-dir_finalized
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
scripts/orchestration/finalize log-to-plugin-dir
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/log-to-plugin-dir_finished
/tmp/Playhub-Metadata-local/log-to-plugin-dir_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
