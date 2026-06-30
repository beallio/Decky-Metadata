# Plan: Steam links on the native game page (native-app-page-steam-links)

## Context

The user wants **Store Page / Community Hub / Discussions / Guides as buttons on the game's
own page in Steam's native UI** (the app-details page), for matched non-Steam games — NOT in
the library context menu. The prior plan (`native-steam-links-context-menu`) put them in the
context menu (the Y/gear pop-up menu); that is the wrong surface. This plan moves them onto
the app page and removes the context-menu entries.

What exists (reuse it):

- `src/steam.ts` already intercepts the matched app-details page render:
  `GAME_DETAIL_ROUTES.forEach(... routerHook.addPatch(route, ...))` with an `afterPatch` on
  the route's `renderFunc` (steam.ts:4693-4720). That callback runs for matched non-Steam app
  pages, resolves `appId`, checks `isNonSteamApp(appOverview)`, and calls `applyMetadata`,
  `refreshPlayhubNativeActivityForApp`, etc. **This is the integration seam** — the buttons
  must be rendered when this runs for a matched app.
- The plugin already DOM-mounts its own content onto the app page (`mountActivityNewsRoot`,
  steam.ts:2182; anchor helpers `findActivityEmptyDropZone` / `findActivityNewsMountInfo`,
  steam.ts:2169-2180). Mirror this mount/idempotency/anchor approach for the buttons row
  rather than inventing a new mechanism.
- `src/steamLinks.ts` (`steamAppLinks`), `src/steam.ts` `steamAppIdForApp`,
  `src/openExternalUrl.ts` (`openExternalUrl`) — all built earlier; reuse them.
- `src/contextMenuPatch.tsx` currently injects the four Steam `MenuItem`s (keys
  `playhub-steam-store`/`-community`/`-discussions`/`-guides`) plus the `editMetadata` entry —
  the four Steam entries are removed here.
- i18n keys `steamStorePage` / `steamCommunityHub` / `steamDiscussions` / `steamGuides`
  already exist in every locale — reuse them.

**Intended outcome:** on a matched non-Steam game's native app page, a row/section of Store
Page / Community Hub / Discussions / Guides buttons appears and each opens the matched
`steam_appid`'s real Steam page (via `openExternalUrl`). The buttons are gone from the
context menu. Nothing appears for games with no resolved `steam_appid`.

**Reality check / expectation:** the exact on-page placement depends on Steam's live DOM,
which cannot be verified from CI. The implementer delivers a compiling, gated, idempotent
mount using the existing infrastructure and a best-effort anchor; **final placement is tuned
on-device** (the orchestrator/human will verify on the Deck and may issue a review note to
adjust the anchor). Build it to be safe: never throw, never block Steam's native render,
remove cleanly on unpatch, and never stack duplicates.

**Out of scope:** the Community *tab content* (fabricated tiles) — this plan is the
Store/Community/Discussions/Guides **buttons** only; the clear-cache button
(`clear-metadata-cache-button`); any backend change.

**Slug used throughout this plan:** `native-app-page-steam-links`

---

## Orchestration Contract

**Slug:** `native-app-page-steam-links`

**Plan file:**

```text
docs/plans/2026-06-29_native-app-page-steam-links.md
```

**Implementation branch:**

```text
feat/native-app-page-steam-links
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/native-app-page-steam-links_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/native-app-page-steam-links_finalized
```

**Review notes:**

```text
docs/review/native-app-page-steam-links-review-*.md
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
git checkout -b feat/native-app-page-steam-links
```

Commit this plan first:

```bash
git add docs/plans/2026-06-29_native-app-page-steam-links.md
git commit -m "docs(plan): add native-app-page-steam-links implementation plan"
```

---

## Implementation Tasks

Frontend-only. No TS test runner exists (gate = `tsc --noEmit` + build + py_compile +
pytest); do not add one. Reuse `steamAppLinks`, `steamAppIdForApp`, `openExternalUrl`.

1. **Remove the Steam entries from the context menu** in `src/contextMenuPatch.tsx`: delete
   the four `MenuItem`s (`STEAM_STORE_KEY`/`STEAM_COMMUNITY_KEY`/`STEAM_DISCUSSIONS_KEY`/
   `STEAM_GUIDES_KEY`) and their insertion block; keep the `editMetadata` entry. You may keep
   the key constants out of `ENTRY_KEYS` now that they are unused, but ensure `removeOurEntry`
   still de-dupes the `editMetadata` entry correctly. Keep `steamLinks.ts`,
   `steamAppIdForApp`, and `openExternalUrl` (used below).

2. **Add an app-page "Steam links" mount** in `src/steam.ts`:
   - Build a self-contained mount helper, e.g. `mountSteamLinksRow(appId)`, that:
     - resolves `const links = steamAppLinks(steamAppIdForApp(appId));` and does nothing when
       `links` is null or `!isNonSteamApp(getOverview(appId))`;
     - creates (once) a container element tagged with a stable marker (e.g.
       `data-playhub-steam-links` attribute and a fixed id) so it is **idempotent** — if the
       container already exists for this page, update its handlers/appId instead of adding a
       second;
     - renders four buttons (Store Page / Community Hub / Discussions / Guides) using
       `t("steamStorePage")` etc., each calling `openExternalUrl(links.store|community|
       discussions|guides)` on click; style them to match Steam's buttons (reuse the
       `DialogButton`/`Focusable` from `@decky/ui` if rendering React, or simple styled
       `<button>`s consistent with the existing DOM-injected content);
     - mounts the container onto the app page using the **same anchor strategy** as
       `mountActivityNewsRoot` (steam.ts:2182) — reuse `findActivityNewsMountInfo` /
       `findActivityEmptyDropZone` or an equivalent app-details content anchor — so it follows
       the page layout. If no anchor is found, do nothing (do not fall back to `document.body`
       in a way that floats over the hero).
   - Call `mountSteamLinksRow(appId)` from the existing matched-app code path in the
     `GAME_DETAIL_ROUTES` `renderFunc` afterPatch (steam.ts:4701-4711, inside the
     `if (appId && isNonSteamApp(appOverview))` block, e.g. right after `applyMetadata(appId)`
     within the `ensureMetadataCache().then(...)`). Guard the whole thing in try/catch — it
     must never throw or block the native render (return `ret` unchanged regardless).
   - Track the created element so the existing `unpatchers`/teardown removes it on unload
     (mirror how other injected roots are cleaned up); ensure navigating between games does
     not leave a stale row with the previous game's links (re-resolve `links` per app and
     update or remove accordingly).

3. **Idempotency & lifecycle:** the row must not stack across re-renders/navigation; updating
   for a new appId must replace the prior handlers/links. Removing the plugin must remove the
   row. Never render for a non-matched (no `steam_appid`) or non-shortcut app.

4. **Scope discipline:** only the app-page buttons + the context-menu removal. Do not change
   the backend, matching, enrichment, `applyMetadata`'s field writes, the Community-tab tile
   content, or the activity-news mounting itself (only reuse its anchor helpers). No npm deps;
   no `from __future__ import annotations` / `main.py` changes.

5. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9, noting the
   chosen anchor and that on-device placement tuning is expected.

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

- `tsc --noEmit` passes and rollup build succeeds (the new mount + context-menu removal
  type-check), pytest unchanged-green, tree clean.
- The four Steam `MenuItem`s no longer exist in `src/contextMenuPatch.tsx`
  (`grep -n "playhub-steam-store" src/contextMenuPatch.tsx` returns nothing); `steamLinks.ts`,
  `steamAppIdForApp`, and `openExternalUrl` still exist and are imported by `steam.ts`.

Deferred verification (record in the session log; requires hardware — performed by the
human/orchestrator, not the implementer; **placement is expected to need tuning**):

1. Rebuild the installer from `dev` and sideload on a real Steam Deck.
2. Open a correctly-matched non-Steam game's page. Confirm a Store Page / Community Hub /
   Discussions / Guides button row appears **on the page** (not in the context menu) and each
   opens the matched app's real Steam page.
3. Confirm the row does not appear for a game with no resolved `steam_appid`, does not stack
   duplicates when navigating between games or re-opening the page, and the Steam entries are
   gone from the context menu.
4. If placement is off (floating/overlapping/hidden), capture the app-page DOM structure
   around the intended anchor and feed it back as a review note to refine the anchor.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished native-app-page-steam-links
```

This writes:

```text
/tmp/Playhub-Metadata-local/native-app-page-steam-links_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer native-app-page-steam-links`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/native-app-page-steam-links-review-*.md
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
   scripts/orchestration/clear-finished native-app-page-steam-links
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
   git add docs/review/native-app-page-steam-links-review-*.md
   git commit -m "docs(review): record native-app-page-steam-links review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished native-app-page-steam-links
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer native-app-page-steam-links` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed native-app-page-steam-links
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize native-app-page-steam-links
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/native-app-page-steam-links_finalized
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
scripts/orchestration/finalize native-app-page-steam-links
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/native-app-page-steam-links_finished
/tmp/Playhub-Metadata-local/native-app-page-steam-links_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
