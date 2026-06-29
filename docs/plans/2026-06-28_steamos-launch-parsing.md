# Plan: SteamOS: Linux launch parsing for RetroAchievements (steamos-launch-parsing)

## Context

RetroAchievements auto-detection on a Steam Deck must find the actual ROM file inside a
non-Steam shortcut's launch command (Flatpak wrappers, AppImages, `bash -c` wrappers,
SD-card paths, Proton/`%command%`), instead of treating the whole exe+options string as an
opaque path. This plan adds a Linux-aware candidate-path extractor and routes the existing
RetroAchievements resolution through it, with structured diagnostic reason codes.

Key facts (verify before relying on them):

- The callable `async def resolve_retroachievements_from_path(self, app_id, path, title="")`
  already exists (3 references in `main.py`). Preserve its signature for compatibility and
  route it through the new extractor.
- `ROM_EXTENSIONS` already exists in `main.py` (5 references) — reuse it for suffix
  matching/scoring. `ra_game_ids` storage exists (9 references) — preserve manual mappings.
- `main.py` does **not** currently `import shlex`; add it.
- Shortcut fields (`exe`, `launch_options`, `start_dir`) come from
  `steamos-shortcut-discovery` (already merged). Build on its normalized output.
- The test harness is available; this is highly testable pure logic — TDD it.
- This plan file is already committed on base branch `dev`; a no-op "commit this plan
  first" is expected.

**Slug used throughout this plan:** `steamos-launch-parsing`

---

## Orchestration Contract

**Slug:** `steamos-launch-parsing`

**Plan file:**

```text
docs/plans/2026-06-28_steamos-launch-parsing.md
```

**Implementation branch:**

```text
feat/steamos-launch-parsing
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/steamos-launch-parsing_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/steamos-launch-parsing_finalized
```

**Review notes:**

```text
docs/review/steamos-launch-parsing-review-*.md
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
git checkout -b feat/steamos-launch-parsing
```

Commit this plan first:

```bash
git add docs/plans/2026-06-28_steamos-launch-parsing.md
git commit -m "docs(plan): add steamos-launch-parsing implementation plan"
```

---

## Implementation Tasks

1. Add `import shlex` to the stdlib import block.

2. **Implement `extract_candidate_game_paths(self, exe, launch_options="", start_dir="")
   -> list[dict[str, Any]]`.** On Linux/SteamOS tokenize with `shlex.split(s, posix=True)`;
   guard against `ValueError` from unbalanced quotes (fall back to a whitespace split).
   Handle, at minimum:
   - quoted ROM paths and escaped spaces;
   - `~` and `$HOME`/`${HOME}` expansion (use `os.path.expanduser` / `expandvars`);
   - `%command%` placeholder (substitute the exe/args around it);
   - `/run/media/...` SD-card paths and `/home/<user>/Emulation/roms/...` paths;
   - Flatpak wrappers (`/usr/bin/flatpak run <app> ... <ROM>`): skip the flatpak binary and
     `-L <core>` core args; return the ROM, not the binary;
   - AppImage launchers;
   - shell wrappers `(/usr/bin/)?bash -c "<inner>"`: recursively parse the inner command;
   - Proton launch strings.
   Collect candidates from `launch_options`, then `exe`, then `start_dir`. For each
   candidate emit `{"path": str, "exists": bool, "suffix": str, "source": "launch_options"
   | "exe" | "start_dir" | "shell_command", "score": float}`. Selection/scoring rules:
   prefer existing files whose suffix is in `ROM_EXTENSIONS`; include `.m3u`/archive/disc
   playlist paths; include quoted paths even if missing (mark `exists=false`); URL-decode
   segments if present; rank by likelihood (suffix match + existence + token position),
   not just first match. Return highest-score first. Never raise.
   **Security:** this function tokenizes and inspects shortcut-derived strings only.
   It must **never execute** any parsed value — no `subprocess`, `os.system`, `os.popen`,
   `shell=True`, or `eval`. `shlex.split` is used purely to tokenize; tokens are treated as
   path data. Only files whose suffix is in `ROM_EXTENSIONS` should be opened/hashed, reads
   must be size-bounded so a hostile path cannot force a huge allocation, and special files
   (sockets/devices/FIFOs) must not be opened.

3. **Route resolution through the extractor.** Refactor `resolve_retroachievements_from_path`
   so it: builds candidates from the provided `path` (and, when available, the shortcut's
   exe/launch_options/start_dir) → picks the best plausible ROM → runs the existing hash /
   RA lookup → caches a successful `app_id → RA game id` in `ra_game_ids`. Requirements:
   - Do **not** call the RetroAchievements API when there is no plausible candidate or
     known RA id.
   - Never overwrite an existing **manual** `ra_game_ids` mapping unless explicitly
     requested.
   - Return a structured result carrying one reason code: `no_candidate_path`,
     `candidate_missing`, `unsupported_extension`, `hash_not_found`,
     `api_credentials_missing`, `api_error`, `matched`, or `manual_mapping_exists`.
   - Optionally cache failed path hashes briefly to avoid repeat API calls.

4. **Frontend diagnostics (minimal).** In `src/types.ts` add the reason-code union/field to
   the RA resolution result type; in `src/components.tsx` show a short, actionable message
   for the common reasons (use the spec's copy, via i18n) — e.g. "No ROM path was detected
   from this Steam shortcut. Use manual RetroAchievements search or check the launch
   options." Keep this small; do not redesign the RA UI.

5. **Tests** `tests/test_launch_parsing.py` with fixtures under `tests/fixtures/launch/`
   (`emu_deck_commands.json`, `flatpak_commands.json`, `proton_commands.json`). Cover the
   spec's example commands plus: quoted path with spaces; Flatpak RetroArch → yields the
   ROM, not the flatpak binary or core; `bash -c "..."` → yields the inner ROM; AppImage;
   `/run/media/...`; missing ROM → `exists=false`, no exception; no plausible candidate →
   empty/`no_candidate_path` and assert no network call is attempted (inject/monkeypatch
   the API call to fail the test if invoked).

6. Record a session summary under `docs/agent_conversations/` per `AGENTS.md` §9.

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
uv run --with pytest -- pytest -q tests/test_launch_parsing.py
scripts/orchestration/run-quality-gates    # full gate
git status --short                          # clean
```

Expected:

- A quoted ROM path with spaces is extracted intact.
- A Flatpak RetroArch command yields the ROM path (not the flatpak binary or `-L` core).
- A `bash -c "..."` wrapper yields the inner ROM path.
- A missing ROM produces a candidate with `exists=false` (no exception).
- With no plausible candidate, no RetroAchievements network call is made and the result
  reason is `no_candidate_path`.
- `resolve_retroachievements_from_path` keeps its signature and a pre-existing manual
  `ra_game_ids` mapping is not overwritten.

Deferred verification (record in the session log; requires hardware): at least one real
Steam Deck ROM shortcut (Steam ROM Manager / EmuDeck) auto-resolving to an RA candidate or
returning a clear reason; manual RA selection still overriding auto-detection.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished steamos-launch-parsing
```

This writes:

```text
/tmp/Playhub-Metadata-local/steamos-launch-parsing_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer steamos-launch-parsing`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/steamos-launch-parsing-review-*.md
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
   scripts/orchestration/clear-finished steamos-launch-parsing
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
   git add docs/review/steamos-launch-parsing-review-*.md
   git commit -m "docs(review): record steamos-launch-parsing review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished steamos-launch-parsing
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer steamos-launch-parsing` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed steamos-launch-parsing
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize steamos-launch-parsing
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/steamos-launch-parsing_finalized
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
scripts/orchestration/finalize steamos-launch-parsing
```

Do not manually merge into `main` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/steamos-launch-parsing_finished
/tmp/Playhub-Metadata-local/steamos-launch-parsing_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
