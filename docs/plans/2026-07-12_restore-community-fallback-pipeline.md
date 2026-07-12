# Plan: Community Fallback Cards — drop shield, adopt PlayHub card shape (restore-community-fallback-pipeline)

## Context

This plan **supersedes the remaining frontend work** in
`docs/plans/2026-07-11_restore-community-fallback-pipeline.md` and continues on
the **existing** `feat/restore-community-fallback-pipeline` branch. The backend
fallback pipeline from that branch is verified correct on-device and must be
preserved — do not rewrite it.

### What is already proven good on-device (2026-07-12) — keep it

- Backend `backend/providers/community.py` converter is correct: Wolverine
  (`3156562597`) → **17** `assets2.ignimgs.com` items on page 1, **0** on page 2.
  Dimensions preserved. The permissive-host metadata converter works.
- `Plugin.get_community_fallback_page` precedence (real `steam_appid` → scrape →
  stored screenshots → `none`) works; native-wins fallthrough works.
- The `library/appcommunityfeed/<appid>` patch fires for non-Steam shortcuts on
  the Community tab and injects synthetic cards. Cards render on-device.

### What is broken and why (device-confirmed) — the entire scope of this plan

On-device clicking a rendered card opens Steam's native **`FullModalOverlay`
image lightbox**. Two defects, both traced to the frontend card model:

1. **A "?" placeholder shows next to the "IGN" label.** The synthetic card's
   creator has `avatar: ""` and `steamid: "0"`.
2. **The opened lightbox cannot be closed with a controller (touch works).** The
   lightbox receives gamepad focus on a non-focusable `Panel`; the modal contains
   effectively one focusable (Close) and no navigable content, so the controller
   cannot reach/activate Close and `B` does not dismiss it.

Critically, **clicking a synthetic card triggers ZERO published-file
detail/comment/reaction fetches** (device log confirmed). The
`synthetic detail shields` machinery added in earlier rounds therefore shields a
call that never happens, and it cannot install anyway: its target fetchers
(`CD/a/cH/zg` on module `39054`) are **getter-only, non-configurable** exports, so
`beforePatch` (assignment) throws `Cannot set property … which has only a getter`.
It logs `status='pending'` forever. **Delete it.**

### Reference: how the original PlayHub cards worked (proven, controller-friendly)

The predecessor implementation at commit `6ddc9de` (`src/steam.ts`,
`steamCommunityItemsFromImages` / `playhubCommunityCreator` /
`playhubCommunityProviderIcon`) built the same synthetic `90909…` hub cards but
with a **complete card shape**: provider-icon avatars on every avatar field, a
realistic `creator`/`steamid`, `url`/`link`/`external_url`/`strURL` on each card,
and the media fields the lightbox reads (`time_created`, `votes_up/down`,
`num_comments_public`, `content_descriptorids`, `reactions`, spoiler flags).
Porting that shape is the fix — it resolves the "?" and gives the lightbox either
an external open path or enough content to be gamepad-navigable. Reuse the exact
icon data-URI constants from `6ddc9de:src/steam.ts` (do not re-encode them).

---

## Orchestration Contract

**Slug:** `restore-community-fallback-pipeline`

**Plan file:**

```text
docs/plans/2026-07-12_restore-community-fallback-pipeline.md
```

**Implementation branch (continue the existing branch; do NOT branch from dev):**

```text
feat/restore-community-fallback-pipeline
```

**Round-complete marker:**

```text
/tmp/Decky-Metadata/restore-community-fallback-pipeline_finished
```

**Finalized marker:**

```text
/tmp/Decky-Metadata/restore-community-fallback-pipeline_finalized
```

**Review notes:**

```text
docs/review/restore-community-fallback-pipeline-review-*.md
```

Each review note ends with exactly one status trailer: `STATUS: CHANGES_REQUESTED`
or `STATUS: APPROVED`. Review notes 01–03 are already committed on the branch;
leave them in place.

---

## Required Agent Protocol

1. Use the **implementer** skill.
2. Work from the repository root.
3. **Continue on the existing `feat/restore-community-fallback-pipeline` branch.**
   Do not create a new branch and do not branch from `dev` — that would discard
   the verified backend commits.
4. Commit this plan as the **next** commit on the branch (not the first).
5. Follow TDD where behavior changes are testable.
6. Run quality gates before marking any round complete.
7. Do not write your own review. Do not create or delete files under `docs/review/`.
8. Review notes are durable audit records and must remain committed.
9. Resolving a review note means: implement the change, run quality gates, commit
   code/docs, commit the review note if not already committed, recreate the
   round-complete marker.
10. After finalization, stop polling and exit cleanly.

---

## Scope discipline

- Implement only the units this plan lists. The **backend fallback pipeline is
  out of scope** except for the one additive field in Task 2 — do not rewrite it.
- The shield deletion in Task 1 is explicitly in scope and required.
- Preserve `isDeckyCommunityId` and the existing community **vote** patch — only
  the *detail-shield* apparatus is removed.
- Never edit a test's expected value to force a pass. Record any unrelated
  finding in the session log for a separate plan.

---

## Setup

```bash
git checkout feat/restore-community-fallback-pipeline
git add docs/plans/2026-07-12_restore-community-fallback-pipeline.md
git commit -m "docs(plan): add community-fallback card-shape plan (round 4)"
```

---

## Implementation Tasks

Work in dependency order, TDD where testable. Run `scripts/decky doctor` and
`scripts/decky verify-change dev --explain` before changing code, per `AGENTS.md`.

### 1. Delete the synthetic-detail shield (frontend)

- In `src/steam/activity.ts`, remove the entire detail-shield apparatus added in
  rounds 2–3: `ensureCommunityDetailShields`, the retry/attempt/cancel state, the
  `findModuleChild` install block, the `moduleIdFor`/`reportDetailShield` helpers,
  the `fallback-render` shield trigger call, and the `synthetic detail shields`
  logging. Remove the now-unused imports (`modules as webpackModules`,
  `communityDetailFetcherMethodNames`, `shieldSyntheticCommunityCall`).
- In `src/communityFeed.ts`, remove `communityDetailFetcherMethodNames` and
  `shieldSyntheticCommunityCall` (and `allSyntheticCommunityIds` if it becomes
  unused).
- Keep `isDeckyCommunityId` and the existing community **vote** patch untouched.
- Remove the shield unit tests from `src/communityFeed.test.ts`. Do not weaken
  any surviving test.
- Rationale (record in the session log): device-confirmed that opening a synthetic
  card issues no published-file detail/comment/reaction request, so there is
  nothing to shield; and the shield target methods are getter-only, non-
  configurable exports that `beforePatch` cannot patch.

### 2. Backend — add a per-item provider link (small, additive)

- In `CommunityFallbackItem` (`src/types.ts`) add `link: string`.
- In `backend/providers/community.py`:
  - `steam_cards_to_fallback_items`: set `link` to the existing validated
    `sharedfiles` link.
  - `metadata_screenshots_to_fallback_items`: accept the record's `source_url`
    (pass it through from `get_community_fallback_page`) and set each item's
    `link` to that provider page URL (e.g. the IGN page) when it is a valid
    `https://` URL via the existing gate; otherwise fall back to the item
    `image_url`. Do not fabricate Steam links for metadata items.
- `get_community_fallback_page`: pass the record's `source_url` into the metadata
  converter. No other behavior change; still read-only, still no metadata writes.

### 3. Port the PlayHub card shape into `fallbackPageToNativeHub` (frontend)

Rebuild each synthetic hub item in `src/communityFeed.ts` to match
`6ddc9de:src/steam.ts` `steamCommunityItemsFromImages`, adapted to the current
`CommunityFallbackItem`:

- **Provider icon + creator.** Add a `communityProviderIcon(source)` helper using
  the exact icon data-URI constants from `6ddc9de:src/steam.ts`
  (`PLAYHUB_COMMUNITY_IGN_ICON`, `…_STEAM_ICON`, `…_YOUTUBE_ICON`,
  `…_RAWG_ICON`); map by the item/source label (metadata → IGN icon,
  steam-scrape → Steam icon). Build the creator with a realistic
  `steamid: "76561197960287930"`, `name: <source label>`, and the provider icon
  on `avatar`, `avatar_url`, `avatar_medium`, `avatar_full`, `avatarFullURL`.
- **Card avatar fields.** Set the provider icon on the card-level `avatar`,
  `avatar_url`, `creator_avatar_url`, `author_avatar_url`, `owner_avatar_url`.
- **Open-target fields.** Set `url`, `link`, `external_url`, `strURL` to
  `item.link || item.image_url`.
- **Media fields.** Keep `published_file_id` (synthetic `90909…`), `type: 5`,
  `title`, `description`, `preview_image_url`, `full_image_url`,
  `image_width`/`image_height`; add `spoiler_tag: false`,
  `content_descriptorids: []`, `reactions: []`, `votes_up: 0`, `votes_down: 0`,
  `num_comments_public: 0`, and a descending `time_created`
  (`Math.floor(Date.now()/1000) - index*60`).
- Preserve the `cached` flag behavior and the existing `feed selected` logging.

### 4. Tests

- Update `src/communityFeed.test.ts`: assert `fallbackPageToNativeHub` sets the
  provider-icon avatar on all avatar fields, sets `external_url`/`strURL` from the
  item link, uses a non-`"0"` `steamid`, and emits `type: 5` synthetic-id cards.
- Backend: extend `tests/test_community_fallback.py` to assert `link` is populated
  from `source_url` for metadata items and from the sharedfile link for scrape
  items, and that an unsafe `source_url` falls back to the image URL.
- The ignimgs-vs-scraper converter regression and the page-clamping tests must
  still pass unchanged.

### 5. Deployment note (prevent the round-3 false pass)

- In this plan's Verification section and in `docs/runbooks/on-device-verification.md`,
  record that **changes touching `main.py`/`backend/` are NOT exercised by
  `scripts/decky verify-change --device`** (it deploys only `dist/index.js` via
  `scripts/deck/deploy.sh`). On-device verification and release of a backend
  change require a **full-plugin install** (`scripts/decky package-push --build
  --push`, then install the zip via the Decky UI).
- Optional (only if trivial and behavior-preserving): add a documented
  `deploy.sh --backend` mode that also `scp`s `main.py` + `backend/` for dev
  iteration, noting it needs a plugin reload to take effect. If non-trivial, leave
  it as a session-log follow-up instead.

---

## Quality Gates

Before every round-complete marker:

```bash
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
```

All must pass: `tsc --noEmit`, rollup build (regenerate `dist/index.js`), vitest,
`main.py` byte-compile, pytest, version-drift, review-note preservation, and
`git diff --check`.

---

## Verification

Static gates above are necessary but not sufficient — this touches `src/steam/`.

**On-device verification is performed by the orchestrator**, and because this
change includes backend code it must run against a **full-plugin install**, not a
bundle hot-swap. The implementer must NOT mark the round contingent on device
results it cannot observe; instead, make the frontend outcome observable in logs
where practical and leave the live checks to the orchestrator's review.

Orchestrator re-verification checklist (Wolverine `3156562597`):

1. Community tab renders the ignimgs images; page 2 empty for the ≤20-shot record.
2. The **"?" is gone** — cards show the IGN provider icon.
3. Opening a card and pressing **B / activating Close on a controller dismisses
   the item cleanly** (the round-4 acceptance criterion). Record whether the fix
   resolved it via external-open or a navigable lightbox.
4. No `synthetic detail shields` log lines remain (shield removed); the community
   vote path and quick-links/re-render smokes still pass.
5. No game launch is attempted without explicit `--allow-launch` authorization.

---

## Mark Round Complete

```bash
scripts/orchestration/mark-finished restore-community-fallback-pipeline
```

---

## Review Polling Loop

After marking the round complete, read existing review notes first, then poll
`docs/review/restore-community-fallback-pipeline-review-*.md`. On a
`CHANGES_REQUESTED` note: implement the changes, rerun quality gates, commit,
re-commit the note if needed, and recreate the round-complete marker. On
`APPROVED`: finalize per the engine and exit cleanly.

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
   scripts/orchestration/check-review-notes-committed restore-community-fallback-pipeline
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize restore-community-fallback-pipeline
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Decky-Metadata/restore-community-fallback-pipeline_finalized
   ```

6. Stop polling and exit cleanly.

---

## Finalization Rules

Only finalize after a review note with:

```text
STATUS: APPROVED
```

Finalization is performed with:

```bash
scripts/orchestration/finalize restore-community-fallback-pipeline
```

Do not manually merge into `dev` unless the finalize script fails and the
user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Decky-Metadata/restore-community-fallback-pipeline_finished
/tmp/Decky-Metadata/restore-community-fallback-pipeline_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
