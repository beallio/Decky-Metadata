# Plan: SteamOS: image and icon fallback hardening (steamos-icon-fallback)

## Context

Achievement icon processing must never block achievements on SteamOS. Today icon cropping
uses Pillow when present and falls back to **Windows PowerShell**, and writes loopback icons
into Steam's `steamui` folder; on Linux none of that should be required and any failure must
degrade gracefully. This plan makes Pillow the only Linux cropper, removes Linux reliance on
PowerShell, and ensures icon/proxy/loopback failures log a fallback mode and continue.

Key facts (verify before relying on them):

- `main.py` references: `powershell` (10) / `PowerShell` (3) — the Windows cropper fallback;
  `loopback` (32) and `steamui` (20) — the loopback icon strategy and target dir
  (`_steamui_loopback_icon_dir()` ~line 356); `_image_proxy_port` (9) — the localhost image
  proxy; `Image` — Pillow, may be `None` (already optional).
- `capabilities.has_pillow` / `supports_loopback_icons` / `supports_localhost_icon_proxy`
  are available from `steamos-platform-capabilities` for diagnostics.
- The test harness is available.
- This plan file is already committed on base branch `dev`; a no-op "commit this plan
  first" is expected.

**Slug used throughout this plan:** `steamos-icon-fallback`

---

## Orchestration Contract

**Slug:** `steamos-icon-fallback`

**Plan file:**

```text
docs/plans/2026-06-28_steamos-icon-fallback.md
```

**Implementation branch:**

```text
feat/steamos-icon-fallback
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/steamos-icon-fallback_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/steamos-icon-fallback_finalized
```

**Review notes:**

```text
docs/review/steamos-icon-fallback-review-*.md
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
git checkout -b feat/steamos-icon-fallback
```

Commit this plan first:

```bash
git add docs/plans/2026-06-28_steamos-icon-fallback.md
git commit -m "docs(plan): add steamos-icon-fallback implementation plan"
```

---

## Implementation Tasks

1. **Add `_xbox_cropper_name(self) -> str`** returning the active cropper:
   `"pillow"` if `Image is not None`; else `"windows"` only if `os.name == "nt"` and a
   PowerShell executable is available (reuse/keep the existing Windows-PowerShell-detection
   helper); else `"none"`.

2. **Gate every PowerShell crop path behind `os.name == "nt"`.** Audit the `powershell`/
   `PowerShell` call sites and ensure none can execute on Linux/SteamOS. On non-Windows the
   cropper is Pillow or nothing.

3. **`no_crop` fallback.** When the cropper is `"none"` (or Pillow raises), skip cropping and
   return the uncropped icon URL/path instead of failing. Cropping failure must never raise
   out of achievement fetching.

4. **Isolate icon side-effects from achievement payloads.** Ensure that:
   - local image-proxy startup failure logs `proxy_unavailable` and continues;
   - a non-writable `steamui` loopback dir logs `loopback_unavailable` and continues;
   - a crop failure logs `pillow`/`no_crop` mode and continues.
   In all cases the achievement payload still loads (icons may be uncropped/missing).

5. **Prefer Decky settings/cache dirs** for generated images where the code already chooses
   a write location, rather than assuming `steamui` is writable. Do not remove the loopback
   path on Windows; only stop *depending* on it.

6. **Diagnostics:** expose the current icon mode (one of `pillow` / `no_crop` /
   `loopback_unavailable` / `proxy_unavailable`) so the settings diagnostics panel can show
   it (reuse the panel from `steamos-platform-capabilities`; a backend field or extension of
   the capabilities result is fine).

7. **Tests** `tests/test_icon_fallback.py`: assert `_xbox_cropper_name()` returns `"none"`
   when `Image is None` and `os.name != "nt"` (monkeypatch both), and `"pillow"` when
   `Image` is set; assert the crop entry point returns gracefully (no exception, returns an
   uncropped result) when `Image is None`. Build the instance with
   `main.Plugin.__new__(main.Plugin)`.

8. Record a session summary under `docs/agent_conversations/` per `AGENTS.md` §9.

Scope note: backend-only. Do not change Steam-internal UI patching (that is
`steamos-ui-guards`).

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
uv run --with pytest -- pytest -q tests/test_icon_fallback.py
scripts/orchestration/run-quality-gates    # full gate
git status --short                          # clean
```

Expected:

- `_xbox_cropper_name()` returns `"none"` on Linux without Pillow and `"pillow"` with it;
  no PowerShell invocation is reachable on non-Windows.
- The crop entry point returns an uncropped result (no exception) when Pillow is absent.
- A simulated unwritable loopback dir / failed proxy does not propagate into the
  achievement payload path (assert via the relevant helper or a monkeypatched failure).

Deferred verification (record in the session log; requires hardware): on a real Steam Deck,
achievements load with Pillow present (icons cropped) and with Pillow absent (icons
uncropped/missing but achievements still shown); an unwritable `steamui` logs the fallback
and continues.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished steamos-icon-fallback
```

This writes:

```text
/tmp/Playhub-Metadata-local/steamos-icon-fallback_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer steamos-icon-fallback`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/steamos-icon-fallback-review-*.md
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
   scripts/orchestration/clear-finished steamos-icon-fallback
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
   git add docs/review/steamos-icon-fallback-review-*.md
   git commit -m "docs(review): record steamos-icon-fallback review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished steamos-icon-fallback
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer steamos-icon-fallback` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed steamos-icon-fallback
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize steamos-icon-fallback
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/steamos-icon-fallback_finalized
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
scripts/orchestration/finalize steamos-icon-fallback
```

Do not manually merge into `main` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/steamos-icon-fallback_finished
/tmp/Playhub-Metadata-local/steamos-icon-fallback_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
