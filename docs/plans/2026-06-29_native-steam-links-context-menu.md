# Plan: Native Steam links in the game context menu (native-steam-links-context-menu)

## Context

The previous plan (`steam-community-store-links`) put Store/Community/Discussions/Guides
buttons on the plugin's **own per-game page** (`/playhub-metadata/<appId>`). The user finds
that separate page redundant and wants these surfaced **natively on the real game**. Decision
(from the user): patch the native game surface instead of a separate plugin page.

The faithful, low-fragility native vehicle is the **library context menu** we already patch
in `src/contextMenuPatch.tsx` (it currently injects a single "Playhub metadata…" entry).
This is exactly where Steam itself surfaces these actions for real games — confirmed in the
Deck's steamui bundle, the context-menu tokens `ViewStorePage` (10 refs) and
`ViewCommunityHub` exist. Steam nulls those actions for non-Steam shortcuts (keyed off the
synthetic appid), so for a matched shortcut we add our own entries pointing at the **matched**
`steam_appid`. (Patching the inline app-page action buttons / `AppActionButtonsCtn` directly
is far more fragile and is deliberately NOT done here.)

What already exists (reuse it):

- `src/contextMenuPatch.tsx` — resolves and patches Steam's `LibraryContextMenu`; injects the
  Playhub entry only for non-Steam shortcuts (`insertOurEntry`, gated by
  `isNonSteamApp(getOverview(appId))`). Items are `@decky/ui` `MenuItem`s. We add the Steam
  entries here, next to the existing one.
- `src/steam.ts` — `export const metadataCache` (steam.ts:47), keyed by `String(appId)`; each
  entry carries `steam_appid` (the matched real app). This is how the frontend already reads
  per-app metadata (e.g. `applyMetadata`, steam.ts:280).
- `src/steamLinks.ts` — `steamAppLinks(steamAppId)` → `{ store, community, discussions,
  guides }` or `null` (built in the prior plan; KEEP it and reuse it here).
- `src/components.tsx` — currently renders the now-redundant Steam `PanelSection` (added by
  the prior plan) and has a module-level `openExternalUrl` (components.tsx ~317, tries
  `SteamClient.System.OpenInSystemBrowser` → `SteamClient.Overlay.OpenExternalBrowserURL` →
  `window.open`). The redundant section is removed here; the opener is extracted for reuse.
- `src/i18n.ts` — the keys `steamStorePage`, `steamCommunityHub`, `steamDiscussions`,
  `steamGuides` already exist in every locale (added by the prior plan) — reuse them. The
  section-title key `steamLinks` becomes unused once the panel is removed.

**Intended outcome:** opening the native library context menu for a matched non-Steam game
shows Store Page / Community Hub / Discussions / Guides entries that open the matched app's
real Steam pages; the redundant plugin-page Steam panel is gone; nothing appears for games
with no resolved `steam_appid`.

**Out of scope:** the inline app-page action buttons; the Deck-badge/info-box work (already
done); any backend change.

**Slug used throughout this plan:** `native-steam-links-context-menu`

---

## Orchestration Contract

**Slug:** `native-steam-links-context-menu`

**Plan file:**

```text
docs/plans/2026-06-29_native-steam-links-context-menu.md
```

**Implementation branch:**

```text
feat/native-steam-links-context-menu
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/native-steam-links-context-menu_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/native-steam-links-context-menu_finalized
```

**Review notes:**

```text
docs/review/native-steam-links-context-menu-review-*.md
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
git checkout -b feat/native-steam-links-context-menu
```

Commit this plan first:

```bash
git add docs/plans/2026-06-29_native-steam-links-context-menu.md
git commit -m "docs(plan): add native-steam-links-context-menu implementation plan"
```

---

## Implementation Tasks

Frontend-only. No TS test runner exists (gate = `tsc --noEmit` + rollup build + `py_compile`
+ pytest); do not add one. Keep `steamLinks.ts` (reused).

1. **Extract a shared external-URL opener** into `src/openExternalUrl.ts`:
   ```ts
   export const openExternalUrl = (url: string): void => {
     try {
       const steamClient = (window as any)?.SteamClient;
       if (steamClient?.System?.OpenInSystemBrowser) { steamClient.System.OpenInSystemBrowser(url); return; }
       if (steamClient?.Overlay?.OpenExternalBrowserURL) { steamClient.Overlay.OpenExternalBrowserURL(url); return; }
     } catch (_error) { /* fall through */ }
     window.open(url, "_blank", "noopener,noreferrer");
   };
   ```
   In `src/components.tsx`, delete the module-level `openExternalUrl` definition and import it
   from `./openExternalUrl` instead (the existing `openRetroAchievements` / `openOpenXbl`
   callers keep working unchanged).

2. **Add a matched-appid lookup** in `src/steam.ts`:
   ```ts
   export const steamAppIdForApp = (appId: number): number =>
     Number(metadataCache[String(appId)]?.steam_appid) || 0;
   ```
   (Place it near `getOverview`/`isNonSteamApp`. Do not change `metadataCache` or matching.)

3. **Inject native context-menu entries** in `src/contextMenuPatch.tsx`. Import
   `steamAppLinks` from `./steamLinks`, `steamAppIdForApp` from `./steam`, and
   `openExternalUrl` from `./openExternalUrl`. In `insertOurEntry(items, appId)` — which
   already runs only for non-Steam shortcuts — after inserting the existing
   `editMetadata` entry, compute `const links = steamAppLinks(steamAppIdForApp(appId));` and,
   when `links` is non-null, insert four additional `MenuItem`s (stable, distinct `key`s,
   e.g. `playhub-steam-store`, `-community`, `-discussions`, `-guides`) whose `onSelected`
   calls `openExternalUrl(links.store | links.community | links.discussions | links.guides)`
   with labels `t("steamStorePage")`, `t("steamCommunityHub")`, `t("steamDiscussions")`,
   `t("steamGuides")`. Insert them adjacent to the Playhub entry (e.g. immediately after it),
   keeping them above "Properties…" like the existing entry. Ensure `removeOurEntry` (the
   de-dupe used on re-render) also strips these new keys so re-renders cannot stack copies —
   update it to remove **all** Playhub-injected keys (the edit entry + the four steam keys),
   e.g. match a shared key prefix or an explicit key set.

4. **Remove the redundant plugin-page Steam panel** in `src/components.tsx`: delete the
   `PanelSection title={t("steamLinks")}` block and its `steamLinks` `useMemo` that were added
   by the prior plan. Leave the rest of `MetadataPage` intact. Keep `src/steamLinks.ts` (now
   imported by the context-menu patch).

5. **i18n cleanup (optional, safe):** the `steamStorePage`/`steamCommunityHub`/
   `steamDiscussions`/`steamGuides` keys are now used by the menu — keep them. The
   `steamLinks` (panel title) key is unused after task 4; you may remove it from all locales
   or leave it. If you remove it, remove from every locale block consistently. Do not leave a
   locale missing a key that another locale has.

6. **Scope discipline:** frontend only; do not touch the backend, matching, discovery,
   `applyMetadata`, the deck-compat/info-box writes, or the native inline action buttons. No
   npm deps. No `from __future__ import annotations` / `main.py` changes.

7. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9.

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

- `tsc --noEmit` passes (new `src/openExternalUrl.ts`, `steamAppIdForApp` export, and the
  context-menu imports type-check), rollup build succeeds, pytest unchanged-green, tree
  clean.
- No reference to the removed panel remains: `grep -n 'steamLinks' src/components.tsx`
  returns nothing (the `steamAppLinks` import now lives only in `contextMenuPatch.tsx`), and
  `src/steamLinks.ts` still exists.

Deferred verification (record in the session log; requires hardware — performed by the
human/orchestrator, not the implementer):

1. Rebuild the installer from `dev` and sideload on a real Steam Deck.
2. On a matched non-Steam game (e.g. *Warhammer 40,000: Space Marine*), open the game's
   **native library context menu** (the same menu that shows "Playhub metadata…"). Confirm
   four new entries — Store Page, Community Hub, Discussions, Guides — appear and each opens
   the matched app's real Steam page.
3. Confirm the **plugin's per-game page no longer shows the Steam links panel** (redundancy
   removed), and that the new entries do **not** appear for a non-Steam game with no resolved
   `steam_appid`, nor stack duplicates after the menu re-renders.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished native-steam-links-context-menu
```

This writes:

```text
/tmp/Playhub-Metadata-local/native-steam-links-context-menu_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer native-steam-links-context-menu`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/native-steam-links-context-menu-review-*.md
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
   scripts/orchestration/clear-finished native-steam-links-context-menu
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
   git add docs/review/native-steam-links-context-menu-review-*.md
   git commit -m "docs(review): record native-steam-links-context-menu review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished native-steam-links-context-menu
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer native-steam-links-context-menu` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed native-steam-links-context-menu
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize native-steam-links-context-menu
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/native-steam-links-context-menu_finalized
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
scripts/orchestration/finalize native-steam-links-context-menu
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/native-steam-links-context-menu_finished
/tmp/Playhub-Metadata-local/native-steam-links-context-menu_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
