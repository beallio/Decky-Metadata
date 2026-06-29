# Plan: Detailed diagnostic logging for SteamOS troubleshooting (diagnostic-logging)

## Context

The plugin does not work as-is on Steam Deck / SteamOS, and the current logging is too
thin to tell us *why*. This plan adds detailed, consistently-tagged, leveled logging with
tracebacks across the critical startup and runtime paths, plus a runtime debug-verbosity
toggle, so a Deck failure can be pinpointed to a specific stage from Decky's log view. It
changes diagnostics only — no feature behavior changes.

Scope decision (from the requester): **instrument-only**. Logs go to `decky.logger`
(backend) and the browser console (frontend), read via Decky's log viewer or
`journalctl`/SSH. Do **not** add an export/download UI or a new "diagnostics bundle"
callable — only instrumentation + a verbosity toggle.

Current state (verify before relying on it):

- Backend `main.py` makes ~87 `decky.logger.*` calls, but ~59 are `error` and most are
  bare `f"... {error}"` with **no traceback** (`decky.logger.exception` is used 0 times).
  There is **no** log-level control, debug toggle, or consistent area tag. `decky.logger`
  is a standard `logging.Logger`; `import logging` is **not** present yet.
- Frontend uses scattered `console.*` (≈27 in `src/steam.ts`) with a partial
  `"[Playhub Metadata]"` prefix in `src/index.tsx`; there is **no** logger module and no
  levels.
- Reusable hooks already exist from prior plans: `get_platform_capabilities` (platform +
  steam_root + `icon_mode` + `supports_*`), the RA resolution **reason codes**
  (`no_candidate_path`, `hash_not_found`, …), the icon fallback **modes**
  (`pillow`/`no_crop`/`loopback_unavailable`/`proxy_unavailable`), and the per-patch
  install **status** tracking (installed / skipped-missing-internal / failed) from
  `steamos-ui-guards`. Log these existing signals; do not invent parallel ones.
- **Security:** the backend transmits RetroAchievements (`y=<key>` query param) and OpenXBL
  API keys. Logging must **never** emit keys/tokens/credentials — redact them before any
  URL/headers are logged.
- The test harness (`steamos-test-harness`) is available; the log helper, redaction, and
  toggle are unit-testable off-device.
- This plan file is already committed on base branch `dev`; a no-op "commit this plan
  first" is expected.

**Slug used throughout this plan:** `diagnostic-logging`

---

## Orchestration Contract

**Slug:** `diagnostic-logging`

**Plan file:**

```text
docs/plans/2026-06-29_diagnostic-logging.md
```

**Implementation branch:**

```text
feat/diagnostic-logging
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/diagnostic-logging_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/diagnostic-logging_finalized
```

**Review notes:**

```text
docs/review/diagnostic-logging-review-*.md
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
git checkout -b feat/diagnostic-logging
```

Commit this plan first:

```bash
git add docs/plans/2026-06-29_diagnostic-logging.md
git commit -m "docs(plan): add diagnostic-logging implementation plan"
```

---

## Implementation Tasks

### A. Backend logging foundation (`main.py`)

1. Add `import logging`. Introduce a small, consistent logging helper that all new/updated
   log calls use, e.g. a module-level function:
   ```python
   def _plog(area: str, message: str, *, level: int = logging.INFO, exc: bool = False, **fields: Any) -> None:
       try:
           detail = "".join(f" {k}={v!r}" for k, v in fields.items())
           text = f"[playhub:{area}] {message}{detail}"
           if exc:
               decky.logger.error(text, exc_info=True)
           else:
               decky.logger.log(level, text)
       except Exception:
           pass  # logging must never raise
   ```
   Use stable short `area` tags: `load`, `platform`, `discovery`, `shortcuts`, `http`,
   `proxy`, `icons`, `achievements`, `ra`, `xbox`. Logging must never throw.

2. **Redaction (security).** Add a helper `_redact(text: str) -> str` that masks secrets in
   any string before it is logged — at minimum RA `y=<key>` query params and OpenXBL keys /
   `Authorization` header values → replace with `***`. Route every URL/headers value through
   `_redact` before logging. Never log raw API keys, tokens, or credential settings.

3. **Runtime debug toggle.** Persist a boolean (e.g. `settings.debug_logging`, default
   `False`) in the existing settings store. Add a callable
   `async def set_debug_logging(self, enabled: bool) -> bool` that saves it and applies
   `decky.logger.setLevel(logging.DEBUG if enabled else logging.INFO)`, and expose the
   current value (extend an existing settings getter or add `get_debug_logging`). Apply the
   saved level once during plugin load. Default level is `INFO`.

### B. Instrument the critical Deck-failure paths (`main.py`)

4. **Plugin lifecycle.** In `_main` (load) log a single INFO startup line and then log the
   full `get_platform_capabilities()` result once (platform, is_steamos, steam_root,
   icon_mode, supports_*) — this one line is the highest-value diagnostic. Log unload/teardown
   start+finish. Wrap load steps so a failure logs with a traceback (`exc=True`) and the
   failing step is identifiable.

5. **Steam discovery.** In `_detect_steam_roots`/`_detect_steam_installs` log each candidate
   considered and whether it exists (DEBUG) and the final chosen roots (INFO). In the
   shortcut read path log, per `shortcuts.vdf`, the parsed count or the failure (path +
   reason, `exc=True` on parse exceptions), and the total shortcut count returned (INFO).
   A corrupt/oversized/over-depth VDF must log a WARNING with the path and the cap hit.

6. **HTTP layer.** In the request strategies (`_http_json`/`_http_text` and the
   curl/PowerShell helpers) log at DEBUG the chosen strategy + **redacted** host/URL, and at
   WARNING/ERROR each strategy failure. Keep the distinct TLS-verification-failure log from
   the security plan (ERROR). All URLs/headers pass through `_redact`.

7. **Image proxy / loopback / icons.** Log proxy start (port) at INFO and start failure with
   traceback; log the loopback-dir writability result; log the active cropper/`icon_mode`
   and any fallback (`proxy_unavailable`/`loopback_unavailable`/`no_crop`) at WARNING. Icon
   failures must remain non-fatal (already true) and be logged, not swallowed silently.

8. **RetroAchievements resolution.** Ensure every reason-code branch in
   `resolve_retroachievements_from_path` logs (INFO/DEBUG) the candidate path + reason code;
   hashing failures log with traceback.

9. Convert the **critical-path** bare `decky.logger.error(f"... {error}")` except blocks
   (load, discovery, shortcuts, http, proxy, icons, achievements/ra) to use `_plog(..., exc=True)`
   so tracebacks are captured. A broader sweep of the remaining `error` calls to add area
   tags is welcome but the critical paths above are required.

### C. Frontend logging (`src/`)

10. Add a small logger module `src/log.ts` exporting `debug/info/warn/error(area, msg, ...args)`
    that prefix `[Playhub Metadata][<area>]` and gate `debug`/`info` behind a module flag.
    Sync the flag from the backend toggle on init (call `getDebugLogging`/the settings getter;
    add a `getDebugLogging` callable in `src/backend.ts` if needed). Route the existing
    `console.*` calls in `src/steam.ts`, `src/contextMenuPatch.tsx`, `src/index.tsx`, and
    `src/components.tsx` through it.

11. **Patch lifecycle.** Log each Steam-internal patch install attempt and result using the
    per-patch status from `steamos-ui-guards`: `installed`, `skipped` (which internal was
    missing), or `failed` (with the error). Log capability load and any backend-callable
    error (area `bridge`). This is what surfaces *frontend* Deck failures (missing Steam
    internals) that the backend log can't see.

12. **Debug toggle UI.** Add a small toggle in the existing settings/diagnostics panel
    (`src/components.tsx`) wired to `set_debug_logging`, so the level can be raised on-device
    without a rebuild.

### D. Tests + docs

13. Backend tests `tests/test_logging.py` (use the harness, `main.Plugin.__new__`):
    - `_redact` masks an RA `y=<key>` URL and an OpenXBL key/Authorization value;
    - `_plog` never raises (e.g. with an un-`repr`-able field) and respects level;
    - `set_debug_logging(True/False)` flips `decky.logger` level to DEBUG/INFO.
14. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9.

Scope discipline: this is a logging/observability change. Do not alter control flow,
network behavior, parsing results, or UI features beyond adding the debug toggle and routing
logs. Logging must never change a function's return value or raise.

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
uv run --with pytest -- pytest -q tests/test_logging.py
scripts/orchestration/run-quality-gates    # tsc + build + py_compile + full pytest
git status --short                          # clean
grep -n "y=\\*\\*\\*\\|_redact" main.py | head   # redaction wired
```

Expected:

- `_redact` masks RA `y=<key>` and OpenXBL keys; no test or log emits a raw key.
- `set_debug_logging(True)` sets `decky.logger` to DEBUG and `False` back to INFO; `_plog`
  never raises.
- The full quality gate passes (tsc/build/py_compile + pytest, including the new logging
  tests); `npm run build` regenerates `dist/index.js`.
- A source scan shows the critical paths (load/discovery/shortcuts/http/proxy/icons/ra) now
  log with area tags and tracebacks on failure, and no API key is ever logged unredacted.

Deferred verification (record in the session log; **this is the whole point**, requires
hardware): on a real Steam Deck, install the plugin, enable debug logging from the settings
toggle, reproduce the failure, and read Decky's log view — confirm the logs now identify the
failing stage (plugin load, platform/`is_steamos`, Steam root/shortcut discovery,
`shortcuts.vdf` parse, an HTTP/TLS fetch, a Steam-internal patch install, image
proxy/loopback, or RA ROM resolution) with enough context (paths, counts, reason codes,
tracebacks) to act on — and that no API keys appear in the logs.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished diagnostic-logging
```

This writes:

```text
/tmp/Playhub-Metadata-local/diagnostic-logging_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer diagnostic-logging`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/diagnostic-logging-review-*.md
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
   scripts/orchestration/clear-finished diagnostic-logging
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
   git add docs/review/diagnostic-logging-review-*.md
   git commit -m "docs(review): record diagnostic-logging review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished diagnostic-logging
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer diagnostic-logging` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed diagnostic-logging
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize diagnostic-logging
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/diagnostic-logging_finalized
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
scripts/orchestration/finalize diagnostic-logging
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/diagnostic-logging_finished
/tmp/Playhub-Metadata-local/diagnostic-logging_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
