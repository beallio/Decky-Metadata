# Plan: Redirect native Store button to matched app (redirect-store-showstore)

## Context

After the `native-steam-nav-redirect` work, on-device logs confirm: matching now resolves
`steam_appid` correctly, and the native **Community Hub / Discussions / Guides** buttons
navigate to the matched app (they go through the URL openers the plugin already patches —
`[playhub:nav] steam link kind='community' ...` shows the correct real appid). **Only the
Store Page button still lands on the main store.**

Root cause (confirmed in the Deck's steamui bundle): the app-page **Store Page** button calls
`SteamClient.Apps.ShowStore(<appid>)` (an in-client store open taking a numeric appid), NOT a
URL — so it bypasses the URL-opener patches in `installSteamLinkRedirect` (steam.ts:3821-3853,
which only rewrite string URL args). The `<appid>` passed is the overview's appid, which for a
matched shortcut is the **synthetic** id → the in-client store can't find it → main store.

The fix mirrors the existing redirect but for a numeric-appid argument: patch
`SteamClient.Apps.ShowStore` so a synthetic shortcut appid is remapped to the matched
`steam_appid` via `steamAppIdForApp` (steam.ts:174) before delegating. Reuse the existing
`installSteamLinkRedirect` install/teardown/idempotency (`globalState.__playhubNavRedirect`,
steam.ts:3813-3864) and the `frontendLog` trace bridge.

Relevant file: `src/steam.ts` — `installSteamLinkRedirect` (3811+), `patchUrlOpener`
(3821), `steamAppIdForApp` (174), `frontendLog` usage / `logSteamLinkNavigation` (3808).

**Intended outcome:** the native Store Page button (and any other caller of
`SteamClient.Apps.ShowStore` for a matched shortcut) opens the matched app's real store page;
the rewrite is traced in `playhub-metadata.log`. No behavior change for real Steam apps
(their appids are not shortcut keys in `metadataCache`, so no remap occurs).

**Out of scope:** the Community tab fabricated-tile content (separate follow-up); the Market /
Support buttons (not requested).

**Slug used throughout this plan:** `redirect-store-showstore`

---

## Orchestration Contract

**Slug:** `redirect-store-showstore`

**Plan file:**

```text
docs/plans/2026-06-29_redirect-store-showstore.md
```

**Implementation branch:**

```text
feat/redirect-store-showstore
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/redirect-store-showstore_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/redirect-store-showstore_finalized
```

**Review notes:**

```text
docs/review/redirect-store-showstore-review-*.md
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
git checkout -b feat/redirect-store-showstore
```

Commit this plan first:

```bash
git add docs/plans/2026-06-29_redirect-store-showstore.md
git commit -m "docs(plan): add redirect-store-showstore implementation plan"
```

---

## Implementation Tasks

Frontend-only, in `src/steam.ts`. No TS test runner exists (gate = `tsc --noEmit` + build +
py_compile + pytest); do not add one.

1. **Add a numeric-appid opener patcher** inside `installSteamLinkRedirect` (alongside
   `patchUrlOpener`, steam.ts:3821), e.g. `patchAppIdOpener(target, methodName, argIndex = 0)`
   that:
   - returns early if `typeof target?.[methodName] !== "function"`;
   - wraps the method so it reads the appid at `args[argIndex]`, computes
     `const mapped = steamAppIdForApp(Number(appIdArg))`;
   - when `mapped > 0 && mapped !== Number(appIdArg)`, replaces that arg with `mapped`, logs
     via the existing trace (`logSteamLinkNavigation("store", String(appIdArg), String(mapped))`
     — reuse the same fire-and-forget `frontendLog` helper), and delegates to the original;
   - otherwise delegates unchanged (and does **not** log, to avoid noise for real apps);
   - never throws (try/catch → call original with the unmodified args);
   - registers a teardown on `redirectUnpatchers` that restores the original only if still ours
     (mirror `patchUrlOpener`'s restore guard).

2. **Patch the store opener:** call
   `patchAppIdOpener((window as any)?.SteamClient?.Apps, "ShowStore", 0);` next to the
   existing `patchUrlOpener(...)` calls (steam.ts:3849-3853). It is covered by the existing
   `__playhubNavRedirect` idempotency guard and the existing teardown block.

3. **Scope discipline:** only add `patchAppIdOpener` + the one `ShowStore` patch. Do not change
   the URL-opener logic, matching, `BIsModOrShortcut`, or anything else. No npm deps; no
   `main.py` change.

4. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9.

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
scripts/orchestration/run-quality-gates    # tsc --noEmit + rollup build + py_compile + pytest
git status --short                          # clean
```

Expected:

- `tsc --noEmit` + build pass; pytest unchanged-green; tree clean.
- `grep -n "ShowStore" src/steam.ts` shows the new `patchAppIdOpener(..., "ShowStore", 0)`
  call inside `installSteamLinkRedirect`.

Deferred verification (record in the session log; requires hardware — performed by the
human/orchestrator):

1. Rebuild the installer from `dev` and sideload on a real Steam Deck (ensure matches are
   populated first, e.g. tap Clear cache).
2. On a matched game, tap the native **Store Page** button and confirm it now opens the
   **matched app's** store page (not the main store). Check `playhub-metadata.log` for a
   `[playhub:nav] steam link kind='store' ...` line showing the synthetic appid rewritten to
   the matched `steam_appid`.
3. Confirm real (non-shortcut) games' Store Page button is unaffected (no remap, no log line).

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished redirect-store-showstore
```

This writes:

```text
/tmp/Playhub-Metadata-local/redirect-store-showstore_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer redirect-store-showstore`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/redirect-store-showstore-review-*.md
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
   scripts/orchestration/clear-finished redirect-store-showstore
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
   git add docs/review/redirect-store-showstore-review-*.md
   git commit -m "docs(review): record redirect-store-showstore review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished redirect-store-showstore
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer redirect-store-showstore` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed redirect-store-showstore
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize redirect-store-showstore
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/redirect-store-showstore_finalized
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
scripts/orchestration/finalize redirect-store-showstore
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/redirect-store-showstore_finished
/tmp/Playhub-Metadata-local/redirect-store-showstore_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
