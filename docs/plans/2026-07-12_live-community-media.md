# Plan: Live Community Media and Metadata Gap-Fill (live-community-media)

## Context

**Slug used throughout this plan:** `live-community-media`

### Problems and outcomes

This plan bundles five related fixes discovered while verifying the shipped
community-video feature (`docs/plans/2026-07-12_community-video-restoration.md`)
on-device. Each has a distinct outcome. (The matched non-Steam Game Info
idle-decay issue is tracked separately in
`docs/plans/2026-07-12_matched-quicklinks-idle-decay.md`.)

1. **Community media is cached; it should be live.** `community_videos` and the
   screenshots shown in the Community tab are persisted on the metadata record and
   served from storage. Outcome: the Community tab fetches its media **fresh on
   every open** and persists nothing. Game Info text (developer, description,
   rating, genres, `steam_appid`, quick-links) stays resolved-and-stored as today
   — only the Community-tab media goes live.
2. **Videos never appear for some games / may not play.** Two on-device findings:
   (a) YouTube videos are only fetched on the IGN enrichment path, so complete
   Steam matches never get them; (b) even a game with stored videos (Mario Kart)
   showed none — the video card's playback behavior was never verified on-device.
   Outcome: under the live model videos are fetched wherever the Community tab has
   no Steam content (see decision 3), and a video card **plays the YouTube video**
   when activated (not the still-image lightbox).
3. **YouTube is scraped even when Steam community content exists.** The RPC
   prepends stored videos onto a successful Steam-community scrape. Outcome:
   YouTube is a **fallback only** — fetched when the game has no Steam community
   content, never alongside it.
4. **Latent tech debt: a frontend circular import.** `src/steam.ts` →
   `src/steam/install.ts` → `src/contextMenuPatch.tsx` → `src/steam.ts` (rollup
   warns each build). Outcome: the cycle is broken by extracting the shared
   symbols into a leaf module; the rollup warning is gone.
5. **A verify smoke false-fails on non-game launchers.**
   `scripts/deck/verify/select_fixtures.py` classifies **any** app without a
   `steam_appid` as a `never_on_steam` game fixture, so a launcher (Lutris,
   Heroic — legitimately no developer) can be picked and fail
   `smoke_quicklinks.sh`'s `developerInfo` (`/Developer/i`) check. Outcome: the
   selector/smoke no longer treats non-game launchers as game fixtures, so the
   suite reflects real regressions only.

### Load-bearing decisions (settled — do not relitigate)

- **Cache boundary (media only).** Do NOT persist `community_videos`. The
  Community-tab media (videos + screenshots) is fetched live on each
  `get_community_fallback_page` call. Game Info text metadata and the persisted
  `screenshots` used for Game Info injection remain stored and are NOT re-fetched
  on a plain Game Info open.
- **Community source precedence.** Per Community-tab open: (1) if `steam_appid > 0`,
  scrape Steam community live; if it returns cards, show them and **do not** fetch
  YouTube. (2) Otherwise (no `steam_appid`, or the Steam scrape returns no cards),
  build the fallback live from IGN screenshots + YouTube videos (videos ordered
  before screenshots). Every live fetch is best-effort: bounded read + timeout,
  returns `[]` on any error, never raises, and runs off the event loop
  (`asyncio.to_thread`).
- **Metadata gap-fill (scan time).** Steam data wins. IGN is consulted **only when
  the Steam/delisted match is thin/incomplete** (today's `_metadata_is_complete`
  trigger — no per-field IGN fetch on an otherwise-complete Steam game). When IGN
  is consulted, it fills **only fields Steam left empty** (flip today's
  IGN-overrides merge in `_metadata_scan_match_sync` to Steam-wins-IGN-fills).
  Screenshots at scan: prefer Steam's; use IGN's only when Steam provided none.
  YouTube is NOT fetched at scan time (it moved to the live Community path).
- **Video-card playback.** Video hub cards default to `type:2` +
  `youtube_video_id`; the on-device check in Verification confirms this plays the
  video. If a different type/field is required on-device, adjusting it is a
  review-note follow-up, not a blocker for the static round.

### Relevant files

- `main.py` — `get_community_fallback_page` (RPC, lines ~446-540),
  `_metadata_scan_match_sync` (merge precedence, ~716-746),
  `_fetch_metadata_sync` / `_metadata_with_community_videos_sync` (~866-890),
  `_sanitize_metadata` (`community_videos` key ~983-985), `MetadataRecord`
  (`community_videos` field ~46), `_http_text` (~1308).
- `backend/providers/community.py` — `fetch_youtube_videos`, `sanitize_videos`,
  `metadata_videos_to_fallback_items`, `metadata_media_to_fallback_items`,
  `_metadata_screenshot_items`, `fetch_steam_fallback_items`.
- `backend/providers/ign.py` — `fetch_metadata`, `game_to_metadata` (live IGN
  screenshot source for the fallback path).
- `src/communityFeed.ts` — `fallbackPageToNativeHub` (video-card synthesis),
  `src/types.ts` — `CommunityFallbackItem` / `MetadataData`.
- `src/steam.ts`, `src/steam/install.ts`, `src/contextMenuPatch.tsx` — circular
  import (task 4).
- `scripts/deck/verify/select_fixtures.py`, `scripts/deck/verify/smoke_quicklinks.sh`,
  `scripts/deck/js/check_quicklinks.js` — smoke fixture fix (task 5).
- Tests: `tests/test_community_fallback.py`, `src/communityFeed.test.ts`.

### Constraints

- Backend is Python standard library + Decky runtime only — no new third-party
  deps.
- `dev` is local-only; never push to origin, never merge to `main` here.
- Do not regress the native community passthrough, the community vote patch, or
  `isDeckyCommunityId`. Game Info text metadata and its screenshot injection must
  stay intact (this plan changes only the **Community-tab** media source and the
  scan-time merge precedence).

---

## Orchestration Contract

**Slug:** `live-community-media`

**Plan file:**

```text
docs/plans/2026-07-12_live-community-media.md
```

**Implementation branch:**

```text
feat/live-community-media
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/live-community-media_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/live-community-media_finalized
```

**Review notes:**

```text
docs/review/live-community-media-review-*.md
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
git checkout -b feat/live-community-media
```

Commit this plan first:

```bash
git add docs/plans/2026-07-12_live-community-media.md
git commit -m "docs(plan): add live-community-media implementation plan"
```

---

## Implementation Tasks

Work in order, TDD where testable. Before changing code, run `scripts/decky
doctor` and `scripts/decky verify-change dev --explain` per `AGENTS.md`. Each task
is independently verifiable; keep commits scoped per task.

### 1. Backend — Community fallback becomes fully live; stop persisting media

Restructure `get_community_fallback_page` (`main.py` ~446-540) to this order:

1. Load the record. If none, return `{"source":"none","page":clean_page,"items":[]}`
   unchanged.
2. If `steam_appid > 0`: scrape Steam community live off-thread
   (`fetch_steam_fallback_items`). If it returns items, return them with
   `source:"steam-scrape"`. **Remove** the stored-video prepend (current lines
   ~465-467 and ~476-477) — no YouTube when Steam community content exists.
3. Otherwise (no `steam_appid`, or the Steam scrape returned no items): build the
   fallback **live**, off-thread and best-effort:
   - Fetch fresh IGN media for the record's `source_url` (fall back to a
     title-based lookup when `source_url` is empty) via `ign_provider.fetch_metadata`
     + `game_to_metadata`, and take its screenshots. Never raise; `[]` on any error.
   - Fetch YouTube videos live via `community_provider.fetch_youtube_videos(title,
     self._http_text)`.
   - Combine as fallback items (videos first, then screenshots) using the existing
     `metadata_videos_to_fallback_items` / screenshot item builders, then clamp/slice
     to the requested page (`PAGE_SIZE`). Return `source:"metadata"` when non-empty,
     else `source:"none"`.
4. Keep the existing `_plog` audit lines (update fields as needed). No writes, no
   persistence anywhere in this RPC.

Remove `community_videos` from persistence:

- Delete the `community_videos` field from `MetadataRecord` (`main.py` ~46).
- Delete the `community_videos` entry from `_sanitize_metadata` (~983-985).
- Delete `_metadata_with_community_videos_sync` (~874-890) and revert
  `_fetch_metadata_sync` (~866-872) to return the sanitized IGN metadata directly
  (no YouTube fetch at scan time).
- In `backend/providers/community.py`, keep `fetch_youtube_videos`,
  `sanitize_videos`, `metadata_videos_to_fallback_items`, and the screenshot item
  builders (now consumed by the live RPC path). `metadata_media_to_fallback_items`
  may be repurposed or replaced by the live combine; do not leave dead exports —
  either use them or remove them, and update tests accordingly.

### 2. Backend — metadata gap-fill precedence (Steam wins, IGN fills blanks)

In `_metadata_scan_match_sync` (`main.py` ~716-746), change the IGN merge so Steam
values win and IGN fills **only empty** fields. Today's loop (`if value or key not
in merged: merged[key] = value`, ~732-734) lets IGN override Steam — replace it
with fill-only semantics: set `merged[key]` from IGN only when the key is absent or
its current value is empty/falsey. Screenshots follow the same rule: keep Steam's
screenshots; use IGN's only when Steam provided none. Do not change the trigger for
consulting IGN — it stays gated on the existing `_metadata_is_complete` /
`best_partial` path (no IGN fetch for a complete Steam match).

### 3. Frontend — video cards render and play as videos

`fallbackPageToNativeHub` (`src/communityFeed.ts`) already emits a `type:2` +
`youtube_video_id` video card gated on `item.youtube_id`; keep that shape. Ensure
the live fallback items from task 1 carry `youtube_id` for videos and empty for
screenshots (they do via `metadata_videos_to_fallback_items`). No byte change to
screenshot cards. Playback correctness is confirmed by the deferred on-device check
in Verification; if it fails there, the fix (card `type`/field) is a review-note
follow-up.

### 4. Frontend — break the circular import (tech debt)

Break the cycle `src/steam.ts` → `src/steam/install.ts` →
`src/contextMenuPatch.tsx` → `src/steam.ts`. `contextMenuPatch.tsx` imports from
`./steam` (line ~42) and `install.ts` imports `setContextMenuTraceEnabled` from
`../contextMenuPatch` (line ~24). Extract the symbols `contextMenuPatch.tsx`
consumes from `steam.ts` into a leaf module (e.g. `src/steam/shared.ts`) that
imports none of the three, and repoint the imports so no cycle remains. Preserve
all observable behavior. Confirm the rollup build no longer prints the
`Circular dependency` warning for these files.

### 5. Tooling — smoke fixture must not treat launchers as game fixtures

Fix `scripts/deck/verify/select_fixtures.py` so a non-game launcher (no
`steam_appid` AND no stored game metadata — e.g. Lutris/Heroic) is NOT classified
as a `never_on_steam` **game** fixture. Prefer a candidate that has real stored IGN
metadata (a `source`/`developers`/description present) for the `never_on_steam`
role. Alternatively/additionally, make `smoke_quicklinks.sh` skip the
`developerInfo` assertion for a fixture that legitimately has no developer. The
suite must pass on this device's real data when no product regression exists, and
still fail on a genuine missing-developer regression.

### 6. Tests and docs

- Backend (`tests/test_community_fallback.py`): the live RPC returns Steam-scrape
  items with NO videos when the Steam scrape yields cards; returns live
  video+screenshot items (videos first, `youtube_id` set) when there is no Steam
  content; every live fetch forced to error yields a safe empty/`none` result and
  never raises; the scan merge keeps Steam values and fills only empty fields from
  IGN. Remove/replace tests asserting persisted `community_videos`.
- Frontend (`src/communityFeed.test.ts`): keep the video-card and unchanged-
  screenshot-card assertions green against the item shape from task 1.
- Docs: update `docs/specs/community-fallback.md` to describe the live media model
  (no persistence; Steam-first; YouTube as fallback-only; gap-fill precedence).
  Record a session log in `docs/agent_conversations/`.

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
`git diff --check`. Additionally confirm:

- The rollup build output no longer contains a `Circular dependency` warning for
  `src/steam.ts` / `src/steam/install.ts` / `src/contextMenuPatch.tsx` (task 4).
- With every live fetch forced to fail (Steam scrape, IGN, and YouTube all raising
  or empty), `get_community_fallback_page` still returns a valid
  `source:"none"`/empty result and never raises (task 1).
- A unit-level check that the scan merge keeps a Steam-provided field and fills an
  empty one from IGN (task 2).

**Deferred on-device verification (manual; required before this change ships to
`main`).** This touches `src/steam/` and the backend, so it is not exercised by the
static gates or by `scripts/decky verify-change --device` (frontend bundle only —
a backend change needs a full-plugin install via `scripts/decky package-push
--build --push` then a Decky-UI install; see
`docs/runbooks/on-device-verification.md`). Deferred acceptance checks:

1. **Live media, no cache:** opening the Community tab fetches fresh each time and
   persists nothing (`community_videos` no longer written to
   `~/homebrew/settings/Decky-Metadata/decky_metadata.json`).
2. **Source precedence:** a game with Steam community content (e.g. Deadpool,
   `steam_appid` 224060) shows Steam community cards and **no** YouTube videos; a
   never-on-Steam game (e.g. Mario Kart) shows YouTube video cards + IGN
   screenshots.
3. **Playback:** activating a video card **plays/opens the YouTube video** (Steam
   in-app browser or player), not the still-image lightbox. If `type:2` /
   `youtube_video_id` does not play on-device, adjust the card type/field (review-
   note follow-up).
4. **Smoke suite:** `scripts/deck/verify/run_all.sh` is green on this device with
   no product regression; `smoke_quicklinks.sh` no longer false-fails on a non-game
   launcher (task 5). No game launch without explicit `--allow-launch`.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished live-community-media
```

This writes:

```text
/tmp/Decky-Metadata/live-community-media_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer live-community-media`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/live-community-media-review-*.md
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
   scripts/orchestration/clear-finished live-community-media
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
   git add docs/review/live-community-media-review-*.md
   git commit -m "docs(review): record live-community-media review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished live-community-media
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer live-community-media` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed live-community-media
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize live-community-media
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/live-community-media_finalized
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
scripts/orchestration/finalize live-community-media
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/live-community-media_finished
/tmp/Decky-Metadata/live-community-media_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
