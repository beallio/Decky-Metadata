# Plan: Revert Community YouTube to IGN Screenshots (revert-community-youtube)

## Context

**Slug used throughout this plan:** `revert-community-youtube`

### Problem and outcome

The community-tab YouTube video feature (added across `community-video-restoration`,
`live-community-media`, and `community-video-card-render`) never renders on-device:
the backend delivers video items correctly, but Steam's native PlayHub does not
render our synthetic video cards (confirmed on-device — `type: 2` renders nothing;
`type: 5` with the YouTube thumbnail and even real dimensions still does not
appear, while IGN screenshot cards render fine). We are giving up on YouTube in the
Community tab.

**Outcome:** the Community tab falls back to **persisted IGN screenshots only** —
the original behavior before any YouTube work. The backend serves the stored
`record["screenshots"]` (no live fetch, no YouTube scrape); the frontend emits only
`type: 5` screenshot cards. All YouTube fetching, storage, video-card synthesis,
and the live/no-cache refetch (whose sole purpose was fresh videos-per-access) are
removed.

### Load-bearing decisions (settled)

- **Persisted screenshots, not live.** `get_community_fallback_page` serves
  `community_provider.metadata_screenshots_to_fallback_items(record["screenshots"],
  page, source_url)` again. Remove `_live_community_media_sync` entirely — no live
  IGN GraphQL fetch and no YouTube fetch on the render path.
- **No `youtube_id` anywhere.** Remove the `youtube_id` field from
  `CommunityFallbackItem` and stop emitting it from every item builder. The
  frontend has no video branch; all fallback cards are the shipped `type: 5`
  screenshot shape.
- **Keep the non-YouTube wins.** Do NOT revert the gap-fill precedence in
  `_metadata_scan_match_sync`, the circular-import fix (`contextMenuPatch` importing
  from `./steam/core`), or the smoke-fixture launcher exclusion in
  `select_fixtures.py`. Those are unrelated to YouTube and stay.

### Revert surface

- `main.py` — `get_community_fallback_page` (~504-509): replace the
  `_live_community_media_sync` call with the persisted-screenshot path and restore
  the `label = str(record.get("source") or "").strip() or "Metadata"` +
  `items = [{**item, "author": label} for item in items]` logic. Delete the
  `_live_community_media_sync` method (~518+).
- `backend/providers/community.py` — remove YouTube-only code:
  `YOUTUBE_SEARCH_URL` (15), `_valid_https_url` (243; only used by videos),
  `sanitize_videos` (249), `_youtube_title` (281), `fetch_youtube_videos` (296),
  `metadata_videos_to_fallback_items` (329), `metadata_media_to_fallback_items`
  (346, the video+screenshot combiner), and the now-unused `import json` (4).
  Remove the `"youtube_id": ""` entries from `_metadata_screenshot_items` (~200)
  and `steam_cards_to_fallback_items` (~171). Keep
  `metadata_screenshots_to_fallback_items` and the Steam-scrape path.
- `src/communityFeed.ts` — remove `PLAYHUB_COMMUNITY_YOUTUBE_ICON` (3), the
  `youtube` branch in `communityProviderIcon` (80), and the `isVideo` / `youtube_id`
  logic in `fallbackPageToNativeHub` (~98-99+). All cards use the screenshot
  `sourceLabel`/`type: 5` path.
- `src/types.ts` — remove `youtube_id: string` from `CommunityFallbackItem` (51).
- Tests: `tests/test_community_fallback.py` (remove YouTube/live-RPC tests, restore
  persisted-screenshot RPC assertions), `src/communityFeed.test.ts` (remove the
  video-card test, drop `youtube_id` from fixtures).
- Docs: `docs/specs/community-fallback.md`.

### Constraints

- Backend is Python standard library + Decky runtime only.
- `dev` is local-only; never push to origin, never merge to `main` here.
- Do not regress the native community passthrough, the community vote patch,
  `isDeckyCommunityId`, the Steam-scrape fallback, the gap-fill precedence, the
  circular-import fix, or the smoke-fixture fix. Screenshot cards keep the shipped
  `type: 5` shape.

---

## Orchestration Contract

**Slug:** `revert-community-youtube`

**Plan file:**

```text
docs/plans/2026-07-12_revert-community-youtube.md
```

**Implementation branch:**

```text
feat/revert-community-youtube
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/revert-community-youtube_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/revert-community-youtube_finalized
```

**Review notes:**

```text
docs/review/revert-community-youtube-review-*.md
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
git checkout -b feat/revert-community-youtube
```

Commit this plan first:

```bash
git add docs/plans/2026-07-12_revert-community-youtube.md
git commit -m "docs(plan): add revert-community-youtube implementation plan"
```

---

## Implementation Tasks

Work in order, TDD where testable. Before changing code, run `scripts/decky
doctor` and `scripts/decky verify-change dev --explain` per `AGENTS.md`.

### 1. Backend — serve persisted IGN screenshots; delete the live path

In `main.py` `get_community_fallback_page`, replace the `_live_community_media_sync`
block with the persisted-screenshot path:

```python
items = community_provider.metadata_screenshots_to_fallback_items(
    record.get("screenshots"), clean_page, record.get("source_url")
)
source = "metadata" if items else "none"
if items:
    label = str(record.get("source") or "").strip() or "Metadata"
    items = [{**item, "author": label} for item in items]
```

Keep the `_plog("community", "fallback selected", ...)` call and the Steam-scrape
branch above it unchanged. Delete the `_live_community_media_sync` method.

### 2. Backend — remove YouTube code from the provider

In `backend/providers/community.py` remove `YOUTUBE_SEARCH_URL`,
`_valid_https_url`, `sanitize_videos`, `_youtube_title`, `fetch_youtube_videos`,
`metadata_videos_to_fallback_items`, `metadata_media_to_fallback_items`, and the
now-unused `import json`. Remove the `"youtube_id": ""` key from the dicts built by
`_metadata_screenshot_items` and `steam_cards_to_fallback_items`. Leave
`metadata_screenshots_to_fallback_items`, `_metadata_screenshot_items`, the
Steam-scrape parser/fetch, and all other helpers intact. Confirm no remaining
references to any removed symbol (`grep`).

### 3. Frontend — remove the video-card branch

In `src/communityFeed.ts`: delete `PLAYHUB_COMMUNITY_YOUTUBE_ICON`, the
`if (cleanSource.includes("youtube")) ...` line in `communityProviderIcon`, and the
`isVideo`/`youtube_id` handling in `fallbackPageToNativeHub` so `sourceLabel` and
the card are built only from the screenshot/Steam-scrape path (unchanged `type: 5`
shape). In `src/types.ts`, remove `youtube_id: string` from `CommunityFallbackItem`.
Regenerate `dist/index.js` via the build.

### 4. Tests

- `tests/test_community_fallback.py`: remove tests exercising
  `fetch_youtube_videos`, `sanitize_videos`, `metadata_videos_to_fallback_items`,
  `metadata_media_to_fallback_items`, and the live-RPC/no-persist behavior. Ensure a
  test asserts `get_community_fallback_page` returns persisted-screenshot items
  (`source: "metadata"`, `author` = the record source label, no `youtube_id`) and
  that the Steam-scrape branch and page clamping still pass.
- `src/communityFeed.test.ts`: remove the YouTube video-card test; drop `youtube_id`
  from the screenshot fixture; keep the screenshot-card assertions
  (`type === 5`, provider icon, watch/link fields) green.

### 5. Docs

Update `docs/specs/community-fallback.md` to describe the Community fallback as
persisted IGN screenshots only (no live fetch, no YouTube). Remove the live-media
and video-card sections. Record a session log in `docs/agent_conversations/`.

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

Static gates (run and confirm green before the round-complete marker):

```bash
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
```

This must pass `tsc --noEmit`, the rollup build (regenerate `dist/index.js`),
vitest, `main.py` byte-compile, pytest, version-drift, and `git diff --check`.
Additionally confirm:

- `grep -rn "youtube" backend/ main.py src/` returns no functional references
  (only unrelated matches, if any); no dangling imports or dead symbols remain.
- The gap-fill precedence, the `contextMenuPatch` → `./steam/core` import, and the
  `select_fixtures.py` launcher exclusion are still present (this revert must not
  touch them).
- A unit check that `get_community_fallback_page` returns persisted-screenshot
  items with no `youtube_id` and never performs a live fetch (no network on the
  render path).

**Deferred on-device verification (manual; required before this change ships to
`main`; full-plugin install per `docs/runbooks/on-device-verification.md`):**

1. On a never-on-Steam game (e.g. Mario Kart `3462906031`), the Community tab shows
   IGN screenshot cards and **no** YouTube cards; empty-page/slicing behavior is
   unchanged.
2. A Steam-matched game still shows the native/Steam-scrape community content.
3. `scripts/deck/verify/run_all.sh` community smoke stays green.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished revert-community-youtube
```

This writes:

```text
/tmp/Decky-Metadata/revert-community-youtube_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer revert-community-youtube`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/revert-community-youtube-review-*.md
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
   scripts/orchestration/clear-finished revert-community-youtube
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
   git add docs/review/revert-community-youtube-review-*.md
   git commit -m "docs(review): record revert-community-youtube review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished revert-community-youtube
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer revert-community-youtube` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed revert-community-youtube
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize revert-community-youtube
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/revert-community-youtube_finalized
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
scripts/orchestration/finalize revert-community-youtube
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/revert-community-youtube_finished
/tmp/Decky-Metadata/revert-community-youtube_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
