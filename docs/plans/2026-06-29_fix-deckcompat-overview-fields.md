# Plan: Fix Deck compat and release date injection fields (fix-deckcompat-overview-fields)

## Context

The `steam-info-deckcompat` work is **fetching the right data but writing it to the wrong
client fields**, so nothing changes on-device. Confirmed from the Deck's own steamui bundle
and the runtime log (`playhub-metadata.log`): the backend resolves Deck compatibility for
every matched app (e.g. appid 15100→2, 2751000→3, 32500→1) with no errors — the bug is
purely the frontend injection in `src/steam.ts` `applyMetadata`.

Authoritative field facts (from `/home/deck/.local/share/Steam/steamui/*.js`):

1. **Deck compatibility is a read-only getter, not a writable field:**
   ```js
   get steam_deck_compat_category(){ return 3 & this.steam_hw_compat_category_packed || YX }
   get steam_os_compat_category(){ return this.steam_hw_compat_category_packed >> 4 & 3 || xs }
   // a "verified games" filter elsewhere reads: (steam_hw_compat_category_packed >> 2 & 3)
   ```
   Our current line `overview.steam_deck_compat_category = metadata.deck_compat_category` assigns
   to a getter with no setter → silent no-op (swallowed by the surrounding try/catch). The
   real backing field is the writable uint32 **`steam_hw_compat_category_packed`** (protobuf
   field n:73, default 0). The Deck category lives in **bits 0–1** (`& 3`); the
   verified-filter copy lives in **bits 2–3** (`>> 2 & 3`); `steam_os` lives in bits 4–5.

2. **Release date** — the client has **no** `unTimeReleased`/`strReleaseDate` on the detail
   object (our current writes target non-existent fields). The overview carries release date
   as unix timestamps in **`rt_original_release_date`** and **`rt_steam_release_date`**.

3. **Genres** — the client has no `vecGenres`; genre/tag display is driven by numeric
   store-tag IDs (`m_rgStoreTags`), which cannot be cleanly synthesized from our genre
   *strings*. **Out of scope** here: remove the dead `vecGenres` write and defer real genre
   injection to a separate effort (note it in the session log).

4. **Description / developer / publisher already work** via `descriptionsData` /
   `associationData` (confirmed real in the bundle) — do not touch them.

**Intended outcome:** for a matched non-Steam shortcut, the Steam Deck compatibility badge
reflects the matched app's rating, and the info box shows its release date — because we now
write the fields the client actually reads.

Relevant file/seam:

- `src/steam.ts`, `applyMetadata` (the overview try-block at ~line 283-302 sets
  `overview.metacritic_score`, the deck-compat line, and `m_setStoreCategories`; a second
  try-block at ~line 325-337 currently writes the bogus `details.unTimeReleased` /
  `strReleaseDate` / `vecGenres`).

**Slug used throughout this plan:** `fix-deckcompat-overview-fields`

---

## Orchestration Contract

**Slug:** `fix-deckcompat-overview-fields`

**Plan file:**

```text
docs/plans/2026-06-29_fix-deckcompat-overview-fields.md
```

**Implementation branch:**

```text
feat/fix-deckcompat-overview-fields
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/fix-deckcompat-overview-fields_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/fix-deckcompat-overview-fields_finalized
```

**Review notes:**

```text
docs/review/fix-deckcompat-overview-fields-review-*.md
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
git checkout -b feat/fix-deckcompat-overview-fields
```

Commit this plan first:

```bash
git add docs/plans/2026-06-29_fix-deckcompat-overview-fields.md
git commit -m "docs(plan): add fix-deckcompat-overview-fields implementation plan"
```

---

## Implementation Tasks

Frontend-only change in `src/steam.ts` `applyMetadata`. There is **no TS test runner** in
this repo (gate = `tsc --noEmit` + rollup build + `py_compile` + pytest); do not add one. The
field correctness is established from the client bundle (see Context) and confirmed on-device
in deferred verification.

1. **Fix the Deck-compat write (bits in `steam_hw_compat_category_packed`).** Replace the
   current no-op assignment:
   ```ts
   if (
     typeof metadata.deck_compat_category === "number" &&
     metadata.deck_compat_category >= 1 &&
     metadata.deck_compat_category <= 3
   ) {
     overview.steam_deck_compat_category = metadata.deck_compat_category;
   }
   ```
   with a write to the backing field that sets the Deck category in bits 0–1 **and** mirrors
   it into the verified-filter copy in bits 2–3, while preserving the `steam_os` bits (4–5)
   and anything above:
   ```ts
   if (
     typeof metadata.deck_compat_category === "number" &&
     metadata.deck_compat_category >= 1 &&
     metadata.deck_compat_category <= 3
   ) {
     const category = metadata.deck_compat_category & 3;
     const prevPacked = Number(overview.steam_hw_compat_category_packed) || 0;
     // bits 0-1 = steam_deck_compat_category; bits 2-3 = verified-filter copy; keep bits >= 4
     overview.steam_hw_compat_category_packed =
       (prevPacked & ~0xf) | category | (category << 2);
   }
   ```
   Keep this inside the existing overview `try/catch` (writes can fail during bootstrap). Do
   **not** also assign `overview.steam_deck_compat_category` (it is a getter; leave it).

2. **Fix the release-date write (overview `rt_*` fields, not `details`).** Replace the
   second try-block that currently writes `details.unTimeReleased` / `details.strReleaseDate`
   / `details.vecGenres`:
   ```ts
   try {
     const details = appData.details;
     const releaseDate = metadata.release_date;
     if (details && typeof releaseDate === "number" && releaseDate > 0) {
       details.unTimeReleased = releaseDate;
       details.strReleaseDate = new Date(releaseDate * 1000).toLocaleDateString();
     }
     if (details && metadata.genres?.length) {
       details.vecGenres = metadata.genres;
     }
   } catch (_error) {
     // Steam objects are not always writable during early bootstrap.
   }
   ```
   with a write of the release timestamp to the **overview** fields the client actually
   reads, and **drop** the dead `vecGenres` write entirely:
   ```ts
   try {
     const releaseDate = metadata.release_date;
     if (typeof releaseDate === "number" && releaseDate > 0) {
       overview.rt_original_release_date = releaseDate;
       overview.rt_steam_release_date = releaseDate;
     }
   } catch (_error) {
     // Steam objects are not always writable during early bootstrap.
   }
   ```
   (`releaseDate` is a unix timestamp in seconds, as the backend already produces.) If
   `overview` is more convenient to reference from the first try-block, you may instead fold
   this into that block — either is fine as long as it writes the `overview.rt_*` fields and
   removes the genres write. Do not reintroduce any `details.*` release/genre write.

3. **Genres are deferred.** Do not attempt to inject genres in this plan; just remove the
   `vecGenres` no-op (done in task 2). Record in the session log that real genre injection
   needs numeric `m_rgStoreTags` IDs (not genre strings) and is a separate follow-up.

4. **Scope discipline:** only the two field-target corrections above in `applyMetadata`. Do
   not touch the backend, `descriptionsData`/`associationData`, screenshots, matching,
   discovery, the community/store-links work, or `from __future__ import annotations`. No npm
   deps.

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
scripts/orchestration/run-quality-gates    # tsc --noEmit + rollup build + py_compile + pytest
git status --short                          # clean
```

Expected:

- `tsc --noEmit` passes (the new `overview.steam_hw_compat_category_packed` /
  `overview.rt_original_release_date` / `overview.rt_steam_release_date` writes type-check —
  `overview`/`appDetailsStore` are typed `any` in this file), rollup build succeeds, pytest
  unchanged-green. Working tree clean. No `details.unTimeReleased` / `strReleaseDate` /
  `vecGenres` references remain in `applyMetadata` (`grep -n "unTimeReleased\|vecGenres" src/steam.ts`
  returns nothing).

Deferred verification (record in the session log; requires hardware — performed by the
human/orchestrator, not the implementer):

1. Rebuild the installer from `dev` and sideload on a real Steam Deck.
2. Open a matched non-Steam game that exists on Steam (e.g. *Warhammer 40,000: Space
   Marine*). Confirm the **Steam Deck compatibility badge** now shows the matched app's
   rating (e.g. Playable/Verified) where it previously showed nothing, and the info box shows
   the **release date**.
3. If the badge still does not render, capture whether the detail-page badge component is
   gated on `BIsModOrShortcut()` for non-Steam apps (it was not found to be in the bundle
   scan) and feed it back as a review note.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished fix-deckcompat-overview-fields
```

This writes:

```text
/tmp/Playhub-Metadata-local/fix-deckcompat-overview-fields_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer fix-deckcompat-overview-fields`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/fix-deckcompat-overview-fields-review-*.md
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
   scripts/orchestration/clear-finished fix-deckcompat-overview-fields
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
   git add docs/review/fix-deckcompat-overview-fields-review-*.md
   git commit -m "docs(review): record fix-deckcompat-overview-fields review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished fix-deckcompat-overview-fields
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer fix-deckcompat-overview-fields` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed fix-deckcompat-overview-fields
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize fix-deckcompat-overview-fields
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/fix-deckcompat-overview-fields_finalized
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
scripts/orchestration/finalize fix-deckcompat-overview-fields
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/fix-deckcompat-overview-fields_finished
/tmp/Playhub-Metadata-local/fix-deckcompat-overview-fields_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
