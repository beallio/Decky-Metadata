# Plan: Real Steam community and store links (steam-community-store-links)

## Context

For a non-Steam shortcut matched to a real Steam app (e.g. *Warhammer 40,000: Space
Marine*), the **Store Page / Community Hub / Discussions / Guides surfaces do not reach the
real Steam pages**. Confirmed from the Deck's own steamui bundle: the client builds those
links from the app's *own* appid and explicitly nulls them for shortcuts
(`e.BIsModOrShortcut() ? null : GetStoreURL()+"app/"+e.appid`), and Community Hub navigates
to `${COMMUNITY_BASE_URL}app/${unAppID}` — i.e. the shortcut's synthetic appid, which has no
real community. So for a matched shortcut these surfaces are dead.

**Decision (from the user): "open the real Steam pages."** We will surface explicit links
that open the *matched* app's real Steam pages, keyed off `metadata.steam_appid` (already
resolved and plumbed through the backend). URL shapes (verified against the client + public
Steam):

- Store Page: `https://store.steampowered.com/app/<steam_appid>`
- Community Hub: `https://steamcommunity.com/app/<steam_appid>`
- Discussions: `https://steamcommunity.com/app/<steam_appid>/discussions/`
- Guides: `https://steamcommunity.com/app/<steam_appid>/guides/`

We do **not** try to un-gate the native library buttons (that means overriding
`BIsModOrShortcut`/store-url on the live overview, which risks breaking shortcut launching).
Instead we add clearly-labeled buttons on the plugin's existing per-game page — the page the
library context-menu entry already opens (`/playhub-metadata/<appId>`).

What already exists (reuse it):

- `src/components.tsx` — the per-game page. It already holds the game's `metadata`
  (`useState<MetadataData>`, components.tsx:928) including `metadata.steam_appid`, and has a
  proven external-link opener `openExternalUrl(url)` (components.tsx:527 — tries
  `SteamClient.System.OpenInSystemBrowser`, then `SteamClient.Overlay.OpenExternalBrowserURL`,
  then `window.open`). Existing buttons use the `FocusableButton` wrapper (components.tsx:102)
  inside `PanelSection`/`PanelSectionRow`, e.g. the RetroAchievements/Xbl links
  (`openRetroAchievements`, components.tsx:544).
- `src/i18n.ts` — localized strings (`t(...)`); `community: "Community"` already present.
- `src/contextMenuPatch.tsx` — adds the per-game context entry that routes to the page.

**Intended outcome:** on the per-game Playhub page for a matched non-Steam game, a "Steam"
section shows Store Page / Community Hub / Discussions / Guides buttons that open the real
matched-app pages; the section is hidden when there is no `steam_appid`.

**Out of scope:** the info box / Deck-compat work (separate plan `steam-info-deckcompat`),
and any backend/network change (this is a frontend-only plan — no new fetches, no npm deps).

**Slug used throughout this plan:** `steam-community-store-links`

---

## Orchestration Contract

**Slug:** `steam-community-store-links`

**Plan file:**

```text
docs/plans/2026-06-29_steam-community-store-links.md
```

**Implementation branch:**

```text
feat/steam-community-store-links
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/steam-community-store-links_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/steam-community-store-links_finalized
```

**Review notes:**

```text
docs/review/steam-community-store-links-review-*.md
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
git checkout -b feat/steam-community-store-links
```

Commit this plan first:

```bash
git add docs/plans/2026-06-29_steam-community-store-links.md
git commit -m "docs(plan): add steam-community-store-links implementation plan"
```

---

## Implementation Tasks

This is a frontend-only change centered on `src/components.tsx`. There is no testable pure
function unless you extract the URL builder (do — see task 1 — so it can be unit-tested).

1. **Add a pure URL-builder module** `src/steamLinks.ts` exporting a function, e.g.
   `steamAppLinks(steamAppId: number)` that returns
   `{ store, community, discussions, guides }` using the URL shapes in Context, but **only
   when `steamAppId` is a finite integer `> 0`**; for a non-positive/NaN id return `null`
   (callers hide the section). Keep it dependency-free and side-effect-free.

2. **Render a "Steam" section on the per-game page** in `src/components.tsx`:
   - Compute the links from the current `metadata.steam_appid`
     (`steamAppLinks(Number(metadata?.steam_appid) || 0)`).
   - When the result is `null`, render nothing (no section, no empty header).
   - When present, add a `PanelSection` titled via a new i18n key (e.g. `t("steamLinks")`,
     "Steam") containing four `PanelSectionRow`s, each a `FocusableButton`
     (`className="DialogButton"`, matching the existing buttons) whose `onClick` calls the
     existing `openExternalUrl(...)` with the corresponding URL:
     Store Page, Community Hub, Discussions, Guides. Use the existing button styling/spacing
     pattern already used for the RetroAchievements/Xbl link buttons
     (components.tsx ~744-790) so it is visually consistent.
   - Place the section where it reads naturally on the page (e.g. near the other
     external-link buttons); do not disrupt the existing form/sections.

3. **i18n.** Add the new label keys to **every** locale block in `src/i18n.ts` (the file has
   parallel locale objects — `en`, `it`, etc.; add the keys to all of them, falling back to
   English text where no translation is provided so no locale is left missing a key):
   `steamLinks` ("Steam"), `steamStorePage` ("Store Page"), `steamCommunityHub`
   ("Community Hub"), `steamDiscussions` ("Discussions"), `steamGuides` ("Guides"). Match the
   existing key/style conventions in that file.

4. **No TS unit-test framework exists in this repo** (the gate is `tsc --noEmit` + rollup
   build + `py_compile` + pytest — confirmed; there is no vitest/jest and no `*.test.ts`).
   Do **not** add a test runner or any npm dependency. Verification for the URL builder is
   the `tsc` typecheck (it must compile and be correctly typed) plus the on-device check in
   Verification. Keep `steamAppLinks` small and obviously correct, and exercise its branches
   from the component (the `null` case hides the section). Record this choice in the session
   log.

5. **Scope discipline:** frontend only. Do not modify the backend, matching, discovery, the
   native library buttons, `BIsModOrShortcut`, the community-media/partner-event code, or the
   `appDetailsStore` patch. No npm dependency changes. No edits to
   `from __future__ import annotations` or `main.py`.

6. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9, noting whether
   a TS unit test runner exists and how the URL builder was verified.

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

- `tsc --noEmit` passes (the new `src/steamLinks.ts` is correctly typed and imported), the
  rollup build succeeds, and the existing pytest suite still passes. Working tree clean.

Deferred verification (record in the session log; requires hardware — performed by the
human/orchestrator, not the implementer):

1. Rebuild the installer from `dev` and sideload on a real Steam Deck.
2. Open a matched non-Steam game that exists on Steam (e.g. *Warhammer 40,000: Space
   Marine*) via the library context-menu "Playhub metadata..." entry. Confirm a **Steam**
   section appears with Store Page / Community Hub / Discussions / Guides buttons, and that
   each opens the **matched app's real Steam page** (correct `steam_appid`) in the in-client
   browser/overlay.
3. Confirm the section is **absent** for a non-Steam game with no resolved `steam_appid`.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished steam-community-store-links
```

This writes:

```text
/tmp/Playhub-Metadata-local/steam-community-store-links_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer steam-community-store-links`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/steam-community-store-links-review-*.md
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
   scripts/orchestration/clear-finished steam-community-store-links
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
   git add docs/review/steam-community-store-links-review-*.md
   git commit -m "docs(review): record steam-community-store-links review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished steam-community-store-links
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer steam-community-store-links` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed steam-community-store-links
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize steam-community-store-links
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/steam-community-store-links_finalized
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
scripts/orchestration/finalize steam-community-store-links
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/steam-community-store-links_finished
/tmp/Playhub-Metadata-local/steam-community-store-links_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
