# Plan: Restore Community Videos (community-video-restoration)

## Context

**Slug used throughout this plan:** `community-video-restoration`

### Problem and outcome

The shipped community fallback (see `docs/specs/community-fallback.md`) populates a
non-Steam shortcut's Community tab with **image** cards from stored IGN
screenshots. The original PlayHub implementation (commit `6ddc9de`) also surfaced
**videos**: it scraped YouTube search results per game title, stored them as
`community_videos`, and rendered them alongside screenshots. This plan restores
videos as an **additive** source. Outcome: for a non-Steam shortcut with matched
metadata, the Community tab shows video cards (thumbnail + YouTube provider icon)
that play/open the video when activated, alongside the existing screenshot cards.

### Relevant files

- `backend/providers/community.py` — current fallback converters + fetch helpers.
- `main.py` — `get_community_fallback_page` RPC, metadata enrichment/save path,
  `_http_text` (bounded read), `_sanitize_screenshots`.
- `src/communityFeed.ts` — `fallbackPageToNativeHub` (card synthesis),
  `CommunityFallbackItem` consumers.
- `src/types.ts` — `CommunityFallbackItem`, `MetadataData`.
- Tests: `tests/test_community_fallback.py`, `src/communityFeed.test.ts`.
- Reference only (do not copy blindly): `6ddc9de:main.py`
  `_youtube_videos_for_title`, `_sanitize_videos`; `6ddc9de:src/types.ts`
  `MetadataVideo` (`id,title,url,thumbnail,source`).

### Load-bearing decisions (settled here)

1. **Fetch and persist during enrichment, never on render.** Videos are not
   currently stored. Fetch them best-effort during the existing metadata
   fetch/enrichment path and persist as `community_videos` on the record, so the
   fallback RPC serves them from stored data. Do NOT call YouTube synchronously
   inside `get_community_fallback_page` — that would add network latency to every
   Community-tab open.
2. **Best-effort source.** YouTube search scraping is markup-fragile and
   rate-limitable. Every fetch uses a bounded read + timeout, preserves TLS, and
   returns `[]` on any error or parse miss. Zero videos is acceptable; a crash or
   hang is not.
3. **Video cards must play the video, not open the image lightbox.** Screenshot
   cards are `type:5` and open Steam's native image lightbox; a video card must
   instead play/open the YouTube video. The native card fields that trigger video
   playback are not settled by the current code and are confirmed by the deferred
   on-device verification below; implement the default in Task 4 and adjust per
   review notes if on-device playback fails.

### Constraints

Additive only — do not regress the shipped screenshot fallback, the native
passthrough, the community vote patch, or `isDeckyCommunityId`. Backend is Python
standard library + Decky runtime only (no new third-party deps).

---

## Orchestration Contract

**Slug:** `community-video-restoration`

**Plan file:**

```text
docs/plans/2026-07-12_community-video-restoration.md
```

**Implementation branch:**

```text
feat/community-video-restoration
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/community-video-restoration_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/community-video-restoration_finalized
```

**Review notes:**

```text
docs/review/community-video-restoration-review-*.md
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
git checkout -b feat/community-video-restoration
```

Commit this plan first:

```bash
git add docs/plans/2026-07-12_community-video-restoration.md
git commit -m "docs(plan): add community-video-restoration implementation plan"
```

---

## Implementation Tasks

Work in order, TDD where testable. Before changing code, run `scripts/decky
doctor` and `scripts/decky verify-change dev --explain` per `AGENTS.md`.

### 1. Backend — YouTube video provider (pure, best-effort)

- Add video fetching to `backend/providers/community.py`. Port the intent of
  `6ddc9de:main.py` `_youtube_videos_for_title` and `_sanitize_videos` as pure
  functions that take an injected `http_text` callable (like the existing scraper
  helpers), not `Plugin` methods.
- Define `YOUTUBE_SEARCH_URL = "https://www.youtube.com/results"`. Query
  `"<clean title> game trailer gameplay"`. Parse `"videoId":"<11-char id>"`
  matches, dedupe, cap at 10, and build `{id,title,url,thumbnail,source}` with
  `url = https://www.youtube.com/watch?v=<id>` and default
  `thumbnail = https://i.ytimg.com/vi/<id>/hqdefault.jpg`.
- Enforce a bounded/timed read (reuse the community bounded-fetch path, 15s /
  4 MiB) and return `[]` on any exception or when no ids parse. Never raise.
- Add a sanitize helper validating 11-char `[A-Za-z0-9_-]` ids, deduping, and
  normalizing thumbnail via the existing `https_url` gate.

### 2. Backend — persist `community_videos` via enrichment

- Add `community_videos` to the stored metadata record, populated during the
  existing metadata fetch/enrichment path (mirror the original
  `_enrich_community_media_sync` intent). Sanitize on write with the Task 1
  helper. The fetch is best-effort and must never block or fail the metadata
  save.
- Do not fetch videos anywhere on the Community-tab render path.

### 3. Backend — surface videos through the fallback RPC

- Extend `get_community_fallback_page` so stored `community_videos` are returned
  as fallback items, marked as video via a new item field (e.g. `youtube_id`;
  empty for image items), with `image_url` = thumbnail and `link` = the YouTube
  watch URL. Keep page clamping and 20-item slicing. Order a bounded number of
  videos before screenshots on page 1.
- Remain read-only: no writes, no synchronous YouTube fetch.

### 4. Frontend — video cards

- Extend `CommunityFallbackItem` (`src/types.ts`) with the video marker
  (`youtube_id: string`, empty for images).
- In `fallbackPageToNativeHub` (`src/communityFeed.ts`), when `youtube_id` is
  set, emit a **video** card: the YouTube provider icon
  (`PLAYHUB_COMMUNITY_YOUTUBE_ICON`) on all avatar fields, the thumbnail as
  `preview_image_url`/`full_image_url`, and the YouTube watch URL in
  `url`/`link`/`external_url`/`strURL`. Default the card so activation plays/opens
  the video rather than the image lightbox: set `youtube_video_id` to the id and
  use the native video card `type` (video hub cards use `type:2`; if on-device
  verification shows a different type/field is required for playback, adjust to
  match). Image cards keep the shipped `type:5` shape unchanged.
- Gate all video-card behavior behind `youtube_id` so screenshot rendering is
  byte-for-byte unaffected when no videos exist.

### 5. Tests

- Backend: the parser extracts ids from a fixture YouTube results page; the
  sanitizer validates/dedupes/caps; error and empty inputs return `[]`; the
  fallback RPC includes video items with `youtube_id`, thumbnail `image_url`, and
  watch-URL `link`. Existing screenshot/scraper/page-clamp tests stay green.
- Frontend (`src/communityFeed.test.ts`): `fallbackPageToNativeHub` emits a video
  card with the YouTube icon, watch-URL open fields, `youtube_video_id`, and the
  video `type`; an items list with no `youtube_id` produces the unchanged
  screenshot cards.

### 6. Docs

- Update `docs/specs/community-fallback.md` to document videos as an additive
  source (best-effort YouTube fetch during enrichment; `community_videos`
  storage; video cards play the watch URL). Record a session log in
  `docs/agent_conversations/`.

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

This must pass `tsc --noEmit`, the rollup build (regenerate `dist/index.js` when
the frontend changed), vitest, `main.py` byte-compile, pytest, version-drift, and
`git diff --check`. Also confirm, with the backend YouTube fetch forced to fail
(empty/error), that enrichment and `get_community_fallback_page` still succeed and
screenshot cards are unchanged.

**Deferred on-device verification (manual; required before this change ships).**
This touches `src/steam/` and the backend, so it is not exercised by the static
gates or by `scripts/decky verify-change --device` (that deploys only the frontend
bundle — a backend change needs a full-plugin install via `scripts/decky
package-push --build --push` then a Decky-UI install; see
`docs/runbooks/on-device-verification.md`). Deferred acceptance checks:

1. On a fixture with matched metadata, the Community tab shows video cards
   (thumbnail + YouTube provider icon) alongside screenshot cards; page slicing
   and the empty-page behavior are unchanged.
2. Activating a video card **plays/opens the YouTube video** (Steam in-app
   browser or player) — it does not open the still-image lightbox. If the Task 4
   default card `type`/fields do not produce playback on-device, that is a
   review-note follow-up to adjust the type/field, not a reason to block the
   round on a check the static gates cannot perform.
3. `scripts/deck/verify/run_all.sh` (quick-links, re-render, community smokes)
   stays green; no game launch without explicit `--allow-launch`.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished community-video-restoration
```

This writes:

```text
/tmp/Decky-Metadata/community-video-restoration_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer community-video-restoration`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/community-video-restoration-review-*.md
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
   scripts/orchestration/clear-finished community-video-restoration
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
   git add docs/review/community-video-restoration-review-*.md
   git commit -m "docs(review): record community-video-restoration review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished community-video-restoration
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer community-video-restoration` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed community-video-restoration
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize community-video-restoration
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/community-video-restoration_finalized
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
scripts/orchestration/finalize community-video-restoration
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/community-video-restoration_finished
/tmp/Decky-Metadata/community-video-restoration_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
