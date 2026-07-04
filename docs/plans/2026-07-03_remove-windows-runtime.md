# Plan: Remove Windows runtime support from the backend (remove-windows-runtime)

## Context

Decky Metadata is a Decky Loader plugin, and Decky Loader runs only on Linux/SteamOS. The
backend (`main.py`) still carries Windows-only runtime code inherited from the upstream fork:
a PowerShell HTTP fallback, Windows Steam-path discovery via `winreg`, `PROGRAMFILES`/
`LOCALAPPDATA` userdata roots, `os.name == "nt"` branches, and an `is_windows` platform
capability. None of it can execute under Decky; it is dead weight and misleading. This plan
removes it so the backend is unambiguously Linux/SteamOS-only.

This is the runtime counterpart to the docs/packaging cleanup in
`docs/plans/2026-07-03_debrand-authorship.md` (which removed Windows *packaging*). Run this
**after** that plan lands.

**Intended outcome:** no Windows-only code paths remain in `main.py`; the `is_windows`
capability and its TS type are gone; Linux/SteamOS behavior is unchanged; the test suite is
updated to match and stays green.

### Precise inventory (surveyed — locate by symbol, not line)

**Delete (dead — defined, zero callers):**
- `Plugin._windows_powershell_executable` (static)
- `Plugin._http_text_powershell` (the alternate `_http_text_urllib` / `_http_text_curl` are
  cross-platform — **keep** those; only the PowerShell one goes)
- `Plugin._hidden_subprocess_kwargs` (static; Windows `CREATE_NO_WINDOW` helper, no callers) —
  confirm zero callers, then delete

**Delete (live, but Windows-only):**
- `Plugin._read_windows_steam_path` — remove the method **and** its two call sites (inside the
  `os.name == "nt"` branches of `_detect_steam_roots` and `_steam_userdata_roots`)

**Collapse `os.name == "nt"` branches to the Linux path:**
- `_detect_steam_roots`: delete the `if os.name == "nt":` block (Windows steam path +
  `PROGRAMFILES(X86)`/`PROGRAMFILES`). Keep all Linux candidate logic.
- `_detect_steam_roots` dedupe key: `key = str(resolved).casefold() if os.name == "nt" else str(resolved)` → `key = str(resolved)`.
- `_steam_userdata_roots`: delete the `if os.name == "nt":` branch entirely; keep the `else`
  (Linux `_detect_steam_roots`-derived) branch as the sole path.
- `_steam_userdata_roots` dedupe key: same casefold simplification → `str(resolved)`.

**Platform capabilities + frontend:**
- `get_platform_capabilities`: remove the `"is_windows"` key. Leave `"os_name"`, `"is_linux"`,
  `"is_steamos"`, etc. intact.
- `src/types.ts`: remove the `is_windows: boolean;` field from the platform-capabilities
  interface. (It is the **only** consumer — no runtime code reads it.)

**Keep — explicitly do NOT touch (not platform gating):**
- The `Mozilla/5.0 (Windows NT 10.0; …)` **User-Agent strings** in `_http_text`,
  `_http_json`, `_http_request_headers`, and `_graphql`. These are browser-UA spoofing to
  avoid bot blocking; changing them risks breaking metadata fetches.
- `tests/fixtures/shortcuts/windows.json` and the `("windows", …)` case in
  `tests/test_shortcuts_vdf.py`: these test that the VDF parser normalizes a `C:\`-style
  shortcut entry (parser robustness for imported shortcuts), not Windows runtime. Leave them.
- The remaining `os.name`-independent helpers and all Linux/SteamOS logic.

### Relevant files

`main.py` (removals/collapses), `src/types.ts` (drop `is_windows`),
`tests/test_platform_capabilities.py` (update expected keys + drop the removed monkeypatch),
`dist/index.js` (rebuilt because `src/` changes), `docs/agent_conversations/`.

**Test infra note:** backend is pytest-covered (in the gate); frontend gate is `tsc` + rollup
build. Because `src/types.ts` changes, this plan **does** rebuild `dist/`.

**Slug used throughout this plan:** `remove-windows-runtime`

---

## Orchestration Contract

**Slug:** `remove-windows-runtime`

**Plan file:**

```text
docs/plans/2026-07-03_remove-windows-runtime.md
```

**Implementation branch:**

```text
feat/remove-windows-runtime
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/remove-windows-runtime_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/remove-windows-runtime_finalized
```

**Review notes:**

```text
docs/review/remove-windows-runtime-review-*.md
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
git checkout -b feat/remove-windows-runtime
```

Commit this plan first:

```bash
git add docs/plans/2026-07-03_remove-windows-runtime.md
git commit -m "docs(plan): add remove-windows-runtime implementation plan"
```

---

## Implementation Tasks

Work in order via `./run.sh`. Follow TDD: update the pytest expectations first (red), then
make `main.py` match (green). Locate all code by symbol, not absolute line number.

### Task 1 — Tests first (pytest expectations)

- `tests/test_platform_capabilities.py`:
  - In `test_get_platform_capabilities_returns_required_keys_and_types`, remove `"is_windows"`
    from the `expected_keys` set (and any per-key type assertion for it).
  - In the `_detect_steam_roots` test, remove the line
    `monkeypatch.setattr(plugin, "_read_windows_steam_path", lambda: compat)` — the method is
    being deleted. The test must still pass on the Linux path: `compat` is already provided via
    the `STEAM_COMPAT_CLIENT_INSTALL_PATH` env, so the asserted root ordering is unchanged.
    Confirm the assertion still expects `[compat, local, dot_root, flatpak]` resolved.
- Do **not** modify `tests/test_shortcuts_vdf.py` or `tests/fixtures/shortcuts/windows.json`
  (parser-robustness cases — keep).
- Run pytest and confirm the platform-capabilities test now **fails** against current
  `main.py` (proves the expectation drives the change), then proceed.

### Task 2 — Remove dead Windows helpers (`main.py`)

Confirm zero callers with a grep, then delete these methods entirely:
- `_windows_powershell_executable`
- `_http_text_powershell`
- `_hidden_subprocess_kwargs`

Keep `_http_text`, `_http_text_urllib`, `_http_text_curl` (cross-platform). If removing a
method leaves an orphaned blank line or double blank, tidy to match surrounding style.

### Task 3 — Collapse live `os.name == "nt"` branches (`main.py`)

- `_detect_steam_roots`: delete the whole `if os.name == "nt":` block (the
  `_read_windows_steam_path()` append and the `PROGRAMFILES(X86)`/`PROGRAMFILES` loop). Keep
  every Linux candidate (`/run/media` globs, compat/local/dot_root/flatpak, etc.).
- In the same method, simplify the dedupe key
  `key = str(resolved).casefold() if os.name == "nt" else str(resolved)` to
  `key = str(resolved)`.
- `_steam_userdata_roots`: replace the `if os.name == "nt": … else: candidates = [...]`
  construct with just the Linux assignment
  `candidates = [root / "userdata" for root in self._detect_steam_roots()]`. Simplify that
  method's dedupe key the same way (`key = str(resolved)`).
- Delete the now-unused `_read_windows_steam_path` method.
- Verify no `os.name == "nt"` / `!= "nt"` remains in `main.py` **except** neutral informational
  use (`"os_name": str(os.name)` is fine — it just reports the name). If any `nt` conditional
  remains, it must be dead-neutralized to the Linux path.

### Task 4 — Platform capabilities + TS type

- `get_platform_capabilities` in `main.py`: remove the `"is_windows": os.name == "nt",` entry
  from the returned dict. Leave the other keys and their order otherwise intact.
- `src/types.ts`: remove the `is_windows: boolean;` field from the platform-capabilities
  interface. Confirm (grep) nothing else in `src/` references `is_windows`.

### Task 5 — Rebuild bundle + gates + session log

- `./run.sh npx tsc --noEmit` (clean), `./run.sh npm run build`, stage `dist/`.
- `./run.sh uv run --with pytest -- pytest -q` — full suite green (including the updated
  platform-capabilities test).
- Record `docs/agent_conversations/2026-07-03_remove-windows-runtime.md`: what was removed
  (dead PowerShell/winreg helpers, `os.name=="nt"` branches, `is_windows`), what was
  deliberately kept (browser-UA spoof strings, the Windows shortcut-parser fixture), and the
  TDD red→green evidence.

### Scope discipline

Backend Windows-runtime removal + the single `is_windows` TS field only. Do NOT change the
UA strings, the shortcut VDF parser or its fixtures, Linux/SteamOS behavior, unrelated
capabilities, or anything under `docs/`. Do NOT alter the scan/metadata logic. Preserve all
Linux behavior exactly.

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

Automated (run via `./run.sh`):

```bash
./run.sh python3 -m py_compile main.py            # backend byte-compiles
./run.sh npx tsc --noEmit                          # no type errors after dropping is_windows
./run.sh npm run build                             # dist/index.js regenerated
./run.sh uv run --with pytest -- pytest -q          # full suite green
scripts/orchestration/run-quality-gates
git status --short                                  # clean (dist restaged)
```

Grep/scope gates:

```bash
# Windows runtime code gone:
grep -nE '_windows_powershell_executable|_http_text_powershell|_hidden_subprocess_kwargs|_read_windows_steam_path' main.py   # expect NONE
grep -nE 'os\.name *(==|!=) *"nt"|winreg|PROGRAMFILES' main.py           # expect NONE
grep -n '"is_windows"' main.py                                           # expect NONE
grep -n 'is_windows' src/types.ts                                        # expect NONE
grep -rn 'is_windows' src/                                               # expect NONE

# Deliberately kept:
grep -c 'Windows NT 10.0' main.py                                        # >0 (UA strings kept)
test -f tests/fixtures/shortcuts/windows.json && echo "shortcut fixture kept"
grep -n '"windows"' tests/test_shortcuts_vdf.py                          # kept

# Cross-platform http helpers still present:
grep -nE '_http_text_urllib|_http_text_curl' main.py                     # still defined
```

Static review:

- No `os.name == "nt"` conditional remains (informational `"os_name": str(os.name)` is fine).
- `is_windows` removed from both the backend dict and the TS interface; nothing else reads it.
- Linux Steam-root and userdata-root discovery is behaviorally identical to before for the
  non-Windows path (same candidates, same ordering).
- UA spoof strings and the Windows shortcut-parser fixture are untouched.
- pytest shows the platform-capabilities expectation change went red before the `main.py` edit
  and green after (TDD evidence in the session log).

### Deferred verification — on-device (cannot run here)

Sideload and open the QAM: platform detection still reports SteamOS/Linux correctly, Steam
root/userdata discovery still finds the Deck's Steam install, and scanning/metadata behavior
is unchanged. (No user-visible feature depended on `is_windows`.)

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished remove-windows-runtime
```

This writes:

```text
/tmp/Decky-Metadata/remove-windows-runtime_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer remove-windows-runtime`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/remove-windows-runtime-review-*.md
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
   scripts/orchestration/clear-finished remove-windows-runtime
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
   git add docs/review/remove-windows-runtime-review-*.md
   git commit -m "docs(review): record remove-windows-runtime review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished remove-windows-runtime
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer remove-windows-runtime` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed remove-windows-runtime
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize remove-windows-runtime
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/remove-windows-runtime_finalized
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
scripts/orchestration/finalize remove-windows-runtime
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/remove-windows-runtime_finished
/tmp/Decky-Metadata/remove-windows-runtime_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
