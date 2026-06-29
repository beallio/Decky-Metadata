# Plan: Fix dataclass load crash (fix-dataclass-load-crash)

## Context

**The plugin backend never imports on Steam Deck / SteamOS.** On-device Decky logs for
the 1.5.0 build show a hard crash at module-import time, before any plugin code runs:

```text
File ".../Playhub Metadata/main.py", line 128, in <module>
    @dataclass(frozen=True)
AttributeError: 'NoneType' object has no attribute '__dict__'
```

Because the Python backend crashes at import, the frontend has no working backend and
**every UI control is greyed out** (this — not an empty `games` list — is the real cause of
the "greyed buttons" symptom). No `playhub-metadata.log` is produced either, because
`_install_file_logging()` runs inside `_main`, which is never reached when import fails.

**Root cause (reproduced locally).** `main.py:1` has `from __future__ import annotations`,
so every annotation is a *string*. The only dataclass in the file, `SteamInstall`
(`main.py:128`), therefore hands `dataclasses._is_type` string-form field types.
`_is_type` evaluates `sys.modules.get(cls.__module__).__dict__`. Decky's **sandboxed plugin
loader does not register the plugin module in `sys.modules`**, so `cls.__module__` resolves
to a name absent from `sys.modules`, `sys.modules.get(...)` returns `None`, and
`None.__dict__` raises the `AttributeError`. This is deterministic for any frozen/plain
dataclass defined with future-annotations under that loader. (The upstream 1.4.0 build
carries the same landmine at its own line 46 and crashes the same way on some loads.)

**Why a plain class, not just dropping the future import.** Removing
`from __future__ import annotations` happens to work on Python 3.13 (the Deck currently runs
3.13.5) but NOT on Python 3.14+, where PEP 649/749 lazy annotations hand dataclasses
string-form types again — re-introducing the same crash. A locally-verified repro confirms
a **plain class survives the `sys.modules`-absent condition on every Python version**,
whereas merely toggling the future import does not. So the fix must remove the dataclass,
not the future import. Do **not** remove or alter `from __future__ import annotations` —
other annotations across this 7,200-line module rely on it.

`SteamInstall` is a pure value container: it is constructed exactly once (`main.py:675`)
and only read via attribute access (e.g. `_detect_steam_installs`, `main.py:625`). It is
never hashed, compared for equality, put in a set, or used as a dict key, so none of the
dataclass-generated `__eq__`/`__hash__`/`frozen` behavior is actually used. Converting it to
a plain class preserves all observable behavior.

**Intended outcome:** `main.py` imports cleanly under Decky's sandbox (module not in
`sys.modules`), the backend starts, and the UI controls become live. A regression test
guards the import path. No feature/behavior change beyond making the module importable.

Relevant files:

- `main.py` — `from __future__ import annotations` (line 1); `from dataclasses import
  dataclass` (line 6); `SteamInstall` definition (line 128); sole construction site
  (line 675); read site `_detect_steam_installs` (line 625).
- `tests/` — harness already used by sibling plans (e.g. `tests/test_log_file.py`).

**Slug used throughout this plan:** `fix-dataclass-load-crash`

---

## Orchestration Contract

**Slug:** `fix-dataclass-load-crash`

**Plan file:**

```text
docs/plans/2026-06-29_fix-dataclass-load-crash.md
```

**Implementation branch:**

```text
feat/fix-dataclass-load-crash
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/fix-dataclass-load-crash_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/fix-dataclass-load-crash_finalized
```

**Review notes:**

```text
docs/review/fix-dataclass-load-crash-review-*.md
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
git checkout -b feat/fix-dataclass-load-crash
```

Commit this plan first:

```bash
git add docs/plans/2026-06-29_fix-dataclass-load-crash.md
git commit -m "docs(plan): add fix-dataclass-load-crash implementation plan"
```

---

## Implementation Tasks

Write the regression test **first** (it must fail against the current dataclass under the
simulated sandbox), then apply the fix to make it pass (TDD).

1. **Add a regression test** `tests/test_import_sandbox.py` that reproduces Decky's
   sandbox condition — executing `main.py` as a module whose `__name__` is **absent from
   `sys.modules`** — and asserts the import does not raise:

   - Read `main.py` from the repo root (`pathlib.Path(__file__).resolve().parents[1] /
     "main.py"`), `compile(...)` it, and `exec` it into a fresh namespace dict whose
     `__name__` is a value guaranteed not present in `sys.modules` (e.g.
     `"Playhub Metadata.main"`); assert that name is not already in `sys.modules` first.
   - Provide whatever lightweight module stubs the import needs so the test exercises the
     dataclass/annotation code path rather than failing on a missing dependency. At minimum
     stub `decky` (a simple module/object with a `logger` attribute that is a real
     `logging.Logger`, plus string attributes for `DECKY_PLUGIN_LOG_DIR` etc. as needed) by
     inserting it into `sys.modules` before `exec`. If `PIL` is absent the module already
     guards it (`try/except`), so no stub is required there.
   - The test passes if `exec` completes without raising `AttributeError` (specifically it
     must not raise `'NoneType' object has no attribute '__dict__'`), and
     `namespace["SteamInstall"]` is constructible:
     `namespace["SteamInstall"](root=Path("/x"), userdata_dirs=[], shortcut_files=[],
     libraryfolders_files=[], appmanifest_dirs=[])` and its attributes read back correctly.
   - Confirm this test **fails** against the unmodified `main.py` (it will raise the
     `AttributeError`), then proceeds to pass after task 2. Record the red→green evidence in
     the session log.
   - Clean up: remove any `sys.modules` entries the test inserted (the `decky` stub and the
     fake module name) in a `finally`/fixture teardown so it does not leak into other tests.

2. **Convert `SteamInstall` to a plain class** in `main.py`. Replace the
   `@dataclass(frozen=True)` definition at line 128 with a plain class that takes the same
   fields as keyword arguments and assigns them as instance attributes — preserving the
   exact field names and construction-site call (`main.py:675` uses all-keyword args):

   ```python
   class SteamInstall:
       def __init__(
           self,
           root: Path,
           userdata_dirs: list[Path],
           shortcut_files: list[Path],
           libraryfolders_files: list[Path],
           appmanifest_dirs: list[Path],
       ) -> None:
           self.root = root
           self.userdata_dirs = userdata_dirs
           self.shortcut_files = shortcut_files
           self.libraryfolders_files = libraryfolders_files
           self.appmanifest_dirs = appmanifest_dirs
   ```

   - The annotations on `__init__` parameters are fine: function-parameter annotations are
     never evaluated by `dataclasses`, and under `from __future__ import annotations` they
     are inert strings — they do not trigger the crash.
   - Do **not** add `@dataclass`, `__slots__`, `__eq__`, `__hash__`, or `frozen` emulation;
     none of that behavior is used by callers, and re-introducing the dataclass decorator
     would re-introduce the crash.
   - Remove the now-unused `from dataclasses import dataclass` import (`main.py:6`) **only
     if** no other usage remains (grep first: `grep -n "dataclass" main.py`). If anything
     else references it, leave the import. Removing an unused import keeps `tsc`/lints clean
     but is not the point of this plan — verify before deleting.
   - Do **not** touch `from __future__ import annotations` (line 1) or any other annotation
     in the module.

3. **Scope discipline:** change only `SteamInstall`'s definition (and the now-unused import,
   if applicable) plus the new test. Do not modify `_detect_steam_installs`, the
   construction site, control flow, or any feature. This is an importability fix only.

4. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9, including the
   red→green evidence for the new test.

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
# New regression test passes after the fix (and demonstrably failed before it):
uv run --with pytest -- pytest -q tests/test_import_sandbox.py
# Full quality gate: tsc + build + py_compile + full pytest suite:
scripts/orchestration/run-quality-gates
git status --short                          # clean
```

Also sanity-check the import directly under the sandbox condition:

```bash
python3 - <<'PY'
import sys, types, logging, pathlib
assert "Playhub Metadata.main" not in sys.modules
decky = types.ModuleType("decky")
decky.logger = logging.getLogger("decky")
for attr in ("DECKY_PLUGIN_LOG_DIR", "DECKY_PLUGIN_RUNTIME_DIR", "DECKY_PLUGIN_SETTINGS_DIR",
             "DECKY_PLUGIN_DIR"):
    setattr(decky, attr, "/tmp")
sys.modules["decky"] = decky
src = pathlib.Path("main.py").read_text()
ns = {"__name__": "Playhub Metadata.main"}
exec(compile(src, "main.py", "exec"), ns)   # must NOT raise
inst = ns["SteamInstall"](root=pathlib.Path("/x"), userdata_dirs=[], shortcut_files=[],
                          libraryfolders_files=[], appmanifest_dirs=[])
print("import OK; SteamInstall.root =", inst.root)
PY
```

Expected:

- `tests/test_import_sandbox.py` passes; before the fix it raised
  `AttributeError: 'NoneType' object has no attribute '__dict__'`.
- The direct sandbox exec prints `import OK; SteamInstall.root = /x` and raises nothing.
- The full quality gate passes (tsc/build/py_compile + pytest, including the new test).
  Working tree clean.

Deferred verification (record in the session log; requires hardware): rebuild the installer
ZIP from `dev` after this lands, sideload on a real Steam Deck, and confirm via the Decky
log view that the backend reaches "backend startup begin" / "backend ready" (and that a
`playhub-metadata.log` is now produced), with the plugin's UI controls live rather than
greyed. The pre-existing 1.4.0 functional gaps (store-page / community-hub / discussion /
guides redirect, Deck compatibility for non-Steam games) are **out of scope** for this plan
and are assessed separately once the backend loads.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished fix-dataclass-load-crash
```

This writes:

```text
/tmp/Playhub-Metadata-local/fix-dataclass-load-crash_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer fix-dataclass-load-crash`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/fix-dataclass-load-crash-review-*.md
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
   scripts/orchestration/clear-finished fix-dataclass-load-crash
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
   git add docs/review/fix-dataclass-load-crash-review-*.md
   git commit -m "docs(review): record fix-dataclass-load-crash review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished fix-dataclass-load-crash
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer fix-dataclass-load-crash` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed fix-dataclass-load-crash
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize fix-dataclass-load-crash
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/fix-dataclass-load-crash_finalized
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
scripts/orchestration/finalize fix-dataclass-load-crash
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/fix-dataclass-load-crash_finished
/tmp/Playhub-Metadata-local/fix-dataclass-load-crash_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
