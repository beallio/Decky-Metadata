# Plan: Decky Metadata rebrand: remove achievements, spinner buttons, versions panel (decky-metadata-rebrand)

## Context

Playhub Metadata is a Decky Loader plugin (TypeScript/React frontend in `src/*`
bundled by rollup to `dist/index.js`; single-file Python backend `main.py`). This
plan rebrands it to **Decky Metadata** and strips it down to the metadata + Steam
activity + delisted-index feature set by removing the entire achievements
subsystem, plus three UI changes and a version reset.

Five user-requested outcomes:

1. **Remove all Xbox and RetroAchievements functionality** from the QAM panel and
   the context-menu-reached metadata page — a **full teardown**: frontend UI,
   the `src/backend.ts` bridge callables, and the `main.py` backend endpoints.
   Because RetroAchievements and Xbox/OpenXBL are the *only* two achievement
   sources, the whole achievements subsystem (settings, source selector,
   achievement cache policy, the `/playhub-metadata/achievements/:appid` route,
   and the Steam achievement-UI injection patches) is removed with them.
2. **Spinner buttons** (SDH-Ludusavi style) for the **Scan metadata** and
   **Refresh delisted index** actions: render an inline `<Spinner />` inside the
   button while the action is running, and keep the button disabled during the run.
3. **Remove the "Platform" button** in the Diagnostics section and replace it with
   a **versions panel** (SDH-Ludusavi style) that shows the plugin version plus
   data-source rows (delisted-index status and metadata source).
4. **Reset the version to `0.1.0`** in `package.json` and `plugin.json`.
5. **Rename "Playhub Metadata" to "Decky Metadata"** in every user-facing string:
   the QAM panel title/name, all toaster notification titles, the context-menu entry
   label (`"Playhub metadata..."` → `"Decky metadata..."`), and the `plugin.json` /
   `package.json` manifest `name` + `description`. Internal identifiers (the
   `/playhub-metadata/` route, the `playhub-metadata-edit` key, and `[playhub:*]` log
   areas) are intentionally left unchanged (see Task 10).

### Relevant files and current structure

- `src/index.tsx` — `definePlugin` returns `name`/`titleView` (both the literal
  `"Playhub Metadata"`), registers `METADATA_ROUTE` and
  `PLAYHUB_ACHIEVEMENTS_ROUTE`, and calls `refreshRaSettings()`.
- `src/components.tsx` (~1765 lines) — exports `Content` (the QAM panel) and
  `MetadataPage` (the per-game page opened from the context menu). The QAM
  `Content` render (approx. lines 740–1028) contains, in order: a stats row; the
  **Scan metadata** + **Refresh Activity** buttons; an **Achievements**
  (RetroAchievements) section; an **Xbox achievements / OpenXBL** section; an
  **Achievement cache** section; a **Metadata cache** section (with the
  **Refresh delisted index** and **Clear cache** buttons); and a **Diagnostics**
  section whose **"Platform"** button (approx. lines 970–977) toggles a platform
  capabilities grid. `MetadataPage` (approx. lines 1032–end) contains RA search /
  game-id mapping, Xbox search / title-id mapping, and an achievement-source
  selector (`auto`/`retroachievements`/`xbox`/`disabled`).
- `src/backend.ts` — `callable<>` bridges to `main.py`. Achievement/Xbox/RA
  callables: `getAchievementSettings`, `getXboxSettings`, `setXboxSettings`,
  `loginTrueAchievements`, `testOpenXblCredentials`, `clearXboxAssociations`,
  `setXboxTitleId`, `setAchievementSource`, `setAchievementCachePolicy`,
  `resolveXboxFromShortcut`, `searchXboxTitles`, `getRetroAchievementsSettings`,
  `setRetroAchievementsSettings`, `testRetroAchievementsCredentials`,
  `setRetroAchievementsGameId`, `fetchAchievements`,
  `syncTrueAchievementsProgress`, `resolveRetroAchievementsFromPath`,
  `searchRetroAchievementsGames`. Keep: metadata, delisted-index, activity, scan,
  platform-capabilities, debug-logging, shortcuts callables.
- `src/steam.ts` (~5889 lines) — achievement subsystem symbols to remove:
  `appAchievementProgressCache`, `hasAchievementProgressCache`,
  `achievementsCache`, `PLAYHUB_ACHIEVEMENTS_ROUTE`, `PlayhubAchievementsRoute`,
  `startBackgroundAchievementSync`, `applyAchievementPayload`,
  `clearAchievementsForApp`, `clearAchievementsForApps`, `refreshRaSettings`,
  `isUwphookGameOption`, and the achievement-source resolution logic
  (approx. lines 3414–3435). `installSteamPatches()` calls
  `startBackgroundAchievementSync()` (~line 412) — remove that call and its
  teardown.
- `src/types.ts` — remove `RetroAchievementsSettings`, `XboxSettings`,
  `AchievementSource`, `AchievementCachePolicy`, `AchievementSettings`,
  `RetroAchievements*`, `XboxTitleResult`, `SteamAchievement*`,
  `AchievementsResponse`, and the `supports_retroachievements*` /
  `supports_xbox*` keys on `PlatformCapabilities`.
- `main.py` (~396 KB) — remove the `Plugin` async methods backing the removed
  callables: `get_retroachievements_settings`, `set_retroachievements_settings`,
  `test_retroachievements_credentials`, `set_retroachievements_game_id`,
  `resolve_retroachievements_from_path`, `search_retroachievements_games`,
  `fetch_achievements`, `sync_trueachievements_progress`,
  `get_achievement_settings`, `set_achievement_cache_policy`,
  `get_xbox_settings`, `set_xbox_settings`, `login_trueachievements`,
  `clear_xbox_associations`, `test_openxbl_credentials`,
  `set_achievement_source`, `resolve_xbox_from_shortcut`, `search_xbox_titles`,
  plus their private helpers and the `supports_retroachievements*` /
  `supports_xbox*` keys emitted by `get_platform_capabilities`.
- `src/contextMenuPatch.tsx` — the per-game context-menu integration. The
  user-visible entry label `"Playhub metadata..."` (~line 136) is rebranded in
  Task 10. Its route target (`/playhub-metadata/${appId}`, ~line 134) and
  `ENTRY_KEY` (`playhub-metadata-edit`, ~line 46) are internal identifiers and are
  deliberately **not** renamed (see Task 10).
- `src/log.ts` — contains a `"Playhub Metadata"` log-prefix string caught by the
  Task 10 rename sweep.
- `plugin.json` / `package.json` — `name`, `description`, `version`, and (in
  `plugin.json`) the `publish.tags`/`publish.description`.
- `README.md` — version strings and `cacheBuster` image params (AGENTS.md §7).
- `tests/` — Python backend tests; some cover Xbox/RA endpoints and must be
  removed or rewritten to match the reduced surface.

### Load-bearing decisions (resolved with the user)

- **Full teardown** across frontend UI, `backend.ts` bridge, and `main.py`.
- **Versions panel** shows plugin version **plus data-source rows** (delisted
  index status via `getDelistedIndexStatus`, and metadata source).
- **Rename every user-facing string**: QAM title, all toasts, the context-menu entry
  label, and manifest `name`/`description`. Internal identifiers (route, entry key,
  log-area prefixes) are kept as `playhub*` on purpose (see Task 10). Note: changing
  `plugin.json` `name` changes the plugin's Decky identity (its install folder and
  settings/storage path); this is intended as part of the rebrand. Existing on-device
  Playhub settings are not migrated, and the old plugin must be uninstalled on-device
  (see Deferred verification).

**Slug used throughout this plan:** `decky-metadata-rebrand`

---

## Orchestration Contract

**Slug:** `decky-metadata-rebrand`

**Plan file:**

```text
docs/plans/2026-07-02_decky-metadata-rebrand.md
```

**Implementation branch:**

```text
feat/decky-metadata-rebrand
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/decky-metadata-rebrand_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/decky-metadata-rebrand_finalized
```

**Review notes:**

```text
docs/review/decky-metadata-rebrand-review-*.md
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
git checkout -b feat/decky-metadata-rebrand
```

Commit this plan first:

```bash
git add docs/plans/2026-07-02_decky-metadata-rebrand.md
git commit -m "docs(plan): add decky-metadata-rebrand implementation plan"
```

---

## Implementation Tasks

Work through these in order. Line numbers are approximate anchors from the
current source and will drift as you edit — locate code by the named symbols and
literal strings, not by line number. After the frontend edits, delete every
now-unused import; `npx tsc --noEmit` will flag stragglers. All temp/build caches
must stay under `/tmp/Playhub-Metadata-local` — run tooling through `./run.sh`.

### Task 1 — Remove the achievements subsystem from the backend (`main.py`)

Remove these `Plugin` async methods and any private helper functions / module
constants that exist solely to support them (Xbox/OpenXBL/TrueAchievements and
RetroAchievements):

- `get_retroachievements_settings`, `set_retroachievements_settings`,
  `test_retroachievements_credentials`, `set_retroachievements_game_id`,
  `resolve_retroachievements_from_path`, `search_retroachievements_games`
- `fetch_achievements`, `sync_trueachievements_progress`,
  `get_achievement_settings`, `set_achievement_cache_policy`,
  `set_achievement_source`
- `get_xbox_settings`, `set_xbox_settings`, `login_trueachievements`,
  `clear_xbox_associations`, `test_openxbl_credentials`,
  `resolve_xbox_from_shortcut`, `search_xbox_titles`

Also:

- In `get_platform_capabilities`, drop the `supports_retroachievements`,
  `supports_retroachievements_auto`, `supports_xbox_manual`,
  `supports_xbox_uwphook_auto`, and `supports_xbox_app_scan` keys.
- Remove achievement/Xbox/RA settings persistence (load/save of achievement
  settings, source maps, title-id maps, game-id maps, cached credentials). Do not
  attempt to migrate existing on-device settings files.
- Remove now-dead imports, constants, and helper classes/functions left behind.

**KEEP — shared infrastructure that only *looks* achievement-adjacent.** These are
generic and are used by the metadata / activity / delisted paths, not solely by the
achievements subsystem. Do **not** remove them while pruning "now-dead helpers":

- The generic HTTP fetchers and their support: `_http_text` (~2749),
  `_http_text_urllib` / `_http_text_curl` / `_http_text_powershell` (~3826–3867),
  `_http_json` (~5425), `_http_request_headers` (~3813), and `_https_url` (~2773).
  These back non-achievement network calls (this is the code the recent
  `fix-http-text-shadowing` work touched). Removing one will silently break metadata
  or activity fetching, and `py_compile` will **not** catch it.

Delete a helper **only** after grepping it and confirming every remaining caller is
itself being removed in this plan. Because `main.py` is a single ~396 KB file, prune
one symbol at a time and re-grep — do not bulk-delete a region.

Verify no orphans remain:

```bash
grep -niE "xbox|retroachievement|openxbl|trueachievement|achievement" main.py
```

The only acceptable remaining hits are incidental (e.g. a store-category label if
one exists). If a symbol is still referenced by a kept method, keep just enough to
preserve that method's behavior; otherwise remove it.

### Task 2 — Remove achievement callables from `src/backend.ts`

Delete these `callable<>` exports: `getAchievementSettings`, `getXboxSettings`,
`setXboxSettings`, `loginTrueAchievements`, `testOpenXblCredentials`,
`clearXboxAssociations`, `setXboxTitleId`, `setAchievementSource`,
`setAchievementCachePolicy`, `resolveXboxFromShortcut`, `searchXboxTitles`,
`getRetroAchievementsSettings`, `setRetroAchievementsSettings`,
`testRetroAchievementsCredentials`, `setRetroAchievementsGameId`,
`fetchAchievements`, `syncTrueAchievementsProgress`,
`resolveRetroAchievementsFromPath`, `searchRetroAchievementsGames`.

Keep all metadata, delisted-index (`refreshDelistedIndex`,
`getDelistedIndexStatus`), activity, scan, `getPlatformCapabilities`, and
debug-logging callables. Update the `./types` import list to drop types that are
no longer referenced here.

### Task 3 — Remove the achievements subsystem from `src/steam.ts`

Remove these exports and their supporting internals:
`PLAYHUB_ACHIEVEMENTS_ROUTE`, `PlayhubAchievementsRoute`,
`startBackgroundAchievementSync`, `applyAchievementPayload`,
`clearAchievementsForApp`, `clearAchievementsForApps`, `achievementsCache`,
`hasAchievementProgressCache`, the `appAchievementProgressCache` declaration,
`refreshRaSettings`, and `isUwphookGameOption`.

- In `installSteamPatches()` (~line 412), remove the
  `const stopAchievementSync = startBackgroundAchievementSync();` call and its
  entry in the returned teardown.
- Remove the achievement-source resolution branch (~lines 3414–3435) that
  switches on `"xbox"`/`"auto"`/RA and its use of `refreshRaSettings` /
  `isUwphookGameOption`.
- Remove any achievement-related entries from `patchInstallStatus`.

Verify:

```bash
grep -niE "achievement|xbox|retroach|Ra\b|openxbl" src/steam.ts
```

Remaining hits should only be incidental Steam client field names (e.g.
`m_achievementProgress` inside code you deleted should be gone; a leftover
comment about Steam versions is fine).

### Task 4 — Strip Xbox/RA UI from the QAM `Content` (`src/components.tsx`)

In the `Content` component render (approx. lines 740–1028) remove entirely:

- The **Achievements** section heading and its RetroAchievements enable toggle,
  username/API-key fields, and Login / Open RetroAchievements buttons.
- The **Xbox achievements / OpenXBL** section (heading, enable toggle, API-key
  field, Login / Open OpenXBL / Scan Xbox achievements / Sync progress / Clear
  Xbox associations buttons and their status line).
- The **Achievement cache** section (heading + cache-policy buttons).

Remove the corresponding component state and handlers: `ra`, `xbox`,
`xboxBulkBusy`, `xboxBulkMessage`, `achievementCachePolicy` and their setters;
`saveRaSettings`, `testRaLogin`, `openRetroAchievements`, `saveXboxSettings`,
`testXboxLogin`, `openOpenXbl`, `clearAllXboxMatches`,
`bulkApplyXboxAchievements`, `syncMatchedTrueAchievementsProgress`,
`saveAchievementCachePolicy`, and any RA/Xbox reads inside `refresh()`
(`getAchievementSettings`, `setRa`, `setXbox`, cache-policy). Keep the stats row,
the Scan metadata + Refresh Activity buttons, the Metadata cache section, and the
Diagnostics section (the Diagnostics section is reworked in Task 7). Remove the
now-dead imports (`ToggleField` if unused, RA/Xbox backend + type imports,
`isUwphookGameOption`, etc.).

### Task 5 — Strip Xbox/RA UI from `MetadataPage` (`src/components.tsx`)

Remove the RetroAchievements search / game-id mapping UI, the Xbox search /
title-id mapping UI, and the achievement-source selector (the
`["auto","retroachievements","xbox","disabled"]` buttons) along with their state
and handlers: `raSettings`, `raGameId`, `raQuery`, `raResults`, `raSearching`,
`achievementSource`, `xboxTitleId`, `xboxQuery`, `xboxResults`, `xboxSearching`
and their setters; `saveAchievementSource`, the RA save/resolve/search/use
handlers, and the Xbox save/auto-detect/clear/search/use/sync handlers. Remove RA
and Xbox reads from `load()`. Keep the metadata edit form, Steam app-id
association, search, and save behavior intact. Remove the now-dead imports and
types (`AchievementSource`, `AchievementsResponse`, `RetroAchievementsGameResult`,
`RetroAchievementsSettings`, `XboxSettings`, `XboxTitleResult`,
`applyAchievementPayload`, `clearAchievementsForApp`, `clearAchievementsForApps`,
etc.).

### Task 6 — Add SDH-Ludusavi-style spinner buttons

For the **Scan metadata** button (`Content`, uses `busy`/`scanMissing`) and the
**Refresh delisted index** button (`Content`, uses `delistedBusy`/`refreshDelisted`):
while the action is running, render an inline `<Spinner />` inside the button
alongside its label, and keep the button `disabled` during the run. Reuse the
existing `scanSpinnerStyle` / `scanSpinnerInnerStyle` (or an equivalent small
inline wrapper) so the spinner sizes correctly inside a `DialogButton`. Example
shape:

```tsx
<FocusableButton className="DialogButton" disabled={busy || !games.length} onClick={scanMissing}>
  {busy ? (
    <span style={scanSpinnerStyle}>
      <span style={scanSpinnerInnerStyle}><Spinner /></span>
      {"Scanning..."}
    </span>
  ) : (
    "Scan metadata"
  )}
</FocusableButton>
```

Keep the existing external status text (`scanMessage`, `delistedStatusText`)
rows. Do not add a spinner to the Refresh Activity button (out of scope).

### Task 7 — Replace the "Platform" button with a versions panel

In the Diagnostics section, remove the **"Platform" / "Hide platform"** toggle
button and the `showPlatformDiagnostics` state plus the platform-capabilities
grid it revealed (and the `platformSupportKeys` constant if it becomes unused).
Keep the **Debug Logging** toggle.

Add a **Versions** panel (SDH-Ludusavi style) — a `PanelSection` or
`PanelSectionRow` group near the bottom of `Content` showing labelled rows:

- **Plugin** — the plugin version string. Add a single frontend source of truth,
  e.g. `export const PLUGIN_VERSION = "0.1.0";` in a small module (or a const at
  the top of `components.tsx`), and add a code comment noting it must be kept in
  sync with `plugin.json`/`package.json`.
- **Delisted index** — reuse the existing `delistedStatusText` (count + updated
  date, or "not downloaded yet").
- **Metadata** — a data-source label (e.g. `Metadata saved: <metadataCount>` or a
  static "Web metadata" source line). Use existing `Content` state; do not add a
  new backend call.

Reuse the existing `diagnosticsGridStyle` / `diagnosticsRowStyle` /
`diagnosticsValueStyle` for consistent formatting.

### Task 8 — Remove the achievements route + rename QAM panel (`src/index.tsx`)

- Drop the `refreshRaSettings`, `PLAYHUB_ACHIEVEMENTS_ROUTE`, and
  `PlayhubAchievementsRoute` imports and their usages: remove
  `void refreshRaSettings();`, the `routerHook.addRoute(PLAYHUB_ACHIEVEMENTS_ROUTE, …)`
  registration, and the matching `routerHook.removeRoute(PLAYHUB_ACHIEVEMENTS_ROUTE)`
  in `onDismount`.
- Change the plugin `name` and the `titleView` text from `"Playhub Metadata"` to
  `"Decky Metadata"`.

### Task 9 — Prune `src/types.ts`

Remove the now-unused types: `RetroAchievementsSettings`, `XboxSettings`,
`AchievementSource`, `AchievementCachePolicy`, `AchievementSettings`,
`RetroAchievementsLoginResult`, `RetroAchievementsGameResult`,
`RetroAchievementsResolutionReason`, `RetroAchievementsResolutionCandidate`,
`RetroAchievementsResolutionResult`, `XboxTitleResult`, `SteamAchievement`,
`SteamAchievementsPayload`, `AchievementsResponse`. Drop the
`supports_retroachievements*` and `supports_xbox*` keys from
`PlatformCapabilities`. Keep the `StoreCategory.Achievements` enum/label only if a
Steam store category with that name is still used elsewhere (it is unrelated to
the achievements subsystem) — verify with grep before removing.

### Task 10 — Rename to "Decky Metadata" everywhere

- Replace every user-facing / display `"Playhub Metadata"` string with
  `"Decky Metadata"` across **all** of `src/*`, not just `components.tsx`. Confirm
  the surface with `grep -rn "Playhub Metadata" src/`; the current hits span
  `src/components.tsx` (toaster titles), `src/steam.ts`, `src/index.tsx`
  (`name`/`titleView`, handled in Task 8), `src/log.ts` (log prefix), and
  `src/contextMenuPatch.tsx` (file header comments).
- **Rename the context-menu entry label.** In `src/contextMenuPatch.tsx` (~line 136)
  change the visible menu label `"Playhub metadata..."` to `"Decky metadata..."`.
  This is a pure display-string change — do not alter its `onSelected` navigation or
  key.
- **Do NOT rename internal identifiers** — these are not user-facing and renaming
  them breaks navigation, storage, or log correlation:
  - the route literal `/playhub-metadata/:appid` (`src/index.tsx:17` `METADATA_ROUTE`)
    and the matching navigate target `/playhub-metadata/${appId}` in
    `contextMenuPatch.tsx` (~line 134) — they must stay identical to each other;
  - the context-menu `ENTRY_KEY` (`playhub-metadata-edit`, `contextMenuPatch.tsx:46`);
  - the `[playhub:*]` log-area prefixes / area names passed to `_plog` / `frontendLog`.
  Leaving these as `playhub*` is intentional. A "thorough" rebrand that renames the
  route will silently break the context-menu → metadata-page navigation.
- `plugin.json`: set `"name"` to `"Decky Metadata"`; update `"description"` to
  drop RetroAchievements/Xbox wording (e.g. describe clean metadata + Steam
  activity news for non-Steam games); prune `publish.tags` to remove
  `achievements`, `openxbl`, `trueachievements`, `xbox` (keep `metadata`,
  `library`, `non-steam`, `news`, `activity`).
- `package.json`: set `"name"` to `"decky-metadata"` and update `"description"`
  to match (drop RA/Xbox wording).
- `README.md`: rename the product and remove RA/Xbox setup/usage sections.

### Task 11 — Reset the version to 0.1.0

Set `"version"` to `"0.1.0"` in both `package.json` and `plugin.json`. Update any
version strings in `README.md`, and per AGENTS.md §7 bump the `cacheBuster` param
on README image URLs so they refresh. Ensure `PLUGIN_VERSION` (Task 7) reads
`"0.1.0"`. Do not touch the committed `Playhub-Metadata_1.5.0_Installer.zip` (a
build artifact, ignored).

### Task 12 — Update tests

Under `tests/`, bring the suite in line with the reduced backend surface. The
achievements teardown is not "done" until the tests reflect it — a green suite that
still asserts removed behavior is a failure of this task.

First enumerate the affected tests (don't rely on filenames alone — RA/Xbox
assertions are embedded in otherwise-kept test files):

```bash
grep -rliE "xbox|retroachievement|openxbl|trueachievement|achievement" tests/
```

Then:

- **Delete** tests whose entire subject is a removed endpoint/feature — including
  `tests/test_xbox_gating.py` (the only achievement-named file today) and any other
  file the grep shows is wholly about Xbox/RA/achievements. Record each deletion and
  its rationale in the session log.
- **Update in place** tests that mostly cover a *kept* surface but assert a removed
  detail. In particular, any `get_platform_capabilities` test **must** drop
  assertions on the removed `supports_retroachievements*` / `supports_xbox*` keys
  (Task 1) while keeping the rest of the capabilities contract asserted. This is an
  expected-value change *required by the plan*, so it is allowed under Scope
  discipline — note it in the session log.
- **Keep intact** the metadata, delisted-index, activity, scan, shortcuts, and
  community-feed tests. Do not weaken an assertion merely to make the suite pass — if
  a feature is gone, delete its test; if a feature survives, its test must still
  assert real behavior.
- After the edits, re-run the grep above and confirm the only remaining hits are the
  incidental `StoreCategory.Achievements` label (kept per Task 9), never a removed
  endpoint. Then `./run.sh uv run --with pytest -- pytest -q` must be green.

### Task 13 — Rebuild the bundle and log the session

- Rebuild the committed artifact: `./run.sh npm run build` (regenerates
  `dist/index.js`) and stage it.
- Record a session summary in
  `docs/agent_conversations/2026-07-02_decky-metadata-rebrand.md` (objective,
  files modified, tests removed/updated with rationale, validation results) per
  AGENTS.md §9.

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

Automated (run via `./run.sh` so caches stay under `/tmp/Playhub-Metadata-local`):

```bash
./run.sh npx tsc --noEmit                       # no unused-import / type errors
./run.sh npm run build                          # dist/index.js regenerated
./run.sh python3 -m py_compile main.py          # backend byte-compiles
./run.sh uv run --with pytest -- pytest -q       # backend tests pass
```

Grep gates — each of these must return no functional hits (comments/incidental
Steam field names aside):

```bash
grep -rniE "xbox|retroachievement|openxbl|trueachievement" src/ main.py tests/
grep -rn "Playhub Metadata" src/ plugin.json package.json README.md   # no display hits
grep -rn "Playhub metadata\.\.\." src/                                  # context label renamed
grep -rn "PLAYHUB_ACHIEVEMENTS_ROUTE\|PlayhubAchievementsRoute" src/
```

The `/playhub-metadata/` route literal, the `playhub-metadata-edit` entry key, and
the `[playhub:*]` log areas are expected to remain (internal identifiers, see
Task 10) — they are not failures of the "Playhub Metadata" display grep.

Confirm value changes:

- `package.json` and `plugin.json` both show `"version": "0.1.0"` and
  `"name"` reflecting the rebrand (`decky-metadata` / `Decky Metadata`).
- `src/index.tsx` `name` and `titleView` render `"Decky Metadata"`.
- `plugin.json` `publish.tags` no longer contains achievements/openxbl/
  trueachievements/xbox.

Static UI review of the built `Content` (read the diff, since on-device Steam
Gaming Mode is not available in this environment):

- No Achievements, Xbox/OpenXBL, or Achievement-cache sections remain.
- Scan metadata and Refresh delisted index buttons render an inline `<Spinner />`
  and are disabled while their `busy`/`delistedBusy` flag is set.
- The Diagnostics section has no "Platform" button; a Versions panel shows the
  plugin version (`0.1.0`), the delisted-index status, and a metadata source row.

### Deferred verification (on-device, cannot run here)

The plugin only runs inside Decky Loader in Steam Gaming Mode on the target
device. The following are explicitly deferred to manual on-device testing and are
out of scope for the automated gate:

- the QAM panel title reads "Decky Metadata";
- the spinner animates during a real scan / delisted refresh;
- the versions panel renders correctly;
- the context-menu entry now reads **"Decky metadata..."** (renamed in Task 10) and
  still opens the metadata page (its route/key are unchanged, so navigation must work
  exactly as before);
- **Uninstall the old "Playhub Metadata" plugin on the device first.** Because the
  `plugin.json` `name` changed, Decky treats this as a *different* plugin: installing
  "Decky Metadata" alongside a still-installed "Playhub Metadata" leaves two plugins
  that both patch the same Steam client surfaces (feed passthrough, context menu, nav
  redirects) and both register a `/playhub-metadata/:appid` route — a conflict. Remove
  the old plugin before/at sideload. Existing Playhub settings are intentionally not
  migrated; the new name creates a fresh settings path.

Record these as deferred in the session log.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished decky-metadata-rebrand
```

This writes:

```text
/tmp/Playhub-Metadata-local/decky-metadata-rebrand_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer decky-metadata-rebrand`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/decky-metadata-rebrand-review-*.md
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
   scripts/orchestration/clear-finished decky-metadata-rebrand
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
   git add docs/review/decky-metadata-rebrand-review-*.md
   git commit -m "docs(review): record decky-metadata-rebrand review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished decky-metadata-rebrand
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer decky-metadata-rebrand` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed decky-metadata-rebrand
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize decky-metadata-rebrand
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/decky-metadata-rebrand_finalized
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
scripts/orchestration/finalize decky-metadata-rebrand
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/decky-metadata-rebrand_finished
/tmp/Playhub-Metadata-local/decky-metadata-rebrand_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
