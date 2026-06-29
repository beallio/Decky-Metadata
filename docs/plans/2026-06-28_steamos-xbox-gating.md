# Plan: SteamOS: Xbox and UWPHook platform gating (steamos-xbox-gating)

## Context

On SteamOS the automatic UWPHook/Xbox-App detection cannot work (those are Windows
workflows), but the UI still presents it, which is misleading. This plan splits Xbox
support into **manual OpenXBL mapping** (cross-platform, kept) and **automatic UWPHook/Xbox
detection** (Windows-only, gated off on SteamOS), using the capabilities from
`steamos-platform-capabilities`. Manual Xbox title search/mapping stays available
everywhere.

Key facts (verify before relying on them):

- Backend functions exist: `async def resolve_xbox_from_shortcut(...)` (~line 744) and its
  sync core `_resolve_xbox_from_shortcut_sync(...)` (~line 2685); plus `search_xbox_titles`
  and `set_xbox_title_id` (manual, keep working on all platforms).
- The frontend does **not** use the literal strings "UWPHook" or "OpenXBL" — it uses
  "Xbox"/"xbox" (≈189 references in `src/components.tsx`) and "scan"/"Scan" (≈18). Do not
  grep for the spec's labels; instead locate the actual Xbox auto-scan control(s) in
  `src/components.tsx` and the background Xbox auto-resolution call site(s) in
  `src/steam.ts`, and gate those.
- `capabilities.supports_xbox_uwphook_auto` is already provided by
  `getPlatformCapabilities` (true only on Windows) and loaded at panel start.
- The test harness is available.
- This plan file is already committed on base branch `dev`; a no-op "commit this plan
  first" is expected.

**Slug used throughout this plan:** `steamos-xbox-gating`

---

## Orchestration Contract

**Slug:** `steamos-xbox-gating`

**Plan file:**

```text
docs/plans/2026-06-28_steamos-xbox-gating.md
```

**Implementation branch:**

```text
feat/steamos-xbox-gating
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/steamos-xbox-gating_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/steamos-xbox-gating_finalized
```

**Review notes:**

```text
docs/review/steamos-xbox-gating-review-*.md
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
git checkout -b feat/steamos-xbox-gating
```

Commit this plan first:

```bash
git add docs/plans/2026-06-28_steamos-xbox-gating.md
git commit -m "docs(plan): add steamos-xbox-gating implementation plan"
```

---

## Implementation Tasks

### Backend (`main.py`)

1. At the top of `_resolve_xbox_from_shortcut_sync(...)` (the automatic path), short-circuit
   on non-Windows: if `os.name != "nt"`, return
   `{"ok": False, "reason": "uwphook_auto_unsupported_on_platform", "manual_supported": True}`
   before doing any Windows-specific work. Make sure `resolve_xbox_from_shortcut` surfaces
   this structured result rather than `None`/an opaque error.
2. Do **not** change `search_xbox_titles` or `set_xbox_title_id` — manual OpenXBL mapping
   must keep working on SteamOS (only requires an OpenXBL API key, not Windows).

### Frontend

3. Using the loaded capabilities, gate the Xbox **auto-scan** control in
   `src/components.tsx`: when `!capabilities.supports_xbox_uwphook_auto`, hide or disable it
   and show a short manual-only notice (spec §10.2 copy: "Xbox automatic scanning is
   Windows-only because it depends on UWPHook/Xbox App shortcuts. Manual OpenXBL title
   mapping is still available."), via i18n. Keep the manual Xbox/OpenXBL search and
   title-mapping UI visible and functional.
4. In `src/steam.ts`, do not trigger background Xbox auto-detection /
   `resolveXboxFromShortcut` when `!supports_xbox_uwphook_auto`. Keep manual flows intact.
5. Add any new visible strings to `src/i18n.ts` following the existing key pattern.

### Tests

6. `tests/test_xbox_gating.py`: assert `_resolve_xbox_from_shortcut_sync` returns the
   `uwphook_auto_unsupported_on_platform` reason dict when `os.name != "nt"` (monkeypatch
   `os.name`), and that it does **not** short-circuit when `os.name == "nt"` (it should
   proceed past the guard — you may monkeypatch downstream calls to assert the guard was
   passed). Build the instance with `main.Plugin.__new__(main.Plugin)`.

7. Record a session summary under `docs/agent_conversations/` per `AGENTS.md` §9.

Scope note: do not touch RetroAchievements, icon handling, or Steam-internal UI guards
here.

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
uv run --with pytest -- pytest -q tests/test_xbox_gating.py
scripts/orchestration/run-quality-gates    # full gate (tsc/build included)
git status --short                          # clean
```

Expected:

- On non-Windows, `_resolve_xbox_from_shortcut_sync` returns the structured
  `uwphook_auto_unsupported_on_platform` result (never `None`/opaque error).
- `search_xbox_titles` / `set_xbox_title_id` are unchanged.
- `npx tsc --noEmit` and `npm run build` pass with the gated UI and `steam.ts` change.

Deferred verification (record in the session log; requires hardware): on a real Steam Deck,
the Xbox auto-scan control is hidden/disabled with the explanatory copy while manual OpenXBL
search still works with an API key; on Windows, existing UWPHook scan behavior is intact.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished steamos-xbox-gating
```

This writes:

```text
/tmp/Playhub-Metadata-local/steamos-xbox-gating_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer steamos-xbox-gating`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/steamos-xbox-gating-review-*.md
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
   scripts/orchestration/clear-finished steamos-xbox-gating
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
   git add docs/review/steamos-xbox-gating-review-*.md
   git commit -m "docs(review): record steamos-xbox-gating review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished steamos-xbox-gating
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer steamos-xbox-gating` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed steamos-xbox-gating
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize steamos-xbox-gating
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/steamos-xbox-gating_finalized
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
scripts/orchestration/finalize steamos-xbox-gating
```

Do not manually merge into `main` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/steamos-xbox-gating_finished
/tmp/Playhub-Metadata-local/steamos-xbox-gating_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
