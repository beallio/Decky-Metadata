# Plan: Remove dead scraped-UGC community pipeline after native feed passthrough (community-feed-cleanup)

## Context

The Community tab on non-Steam shortcuts is now fixed and **shipped to `dev`** (commit
`6890f80`, merged via `3c6ad3b`). The working fix intercepts the native
`library/appcommunityfeed/<appid>` request for a non-Steam shortcut, **rewrites the appid to the
matched Steam appid, and passes it straight through to Steam's native http client** — so the tab
renders the real official community feed (screenshots/guides/videos/artwork) with correct item
shape and native pagination. This has been confirmed working on-device by the user.

That fix makes the **entire previous scraped-UGC community pipeline dead code.** The old approach
fetched `homecontent` HTML, regex-parsed it into `community_images`, and rebuilt fake feed items
in the frontend — a shape the native renderer silently discarded (the original bug). Nothing
renders `community_images` / `community_videos` anymore: a codebase sweep found only an
empty-default initializer (`src/components.tsx:307-308`) and the type declarations
(`src/types.ts:21-22`) — no display consumer.

**This plan removes that dead pipeline** so the codebase has exactly one community mechanism
(native passthrough) and no one trips over two, and it tidies the diagnostic scaffolding the live
fix left behind.

**This is a `cleanup`/`refactor` with no intended behavior change**: the Community tab must keep
working exactly as it does now (native passthrough). The only observable differences allowed are
(a) the removal of now-unused backend community-enrichment network calls during scan, and (b)
less log noise.

### What was committed by the live fix (do NOT revert)

In `src/steam.ts`, the `appcommunityfeed` branch inside `patchFeedMethod` now does the appid
rewrite + native passthrough, guarded by `isNonSteamApp(getOverview(appId))`, with a
`frontendLog("community", "feed passthrough", …)` line and an error fallback to `original(...args)`.
**Keep this. It is the one and only community-feed path.**

### Dead code to remove (verify no other consumer first)

Frontend (`src/steam.ts`), now unreferenced once the feed patch stopped calling them:
- `communityHubPageForApp` (~3262)
- `steamCommunityItemsFromMetadata` (~630), `steamCommunityItemsFromImages` (~585),
  `interleavedCommunityMedia` (~579)
- any `playhubCommunityId` / `playhubCommunityCreator` / `playhubCommunityProviderIcon` helpers
  left unreferenced after the above are gone (check each before deleting)
- the `getSteamCommunityPage` import (`src/steam.ts:12`) and its `backend.ts` callable
  (`getSteamCommunityPage`, `src/backend.ts:66`) if unused after removal

Backend (`main.py`), the scraped-UGC machinery:
- `get_steam_community_page` callable (~983) and its `_steam_community_page_sync` helper if any
- `_enrich_community_media_sync` (~1795) and its call site (~980) inside the metadata pipeline
- `_steam_community_ugc_for_appid`, `_parse_steam_community_ugc` (the regex parser added by
  `fix-htmlparser-import`), `_steam_community_image_url`, `_steam_community_link_url`,
  `_steam_sharedfile_id`, and any other `_steam_community_*` UGC helpers left unreferenced
- population of `community_images` / `community_videos` in the metadata dict (~1739, ~1813, ~2161)
  — remove the fields from what enrichment writes

### Deliberately keep

- `tests/test_no_unsafe_stdlib_imports.py` — the `html.parser` guard stays valuable as a general
  Decky-frozen-runtime guard even after the parser it protected is deleted.
- The general `[playhub:*]` navigation/trace diagnostics — **keep them, but gate them behind the
  debug toggle** (see below). The user wants them retained for troubleshooting, just silent by
  default.

### Gate diagnostics behind the existing debug toggle (do NOT delete them)

The debug toggle already flips `decky.logger.setLevel(DEBUG if enabled else INFO)` in
`_apply_debug_logging` / `set_debug_logging`. Backend `_plog` defaults to `level=logging.INFO`, so
DEBUG-level `_plog` calls (e.g. `[playhub:http]`) are already correctly gated. The gap is
`frontend_log` (main.py ~922), which calls `_plog(area, message, **fields)` at the default INFO
level — so all frontend `[playhub:trace|nav|community]` diagnostics print regardless of the toggle.

- **Make `frontend_log` emit at `level=logging.DEBUG`** (pass `level=logging.DEBUG` into `_plog`).
  This gates every frontend diagnostic behind the toggle in one change: toggle off → clean log,
  toggle on → full trace. Nothing is removed.
- Audit any remaining backend `_plog(...)` diagnostic call that is genuinely noisy/per-request and
  still defaults to INFO; move those to `level=logging.DEBUG`. Do NOT downgrade genuine
  warnings/errors or one-shot lifecycle lines (load/ready) — only per-event trace spam.

### Diagnostic scaffolding the live fix left behind

- The broad `frontendLog("community", "feed url seen", …)` line inside `patchFeedMethod` is
  redundant with the concise `"feed passthrough"` log and fires on every `library/app*` request.
  **Remove this one** (redundant). Keep the single `"feed passthrough"` log — it will be
  DEBUG-gated by the `frontend_log` change above.

### Relevant files

`src/steam.ts`, `src/backend.ts`, `src/types.ts` (optional: drop `community_images`/
`community_videos` decls if fully unused), `src/components.tsx` (drop the empty-default init if
the fields are removed from the type), `main.py`, and the community tests under `tests/`.

**Out of scope:** any change to the native passthrough behavior; matching; the delisted index;
the QAM; anything not part of removing the dead scraped-UGC path.

**Slug used throughout this plan:** `community-feed-cleanup`

---

## Orchestration Contract

**Slug:** `community-feed-cleanup`

**Plan file:**

```text
docs/plans/2026-07-02_community-feed-cleanup.md
```

**Implementation branch:**

```text
feat/community-feed-cleanup
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/community-feed-cleanup_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/community-feed-cleanup_finalized
```

**Review notes:**

```text
docs/review/community-feed-cleanup-review-*.md
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
git checkout -b feat/community-feed-cleanup
```

Commit this plan first:

```bash
git add docs/plans/2026-07-02_community-feed-cleanup.md
git commit -m "docs(plan): add community-feed-cleanup implementation plan"
```

---

## Implementation Tasks

This is a deletion/cleanup. Work in dependency order (leaves first) and lean on the compiler and
grep to prove each symbol is unreferenced **before** deleting it. `tsconfig.json` has
`strict: false` and no `noUnusedLocals`, so an unused symbol will NOT fail `tsc` — you must grep.

1. **Gate diagnostics behind the debug toggle (don't delete them).**
   - In `main.py`, change `frontend_log` (~922) to log at DEBUG: pass `level=logging.DEBUG` into
     its `_plog(...)` call. This silences all frontend `[playhub:trace|nav|community]` output when
     the debug toggle is off and restores it when on. Verify the toggle path
     (`_apply_debug_logging` / `set_debug_logging`) still sets the logger level as before.
   - Audit backend `_plog(...)` diagnostic calls that still default to INFO and are per-event
     noise; move those to `level=logging.DEBUG`. Leave lifecycle (load/ready) and warnings/errors
     as-is.
   - In `src/steam.ts`, delete the redundant `frontendLog("community", "feed url seen", …)` line
     inside `patchFeedMethod`. Keep the `"feed passthrough"` log and the passthrough logic
     untouched (it is now DEBUG-gated via the `frontend_log` change).

2. **Confirm the passthrough is the only feed consumer.** `grep -rn "communityHubPageForApp" src/`
   must show only its own definition (no caller). If anything still calls it, STOP and note it in
   the session log — the plan's premise is that it is dead.

3. **Delete the dead frontend chain** in `src/steam.ts`, verifying each is unreferenced by grep
   immediately before deletion:
   - `communityHubPageForApp`
   - `steamCommunityItemsFromMetadata`, `steamCommunityItemsFromImages`, `interleavedCommunityMedia`
   - each `playhubCommunity*` helper (`playhubCommunityId`, `playhubCommunityCreator`,
     `playhubCommunityProviderIcon`) **only if** no remaining reference exists.
   - Remove the now-unused `getSteamCommunityPage` import at `src/steam.ts:12`.

4. **Remove the `getSteamCommunityPage` callable** in `src/backend.ts` (~66) if grep shows no
   remaining frontend reference.

5. **Delete the dead backend chain** in `main.py`, again grep-verifying each before removal:
   - the `get_steam_community_page` async callable (~983) and any `_..._sync` helper it delegated to
   - `_enrich_community_media_sync` (~1795) **and its call site (~980)** in the metadata pipeline
   - `_steam_community_ugc_for_appid`, `_parse_steam_community_ugc`, `_steam_community_image_url`,
     `_steam_community_link_url`, `_steam_sharedfile_id`, and any other `_steam_community_*` UGC
     helper left unreferenced after the above go.
   - Stop writing `community_images` / `community_videos` into the metadata dict (~1739, ~1813,
     ~2161). Remove those keys from the enrichment output.
   - Preserve `import html` if `html.unescape` is still used elsewhere; only remove it if grep
     shows no remaining use.

6. **Prune the now-orphaned types** if fully unused after step 5:
   - `src/types.ts:21-22` (`community_images?`, `community_videos?`) and the `MetadataScreenshot`/
     `MetadataVideo` types **only if** they have no other consumer.
   - `src/components.tsx:307-308` empty-default init for those fields.

7. **Update tests.** Remove/adjust tests that exercised the deleted scraped-UGC path:
   - `tests/test_community_steam_only.py` — the parser tests are obsolete; delete the file (or
     reduce it to only whatever still applies). Record the rationale in the session log.
   - Do NOT weaken any surviving test to make the build pass.
   - **Keep `tests/test_no_unsafe_stdlib_imports.py`** and `tests/test_no_duplicate_methods.py`.
   - Add a focused test asserting the **passthrough contract**: given a non-Steam shortcut with a
     matched `steam_appid`, the `appcommunityfeed/<shortcutId>` request is rewritten to
     `appcommunityfeed/<steam_appid>` and delegated to the native client (mock/patch the http
     client and assert the URL passed to `original`). If a frontend unit-test harness is not
     practical, document why in the session log and cover the appid-rewrite helper logic instead.

8. **Rebuild** (`npm run build`) so `dist/index.js` reflects the source, and commit `dist/` (it is
   tracked in this repo).

9. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9 noting: the native
   passthrough is the surviving mechanism; the scraped-UGC pipeline (including the
   `fix-htmlparser-import` regex parser) was removed as dead code; and any symbol you chose to keep
   because grep still found a consumer.

### Scope discipline

Deletion only, plus the one diagnostic-line removal and the passthrough test. **Do not** modify the
passthrough logic, matching, delisted, or QAM. If a symbol you expected to be dead still has a
live consumer, keep it and note it — do not chase refactors beyond removing the scraped-UGC path.

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
# No dead symbols remain (each must print nothing):
grep -rn "communityHubPageForApp\|steamCommunityItemsFrom\|interleavedCommunityMedia" src/ | grep -v dist
grep -rn "_enrich_community_media_sync\|_parse_steam_community_ugc\|_steam_community_ugc_for_appid\|get_steam_community_page" main.py
# Passthrough survives (must print the appid-rewrite passthrough, not the scraped path):
grep -n "feed passthrough\|appcommunityfeed" src/steam.ts
scripts/orchestration/run-quality-gates    # tsc + rollup build + py_compile + full pytest
git status --short                           # clean
```

Expected: the scraped-UGC symbols are gone; the `appcommunityfeed` appid-rewrite passthrough and
its `"feed passthrough"` log remain; the `"feed url seen"` line is gone; full gate green; tree
clean; `dist/index.js` rebuilt and committed.

Deferred verification (requires hardware — performed by the human/orchestrator):

1. Rebuild from `dev`, sideload.
2. Open a matched non-Steam shortcut (e.g. **Warhammer 40,000: Space Marine**, matched to appid
   `55150`) → **Community** tab still populates with the real Steam feed and paginates on scroll —
   i.e. **no regression** from the shipped fix.
3. **Debug toggle gates diagnostics.** With the QAM debug-logging toggle **off**, open the
   Community tab and navigate around — the plugin log shows **no** `[playhub:trace|nav|community]`
   lines. Turn the toggle **on**, repeat — the diagnostics (including `[playhub:community] feed
   passthrough …`) now appear. Confirm the `feed url seen` line is gone entirely.
4. A real Steam game's Community tab is unaffected.
5. Confirm scan/metadata still works (the removed community-enrichment calls must not have taken
   anything else with them).

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished community-feed-cleanup
```

This writes:

```text
/tmp/Playhub-Metadata-local/community-feed-cleanup_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer community-feed-cleanup`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/community-feed-cleanup-review-*.md
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
   scripts/orchestration/clear-finished community-feed-cleanup
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
   git add docs/review/community-feed-cleanup-review-*.md
   git commit -m "docs(review): record community-feed-cleanup review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished community-feed-cleanup
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer community-feed-cleanup` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed community-feed-cleanup
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize community-feed-cleanup
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/community-feed-cleanup_finalized
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
scripts/orchestration/finalize community-feed-cleanup
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/community-feed-cleanup_finished
/tmp/Playhub-Metadata-local/community-feed-cleanup_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
