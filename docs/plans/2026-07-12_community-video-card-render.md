# Plan: Community Video Card Rendering Fix (community-video-card-render)

## Context

**Slug used throughout this plan:** `community-video-card-render`

### Problem and outcome

The live community fallback (merged in `live-community-media`) correctly delivers
YouTube video items to the Community tab of a non-Steam game — verified on-device:
the backend returns 20 items (10 videos ordered first, then 10 screenshots) and the
frontend builds a 20-card hub. **But the video cards do not render.** On-device CDP
inspection of Mario Kart's (`3462906031`) Community tab found **0 YouTube
thumbnails** (`i.ytimg.com`) rendered and only screenshot thumbnails visible, even
though videos are ordered first in the hub.

Root cause: `fallbackPageToNativeHub` emits video cards as `type: 2` +
`youtube_video_id` (a guess the `live-community-media` plan explicitly deferred for
on-device confirmation). This Steam build's native PlayHub renderer does **not**
render `type: 2` cards — they produce no visible element — so the videos are
invisible while `type: 5` (screenshot) cards render fine.

**Outcome:** video items render as visible cards in the Community tab (YouTube
thumbnail + YouTube provider icon), and activating a video card opens the YouTube
watch URL (Steam in-app browser). Screenshot cards remain unchanged.

### Load-bearing decisions (settled)

- **Render video items as `type: 5` image cards** — the shape that already renders
  in this build — using the YouTube thumbnail as `preview_image_url` /
  `full_image_url` and the YouTube provider icon on the avatar fields. Do NOT use
  `type: 2` or `youtube_video_id`; they are unsupported here.
- **Distinguish video vs screenshot by the item's `youtube_id`** (backend already
  sets it for videos, empty for screenshots). Keep that gating; only the emitted
  card `type`/fields change.
- **Activation must open the watch URL, not the still-image lightbox.** A plain
  `type: 5` card opens Steam's image lightbox on the `full_image_url`. Determine
  on-device (CDP) which field/hook makes the PlayHub card navigate to the external
  URL (`url` / `external_url` / `strURL` / an `onActivate`-style prop) and set it so
  clicking a video card opens the YouTube watch URL. If no native field redirects
  the click, that adjustment is a review-note follow-up — do not regress the
  now-visible cards while chasing click behavior.

### Relevant files

- `src/communityFeed.ts` — `fallbackPageToNativeHub` (~95-140): the `isVideo`
  branch sets `type: isVideo ? 2 : 5` (line ~112) and spreads `youtube_video_id`
  (line ~122). This is what changes.
- `src/communityFeed.test.ts` — the "maps stored YouTube videos to native video
  cards" test (~59-85) asserts `type === 2` and `youtube_video_id`; it must be
  updated to the `type: 5` + watch-URL-click shape. The unchanged-screenshot-card
  test (~38-39, asserts `type === 5`, no `youtube_video_id`) must stay green.
- Reference: on-device CDP tooling (`scripts/deck/cdp.py`, tunnel) and
  `docs/runbooks/on-device-verification.md`.

### Constraints

- Frontend-only change; do not touch the backend fallback RPC or the live-media
  behavior. Screenshot-card rendering must be byte-for-byte unchanged.
- `dev` is local-only; never push to origin, never merge to `main` here.
- Backend still emits `youtube_id` on video items — do not remove it; it is the
  render-time discriminator.

---

## Orchestration Contract

**Slug:** `community-video-card-render`

**Plan file:**

```text
docs/plans/2026-07-12_community-video-card-render.md
```

**Implementation branch:**

```text
feat/community-video-card-render
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/community-video-card-render_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/community-video-card-render_finalized
```

**Review notes:**

```text
docs/review/community-video-card-render-review-*.md
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
git checkout -b feat/community-video-card-render
```

Commit this plan first:

```bash
git add docs/plans/2026-07-12_community-video-card-render.md
git commit -m "docs(plan): add community-video-card-render implementation plan"
```

---

## Implementation Tasks

Work in order, TDD where testable. Before changing code, run `scripts/decky
doctor` and `scripts/decky verify-change dev --explain` per `AGENTS.md`.

### 1. Render video items as `type: 5` image cards

In `fallbackPageToNativeHub` (`src/communityFeed.ts`), keep the `isVideo =
Boolean(item.youtube_id)` gate but change the emitted card so a video item is a
`type: 5` card (not `type: 2`):

- `type` is `5` for both video and screenshot items.
- Remove the `youtube_video_id` spread (this build ignores it).
- Video items keep: the YouTube provider icon on all avatar fields (already keyed
  off `sourceLabel` → `communityProviderIcon` returning the YouTube icon), the
  YouTube thumbnail (`item.image_url`) as `preview_image_url` / `full_image_url`,
  and the watch URL (`item.link`) in the click-through fields
  (`url`/`link`/`external_url`/`strURL`).
- Screenshot items (`youtube_id` empty) must produce a byte-for-byte unchanged
  card.

### 2. Make activation open the watch URL (on-device determination)

A plain `type: 5` card opens Steam's image lightbox on `full_image_url`. Using the
on-device CDP tooling (`scripts/deck/cdp.py`, tunnel per
`docs/runbooks/on-device-verification.md`), inspect how this build's PlayHub card
resolves a click and set the field(s) so a video card navigates to the YouTube
watch URL instead of opening the lightbox. Candidates already populated:
`url`/`external_url`/`strURL`; also inspect whether the card component reads an
`onActivate`/`navigateTo`/`clickURL`-style prop. Implement the smallest change that
makes a video card open the watch URL.

If on-device inspection shows no native field redirects the click for a `type: 5`
card, record that finding in the session log and leave the video cards rendering
(task 1) with the lightbox-on-thumbnail behavior as a documented interim; do not
regress the now-visible cards. The click-to-YouTube refinement then becomes a
follow-up review-note item.

### 3. Tests

Update `src/communityFeed.test.ts`:

- Change the "maps stored YouTube videos" test to assert the new shape: `type ===
  5`, **no** `youtube_video_id` property, `preview_image_url` contains the video id
  (thumbnail), `full_image_url === preview_image_url`, the avatar fields equal the
  YouTube provider icon (`data:image/png;base64,` prefix), and
  `url`/`link`/`external_url`/`strURL` equal the watch URL.
- Keep the unchanged-screenshot-card test green (`type === 5`, no
  `youtube_video_id`).
- If task 2 adds an activation field, assert it is set for video items and absent
  for screenshot items.

### 4. Docs

Update `docs/specs/community-fallback.md` to state video cards render as `type: 5`
image cards (YouTube thumbnail + provider icon) that open the watch URL, and record
a session log in `docs/agent_conversations/` (include the CDP finding from task 2).

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
Confirm the updated frontend tests assert the `type: 5` video-card shape and the
screenshot-card test is unchanged/green.

**Deferred on-device verification (manual; required before this change ships to
`main`; full-plugin install per `docs/runbooks/on-device-verification.md` —
`scripts/decky package-push --build --push` then a Decky-UI install):**

1. On a never-on-Steam game (Mario Kart `3462906031` or Super Mario Bros. Wonder
   `2977244592`), the Community tab shows **video cards with YouTube thumbnails**
   (`i.ytimg.com`) and the YouTube provider icon — confirm via CDP that
   `i.ytimg.com` thumbnails now render (the pre-fix count was 0).
2. Activating a video card **opens the YouTube watch URL** in Steam's in-app
   browser (not the still-image lightbox). If task 2 concluded no native field
   redirects the click, confirm instead that the cards at least render and note the
   interim lightbox behavior.
3. Screenshot cards still render unchanged; page slicing and empty-page behavior
   are unaffected.
4. `scripts/deck/verify/run_all.sh` community smoke stays green.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished community-video-card-render
```

This writes:

```text
/tmp/Decky-Metadata/community-video-card-render_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer community-video-card-render`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/community-video-card-render-review-*.md
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
   scripts/orchestration/clear-finished community-video-card-render
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
   git add docs/review/community-video-card-render-review-*.md
   git commit -m "docs(review): record community-video-card-render review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished community-video-card-render
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer community-video-card-render` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed community-video-card-render
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize community-video-card-render
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/community-video-card-render_finalized
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
scripts/orchestration/finalize community-video-card-render
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/community-video-card-render_finished
/tmp/Decky-Metadata/community-video-card-render_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
