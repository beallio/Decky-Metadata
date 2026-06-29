# Plan: SteamOS: platform capabilities API (steamos-platform-capabilities)

## Context

The plugin needs one shared, authoritative description of "what platform am I on and
which features work here" so the frontend can hide Windows-only flows on SteamOS and the
backend can short-circuit unsupported operations. This plan adds a
`get_platform_capabilities` backend callable plus the helpers it needs, a matching
frontend type and callable, loads capabilities once at panel start, and shows a small
diagnostics readout in settings. Later plans (Xbox gating, UI guards) consume this.

Key facts (verify before relying on them):

- `main.py` does **not** currently `import sys`; the capabilities dict needs
  `sys.platform`, so add `import sys` to the existing stdlib import block.
- Existing related helpers already present: `_steam_userdata_roots()` (~line 6739),
  `_steamui_loopback_icon_dir()` (~line 356), `_image_proxy_port` (an int attribute),
  and `Image` (Pillow, may be `None`). Reuse these; do not duplicate path logic.
- Decky exposes each `async` method on `Plugin` as a callable automatically — defining
  `async def get_platform_capabilities(self)` is enough (mirror existing callables such
  as `get_local_shortcuts`). Confirm the pattern by reading a nearby callable.
- Frontend callables live in `src/backend.ts` (33 existing `callable(...)` bindings);
  shared types in `src/types.ts`; the settings UI is `src/components.tsx` (uses the
  project's i18n helper in `src/i18n.ts` for user-facing strings).
- The test harness from `steamos-test-harness` is available: write pytest unit tests for
  the new pure helpers using the documented `Plugin.__new__` pattern.
- This plan file is already committed on base branch `dev`; a no-op "commit this plan
  first" is expected.

**Slug used throughout this plan:** `steamos-platform-capabilities`

---

## Orchestration Contract

**Slug:** `steamos-platform-capabilities`

**Plan file:**

```text
docs/plans/2026-06-28_steamos-platform-capabilities.md
```

**Implementation branch:**

```text
feat/steamos-platform-capabilities
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/steamos-platform-capabilities_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/steamos-platform-capabilities_finalized
```

**Review notes:**

```text
docs/review/steamos-platform-capabilities-review-*.md
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
git checkout -b feat/steamos-platform-capabilities
```

Commit this plan first:

```bash
git add docs/plans/2026-06-28_steamos-platform-capabilities.md
git commit -m "docs(plan): add steamos-platform-capabilities implementation plan"
```

---

## Implementation Tasks

### Backend (`main.py`)

1. Add `import sys` to the standard-library import block at the top of the file.

2. Implement `_is_steamos(self) -> bool`. Return `True` when the host is SteamOS:
   read `/etc/os-release` and match `ID=steamos` or `steamos` in `ID_LIKE`, or treat the
   existence of `/etc/steamos-release` as `True`. Must never raise (wrap file access in
   try/except and return `False` on any error or on non-Linux).

3. Implement `_detect_steam_roots(self) -> list[Path]` returning existing Steam **root**
   directories (the directory that contains `userdata`/`steamapps`). Candidate sources:
   `$STEAM_COMPAT_CLIENT_INSTALL_PATH`, `~/.local/share/Steam`, `~/.steam/steam`,
   `~/.steam/root`, `~/.var/app/com.valvesoftware.Steam/.local/share/Steam`, and globbed
   `/run/media/*/SteamLibrary` and parents of `/run/media/*/steamapps`. On Windows also
   include the registry `SteamPath` (reuse the existing `_read_windows_steam_path()`) and
   `%PROGRAMFILES(X86)%/Steam`, `%PROGRAMFILES%/Steam`. `resolve()` each, keep only paths
   that exist, dedupe preserving order, never raise. Add `_detect_steam_root(self)`
   returning the first root or `None`.

4. Implement `_can_use_loopback_icons(self) -> bool`: `True` only if
   `_steamui_loopback_icon_dir()` returns a path that exists and is writable
   (`os.access(..., os.W_OK)`); never raise.

5. Implement the callable `async def get_platform_capabilities(self) -> dict[str, Any]`
   returning exactly these keys (booleans/strings/lists), computed from the helpers above
   and existing attributes:
   `platform` (`sys.platform`), `os_name` (`os.name`), `is_linux`, `is_windows`,
   `is_steamos`, `steam_root` (str, "" if none), `steam_roots` (list[str]),
   `has_pillow` (`Image is not None`), `supports_metadata` True, `supports_steam_activity`
   True, `supports_retroachievements` True, `supports_retroachievements_auto` True,
   `supports_xbox_manual` True, `supports_xbox_uwphook_auto` (`os.name == "nt"`),
   `supports_xbox_app_scan` (`os.name == "nt"`), `supports_loopback_icons`
   (`_can_use_loopback_icons()`), `supports_localhost_icon_proxy`
   (`self._image_proxy_port > 0`). Wrap the body so a failure in any single probe degrades
   to a safe default rather than raising.

6. Add pytest tests `tests/test_platform_capabilities.py`: cover `_is_steamos` (monkeypatch
   `/etc/os-release` contents and absence), `_detect_steam_roots` (point `$HOME`/env at
   `tmp_path` dirs you create, assert only existing roots returned, deduped), and that
   `get_platform_capabilities` returns all required keys with correct types and that
   `supports_xbox_uwphook_auto == (os.name == "nt")`. Build the instance with
   `main.Plugin.__new__(main.Plugin)` and set `_image_proxy_port` as needed.

### Frontend

7. `src/types.ts`: add the `PlatformCapabilities` interface mirroring the backend keys
   (all snake_case fields, matching types).

8. `src/backend.ts`: add
   `export const getPlatformCapabilities = callable<[], PlatformCapabilities>("get_platform_capabilities");`
   and import the type. Follow the existing `callable(...)` style in that file.

9. `src/components.tsx`: load capabilities once when the settings/panel mounts (e.g. a
   `useEffect` calling `getPlatformCapabilities()`), store in component state (or existing
   context if one is used). Guard against the call failing (catch → leave capabilities
   undefined and render nothing extra). Add a compact, collapsible "Diagnostics" /
   "Platform" section showing: platform, is_steamos, steam_root, and the `supports_*`
   flags. Use the i18n helper for any new visible strings, adding English keys in
   `src/i18n.ts` following the existing key pattern.
   **Security/privacy:** the diagnostics readout must never render secrets — no
   RetroAchievements or OpenXBL API keys, tokens, or credential material may appear in
   `get_platform_capabilities` output or the panel. `steam_root`/`steam_roots` may contain
   the local username; keep these strictly local (display only) and never send them to any
   remote API or log sink.

10. Do not yet change Xbox/UWPHook or Steam-internal behavior — that is `steamos-xbox-gating`
    and `steamos-ui-guards`. This plan only *exposes* capabilities and the diagnostics
    readout.

11. Record a session summary under `docs/agent_conversations/` per `AGENTS.md` §9.

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
uv run --with pytest -- pytest -q tests/test_platform_capabilities.py
scripts/orchestration/run-quality-gates    # tsc + build + py_compile + full pytest
git status --short                          # clean
```

Expected:

- New tests pass; `get_platform_capabilities` returns all required keys with correct
  types; on this Linux host `is_linux=true`, `is_windows=false`,
  `supports_xbox_uwphook_auto=false`, `supports_retroachievements=true`.
- `npx tsc --noEmit` passes with the new `PlatformCapabilities` type and callable.
- `npm run build` regenerates `dist/index.js` without error.

Deferred verification (record in the session log, do not attempt here): confirming on a
real Steam Deck that the diagnostics panel reports `is_steamos=true` and a valid
`steam_root`, and on Windows that `is_windows=true`. Requires hardware.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished steamos-platform-capabilities
```

This writes:

```text
/tmp/Playhub-Metadata-local/steamos-platform-capabilities_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer steamos-platform-capabilities`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/steamos-platform-capabilities-review-*.md
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
   scripts/orchestration/clear-finished steamos-platform-capabilities
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
   git add docs/review/steamos-platform-capabilities-review-*.md
   git commit -m "docs(review): record steamos-platform-capabilities review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished steamos-platform-capabilities
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer steamos-platform-capabilities` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed steamos-platform-capabilities
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize steamos-platform-capabilities
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/steamos-platform-capabilities_finalized
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
scripts/orchestration/finalize steamos-platform-capabilities
```

Do not manually merge into `main` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/steamos-platform-capabilities_finished
/tmp/Playhub-Metadata-local/steamos-platform-capabilities_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
