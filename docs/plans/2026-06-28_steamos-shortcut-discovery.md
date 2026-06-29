# Plan: SteamOS: Steam root and shortcut discovery (steamos-shortcut-discovery)

## Context

Non-Steam games on a Steam Deck must be discovered from Steam's `shortcuts.vdf` files.
The repo already has a working binary-VDF reader, but its root coverage is too narrow for
SteamOS and its output is not fully normalized. This plan extends discovery to all common
SteamOS locations and normalizes/dedupes shortcut output, without regressing Windows.

Key facts (verify before relying on them) — the spec's names differ from the code, so use
the **real** functions:

- `_read_steam_shortcuts()` (~line 6702) iterates `_steam_userdata_roots()` (~line 6739),
  reads each `userdata/<id>/config/shortcuts.vdf`, and parses it via
  `_extract_shortcuts_from_vdf()` (~line 6772), which uses `_parse_binary_vdf_object()`
  and `_vdf_get()`. There is **no** `_parse_shortcuts_vdf`/`read_non_steam_shortcuts`/
  `_detect_steam_installs` yet — the spec's names are aspirational; harden the existing
  functions instead of creating parallel ones.
- `_steam_userdata_roots()` currently returns only `~/.local/share/Steam/userdata` and
  `~/.steam/steam/userdata` (plus Windows registry/Program Files). It is missing
  `$STEAM_COMPAT_CLIENT_INSTALL_PATH`, `~/.steam/root`, the Flatpak path, and SD-card
  `/run/media/*` paths.
- `_extract_shortcuts_from_vdf()` already emits `name`, `exe`, `start_dir`,
  `launch_options`, `shortcut_path`, `icon`, `appid`. It does not normalize `app_id` to a
  stable int, set a `source`, capture the `steam_user_id`, or dedupe.
- `_detect_steam_roots()` from `steamos-platform-capabilities` exists — reuse it as the
  single source of Steam roots so path logic is not duplicated.
- The frontend consumes shortcuts via the `get_local_shortcuts` callable; new fields must
  be **additive** so the existing `GameOption` shape keeps working (read `src/backend.ts`
  / `src/steam.ts` for the consumed fields before changing output).
- The test harness is available; add fixtures + pytest tests.
- This plan file is already committed on base branch `dev`; a no-op "commit this plan
  first" is expected.

**Slug used throughout this plan:** `steamos-shortcut-discovery`

---

## Orchestration Contract

**Slug:** `steamos-shortcut-discovery`

**Plan file:**

```text
docs/plans/2026-06-28_steamos-shortcut-discovery.md
```

**Implementation branch:**

```text
feat/steamos-shortcut-discovery
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/steamos-shortcut-discovery_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/steamos-shortcut-discovery_finalized
```

**Review notes:**

```text
docs/review/steamos-shortcut-discovery-review-*.md
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
git checkout -b feat/steamos-shortcut-discovery
```

Commit this plan first:

```bash
git add docs/plans/2026-06-28_steamos-shortcut-discovery.md
git commit -m "docs(plan): add steamos-shortcut-discovery implementation plan"
```

---

## Implementation Tasks

1. **Add a `SteamInstall` dataclass** (use `from dataclasses import dataclass`,
   `frozen=True`): fields `root: Path`, `userdata_dirs: list[Path]`,
   `shortcut_files: list[Path]`, `libraryfolders_files: list[Path]`,
   `appmanifest_dirs: list[Path]`. Add `_detect_steam_installs(self) -> list[SteamInstall]`
   built from `_detect_steam_roots()`: for each root, collect `userdata/*` dirs, the
   `config/shortcuts.vdf` under each, `libraryfolders.vdf` under `config/` and
   `steamapps/`, and `steamapps/` dirs. Skip unreadable paths silently (log at debug).

2. **Widen Linux root coverage.** Update `_steam_userdata_roots()` to derive its Linux
   candidates from `_detect_steam_roots()` (mapping each root to `root/userdata`), so it
   automatically gains `$STEAM_COMPAT_CLIENT_INSTALL_PATH`, `~/.steam/root`, the Flatpak
   path, and `/run/media/*` SD-card paths. Preserve the existing Windows branch exactly.
   Keep returning a deduped, order-preserving list of existing directories; never raise.

3. **Normalize and harden parser output.** In `_extract_shortcuts_from_vdf()` (and where
   `_read_steam_shortcuts()` assembles results) add, additively:
   - `app_id`: the shortcut's appid normalized to a stable `int` (handle the unsigned /
     signed 32-bit representation Steam uses; if absent, derive deterministically from
     `exe`+`name` the same way Steam would, or fall back to `0` — do not crash).
   - `source`: the constant string `"steam_shortcuts_vdf"`.
   - `steam_user_id`: the `userdata/<id>` directory name the file came from.
   - `shortcut_path`: keep, and ensure the source `shortcuts.vdf` path is available.
   - Preserve original raw values; when stripping surrounding quotes from `exe`, keep the
     original too (e.g. `exe_raw`). Decoding must use byte-replacement, never throw, for
     corrupt/invalid UTF-8.
   Keep all existing keys so current callers keep working.

4. **Deduplicate** the combined results by the tuple `(app_id, name, exe, launch_options)`,
   preserving first-seen order.

5. **Resilience:** a missing, empty, or corrupt `shortcuts.vdf`, or a userdata dir that
   does not exist, must yield an empty contribution and a debug log line — never an
   exception that breaks `get_local_shortcuts`.
   **Security:** `shortcuts.vdf` is attacker-influenceable binary input. The parser must
   be hardened against malformed data: bound the maximum file size it will read, cap
   nesting depth in `_parse_binary_vdf_object` (reject/stop on absurd depth rather than
   recursing unboundedly), and cap the number of shortcuts processed, so a crafted file
   cannot cause unbounded memory use, a stack overflow, or a hang (DoS). All byte decoding
   stays replacement-based; no value is ever executed.

6. **Tests + fixtures** (`tests/`):
   - `tests/fixtures/shortcuts/` containing at least a Windows-style and a SteamOS/SRM-style
     `shortcuts.vdf`. Prefer generating these bytes from a small helper in the test (write
     a minimal binary VDF with 1–2 entries) so the fixtures are transparent; committing
     tiny binary fixtures is also acceptable if documented.
   - `tests/test_shortcuts_vdf.py`: parse each fixture and assert normalized fields
     (`app_id` int, `name`, `exe`, `launch_options`, `source`, `steam_user_id`); assert a
     corrupt file returns `[]` without raising; assert dedup collapses duplicates.
   - `tests/test_steam_paths.py`: with `$HOME`/env pointed at `tmp_path`, assert
     `_detect_steam_roots()`/`_steam_userdata_roots()` pick up the Flatpak path,
     `$STEAM_COMPAT_CLIENT_INSTALL_PATH`, and a simulated `/run/media/*/SteamLibrary`
     (create the dirs under `tmp_path` and monkeypatch the glob base if needed), and that
     nonexistent candidates are excluded.

7. Record a session summary under `docs/agent_conversations/` per `AGENTS.md` §9.

Scope note: do not change RetroAchievements resolution (that is `steamos-launch-parsing`)
or any frontend file beyond what is strictly needed to keep `get_local_shortcuts`
consumers compiling.

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
uv run --with pytest -- pytest -q tests/test_shortcuts_vdf.py tests/test_steam_paths.py
scripts/orchestration/run-quality-gates    # full gate incl. tsc/build/py_compile/pytest
git status --short                          # clean
```

Expected:

- Fixture shortcuts parse into normalized dicts including an int `app_id`, `source`,
  and `steam_user_id`; duplicates are collapsed; corrupt input yields `[]` not an error.
- Root detection includes the Flatpak, env-var, and `/run/media/*` candidates that exist
  and excludes ones that don't.
- The Windows code path in `_steam_userdata_roots()` is unchanged (verify by reading the
  diff; no behavior removed).

Deferred verification (record in the session log; requires hardware): confirming that a
real Steam Deck's primary-profile non-Steam shortcuts are returned by `get_local_shortcuts`,
and that multiple `userdata` profiles do not crash the parser.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished steamos-shortcut-discovery
```

This writes:

```text
/tmp/Playhub-Metadata-local/steamos-shortcut-discovery_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer steamos-shortcut-discovery`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/steamos-shortcut-discovery-review-*.md
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
   scripts/orchestration/clear-finished steamos-shortcut-discovery
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
   git add docs/review/steamos-shortcut-discovery-review-*.md
   git commit -m "docs(review): record steamos-shortcut-discovery review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished steamos-shortcut-discovery
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer steamos-shortcut-discovery` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed steamos-shortcut-discovery
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize steamos-shortcut-discovery
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/steamos-shortcut-discovery_finalized
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
scripts/orchestration/finalize steamos-shortcut-discovery
```

Do not manually merge into `main` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/steamos-shortcut-discovery_finished
/tmp/Playhub-Metadata-local/steamos-shortcut-discovery_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
