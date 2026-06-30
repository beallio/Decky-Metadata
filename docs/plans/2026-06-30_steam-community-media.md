# Plan: Swap community section to official Steam media (steam-community-media)

## Context

For a Steam-matched non-Steam game, the app page's **Community** section is still populated
from the plugin's fabricated `community_images` / `community_videos` (RAWG/IGN web images +
YouTube search tiles), not from Steam. The user wants it to show **real Steam content**.

We already fetch the matched app's `appdetails` (`_steam_appdetails_for_appid`, main.py ~1973)
and build official **Steam screenshots** from `data.screenshots` (`path_full` /
`path_thumbnail`, main.py:2062-2074) into `details["screenshots"]`, which the appdetails merge
applies as the source of truth. The Community section reads `community_images` /
`community_videos`; `community_images` accepts plain-URL screenshots, while `community_videos`
is **YouTube-only** (`_sanitize_videos` requires an 11-char YouTube id, so Steam's mp4/webm
trailers can't go there without frontend video work — out of scope).

So the clean swap: for matched games, set `community_images` to the **official Steam
screenshots** and clear the fabricated `community_videos`, so the Community section shows real
Steam media instead of IGN/YouTube tiles. The frontend (`steamCommunityItemsFromMetadata`,
src/steam.ts:607, reading `community_images`/`community_videos`) needs no change.

Seam: the appdetails block in `_metadata_with_steam_news_sync` (main.py ~1675-1690, where
`steam_details = self._steam_appdetails_for_appid(...)` is merged over `next_metadata`).

**Intended outcome:** matched games' Community section shows the matched app's official Steam
screenshots (real Steam), with the fabricated IGN images and YouTube tiles removed. Unmatched
games (no appdetails) are unchanged. Note: this is *official* Steam media, not user-generated
UGC (UGC would need a Steam Web API key / scraping — a possible later layer).

**Out of scope:** Steam trailers/movies in the video slot (needs frontend video rendering);
real user-generated community content; the `appid`-for-delisted and button-hide items.

**Slug used throughout this plan:** `steam-community-media`

---

## Orchestration Contract

**Slug:** `steam-community-media`

**Plan file:**

```text
docs/plans/2026-06-30_steam-community-media.md
```

**Implementation branch:**

```text
feat/steam-community-media
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/steam-community-media_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/steam-community-media_finalized
```

**Review notes:**

```text
docs/review/steam-community-media-review-*.md
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
git checkout -b feat/steam-community-media
```

Commit this plan first:

```bash
git add docs/plans/2026-06-30_steam-community-media.md
git commit -m "docs(plan): add steam-community-media implementation plan"
```

---

## Implementation Tasks

Backend-only, `main.py`. TDD (stub `_http_json`).

1. **Have `_steam_appdetails_for_appid` also return `community_images`** built from the same
   official Steam screenshots it already computes. Where it builds `screenshots` (main.py:2062),
   after `if screenshots: details["screenshots"] = screenshots`, also set
   `details["community_images"] = screenshots` (reuse the same sanitized list). Only set it
   when there are screenshots.

2. **Clear the fabricated community videos for matched games** in `_metadata_with_steam_news_sync`
   (main.py, the `if steam_details:` merge block). The generic merge already copies
   `community_images` over when present. Immediately after that merge block (still under
   `if steam_details:`), explicitly clear the YouTube tiles:
   `next_metadata["community_videos"] = []`
   (do this only when `steam_details` is truthy — i.e. appdetails succeeded — so unmatched
   games keep their existing behavior). Also bump `next_metadata["community_enriched_at"] =
   now()` so the frontend treats the community as enriched.

3. **Tests** `tests/test_steam_community_media.py` (harness; stub `_http_json` — no network):
   - a stubbed appdetails payload with `screenshots` → `_steam_appdetails_for_appid` returns a
     dict whose `community_images` equals its `screenshots` (sanitized, `path_full` URLs);
   - drive `_metadata_with_steam_news_sync` (with `_steam_news_for_metadata` stubbed to return
     a `steam_appid`, `_steam_deck_compat_for_appid` stubbed, and `_steam_appdetails_for_appid`
     stubbed to return `{"community_images": [<screenshot>]}`) and assert the result's
     `community_images` are the Steam ones and `community_videos == []`;
   - when `_steam_appdetails_for_appid` returns `None` (unmatched / no appdetails), assert the
     incoming `community_images`/`community_videos` are left untouched.

4. **Scope discipline:** only the `community_images` addition in `_steam_appdetails_for_appid`
   and the `community_videos` clear in the appdetails merge. Do not change matching, the other
   appdetails fields, the frontend, or non-matched behavior. No npm deps; no
   `from __future__ import annotations` change.

5. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9.

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
uv run --with pytest -- pytest -q tests/test_steam_community_media.py
scripts/orchestration/run-quality-gates    # tsc + build + py_compile + full pytest
git status --short                          # clean
```

Expected: the new test passes (community_images = Steam screenshots; community_videos cleared
for matched; untouched when no appdetails); full gate green; tree clean.

Deferred verification (requires hardware — performed by the human/orchestrator):

1. Rebuild from `dev`, sideload, tap **Clear cache** (so matches re-enrich with the new
   community media).
2. Open a matched game (e.g. Wobbly Life / Space Marine) and confirm the **Community** section
   now shows the matched app's **Steam screenshots** instead of the IGN/RAWG/YouTube tiles.
3. Confirm unmatched games are unchanged.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished steam-community-media
```

This writes:

```text
/tmp/Playhub-Metadata-local/steam-community-media_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer steam-community-media`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/steam-community-media-review-*.md
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
   scripts/orchestration/clear-finished steam-community-media
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
   git add docs/review/steam-community-media-review-*.md
   git commit -m "docs(review): record steam-community-media review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished steam-community-media
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer steam-community-media` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed steam-community-media
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize steam-community-media
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/steam-community-media_finalized
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
scripts/orchestration/finalize steam-community-media
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/steam-community-media_finished
/tmp/Playhub-Metadata-local/steam-community-media_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
