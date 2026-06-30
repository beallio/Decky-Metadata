# Plan: Redirect native Steam links to matched app (native-steam-nav-redirect)

## Context

On-device screenshots show that for a matched non-Steam shortcut, **Steam renders its own
native Store Page / Community Hub / Discussions / Guides / Market / Support buttons** (on the
game page *and* in the library context menu) — because the plugin's `BIsModOrShortcut` patch
(steam.ts:4619) makes the shortcut look like a real app. These native buttons are exactly
what the user wants, BUT they navigate using the **overview's appid, which for a shortcut is
the synthetic id** (e.g. `2405230651`), not the matched `steam_appid` (e.g. `32500`). Steam
can't find a store/community page for the synthetic id and **falls back to the main store**.

The buttons the plugin injected itself in the prior plan (`native-app-page-steam-links`,
`mountSteamLinksRow` in steam.ts) are therefore **redundant** (the native buttons supersede
them) and are removed here.

The fix: **intercept Steam's store/community navigation and rewrite the synthetic appid to
the matched `steam_appid`.** The community/discussions/guides buttons open ordinary URLs
through openers the plugin already knows — `Navigation.NavigateToSteamWeb` /
`NavigateToExternalWeb`, `SteamClient.Overlay.OpenExternalBrowserURL`,
`SteamClient.System.OpenInSystemBrowser`, and `window.open` (steam.ts:2335-2359). The reverse
map already exists: `steamAppIdForApp(appId)` (steam.ts:174) returns the matched
`steam_appid` for a shortcut appid via `metadataCache`. Shortcut appids are large synthetic
numbers and never collide with real Steam appids, so rewriting is safe and only affects our
matched shortcuts.

Separately — and this is the **root cause** of every title currently showing
`steam_appid: None` — the **scan/refresh path does not resolve the Steam appid at all.**
`_scan_missing` (main.py:1306) calls `_auto_fetch_metadata_sync` (main.py:1440), which only
fetches IGN/RAWG base metadata and **never calls `_resolve_steam_appid_for_title` /
`_metadata_with_steam_news_sync`**. The ONLY backend path that resolves `steam_appid` is
`_refresh_steam_activities` (main.py:1360). Confirmed on-device: after a QAM refresh, all 13
titles are `None` and the log shows **zero `storesearch` calls** (only IGN/RAWG/YouTube
fetches). So the matches the user saw earlier were resolved by an older game-view enrichment
and did not survive the cache clear. This plan makes the scan resolve the Steam appid, and
makes **"Clear cache" also kick off the scan** so matches (with `steam_appid`, deck compat,
and news) rebuild immediately.

Also add a small **frontend→backend log bridge** (`frontend_log`) so frontend navigation can
be traced in `playhub-metadata.log` — this both confirms which buttons the redirect catches
and reveals the store button's path if it uses a non-URL (in-client store overlay) route that
the URL chokepoints miss.

Relevant files:

- `src/steam.ts` — the openers (2335-2359), `steamAppIdForApp` (174), `installSteamPatches`
  (where the redirect is installed and `unpatchers` live), and the redundant
  `mountSteamLinksRow`/`removeSteamLinksRow`/`removeSteamLinksArtifacts`/
  `ensurePlayhubSteamLinksStyle` + their call site (~steam.ts:4827) and teardown
  (`unpatchers.push(removeSteamLinksArtifacts)` ~steam.ts:4333) — all removed.
- `src/components.tsx` — the QAM `clearCache` handler (components.tsx:515) and the `games`
  list from `useNonSteamGames`; `startScanMissing` is in `src/backend.ts:51`.
- `main.py` — add the `frontend_log` callable near other simple async methods; reuse `_plog`.

**Intended outcome:** the native Store/Community/Discussions/Guides buttons (page + context
menu) open the **matched app's** real Steam pages; the redundant injected row is gone; Clear
cache rebuilds matches immediately; navigation rewrites are visible in the log.

**Out of scope:** the Community *tab* fabricated-tile content (separate follow-up).

**Slug used throughout this plan:** `native-steam-nav-redirect`

---

## Orchestration Contract

**Slug:** `native-steam-nav-redirect`

**Plan file:**

```text
docs/plans/2026-06-29_native-steam-nav-redirect.md
```

**Implementation branch:**

```text
feat/native-steam-nav-redirect
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/native-steam-nav-redirect_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/native-steam-nav-redirect_finalized
```

**Review notes:**

```text
docs/review/native-steam-nav-redirect-review-*.md
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
git checkout -b feat/native-steam-nav-redirect
```

Commit this plan first:

```bash
git add docs/plans/2026-06-29_native-steam-nav-redirect.md
git commit -m "docs(plan): add native-steam-nav-redirect implementation plan"
```

---

## Implementation Tasks

No TS test runner exists (gate = `tsc --noEmit` + build + py_compile + pytest); do not add
one. Reuse `steamAppIdForApp`, `metadataCache`.

1. **Backend `frontend_log` bridge** in `main.py` (near other simple async methods):
   ```python
   async def frontend_log(self, area: str = "ui", message: str = "", fields: dict[str, Any] | None = None) -> bool:
       try:
           _plog(str(area or "ui"), str(message or ""), **(fields or {}))
       except Exception:
           pass
       return True
   ```
   It must never raise. `_plog` already redacts. Add `export const frontendLog = callable<[
   area: string, message: string, fields: Record<string, unknown>], boolean>("frontend_log");`
   to `src/backend.ts`.

2. **Add a pure rewrite helper** in `src/steam.ts`, e.g.
   `rewriteSteamLinkToMatchedApp(url: string): { url: string; rewrote: boolean; fromAppId?: number; toAppId?: number }`:
   - Recognise store/community targets and extract the appid: `store.steampowered.com/app/<id>`,
     `steamcommunity.com/app/<id>` (with optional `/discussions/`, `/guides/`, trailing path),
     `steam://store/<id>`, `steam://url/StoreAppPage/<id>`, and
     `steam://openurl/...app/<id>` forms. Be permissive about the path after the id.
   - For the extracted `<id>`, compute `const mapped = steamAppIdForApp(id)`. If `mapped > 0`
     and `mapped !== id`, return the URL with the id replaced by `mapped` and `rewrote:true`
     (plus from/to). Otherwise return the original url, `rewrote:false`.
   - Pure and side-effect free; never throws (guard with try/catch returning the input).

3. **Install a navigation redirect** in `src/steam.ts` (called from `installSteamPatches`,
   pushing teardown onto `unpatchers`). Patch each opener so the first URL-ish argument is run
   through `rewriteSteamLinkToMatchedApp` before delegating to the original:
   - `Navigation.NavigateToSteamWeb`, `Navigation.NavigateToExternalWeb` (guard for presence);
   - `SteamClient.System.OpenInSystemBrowser`, `SteamClient.Overlay?.OpenExternalBrowserURL`;
   - `window.open` (rewrite the first arg only).
   Requirements: **idempotent** (guard with a module flag / `__playhubNavRedirect` marker so
   re-install doesn't double-wrap), **never throws** (on any error call the original
   unmodified), restores originals on teardown. When a rewrite happens, AND when a
   store/community URL is seen but NOT rewritten (no mapping), call `frontendLog("nav",
   "steam link", { kind, original, rewritten })` (fire-and-forget, swallow errors) so on-device
   tracing shows which buttons were caught and surfaces any store path the URL chokepoints
   miss. Do not log non-store/community navigations (avoid noise / PII).

4. **Remove the redundant injected buttons:** delete `mountSteamLinksRow`,
   `removeSteamLinksRow`, `removeSteamLinksArtifacts`, `ensurePlayhubSteamLinksStyle`, the
   `SteamLinkButton` type, the call site (`mountSteamLinksRow(appId)` and the nav-away
   `removeSteamLinksRow()`), and the teardown push, all added by `native-app-page-steam-links`.
   Keep `src/steamLinks.ts`, `steamAppIdForApp`, and `src/openExternalUrl.ts` (still used
   elsewhere / harmless). Confirm no remaining references (`grep -n "SteamLinksRow\|playhub-steam-links" src/steam.ts`).

5. **Make the scan resolve the Steam appid (root-cause fix)** in `main.py` `_scan_missing`
   (main.py:1306). After `metadata = await asyncio.to_thread(self._auto_fetch_metadata_sync,
   title)` and before `save_metadata`, when `metadata` is truthy, run it through the Steam
   resolution+enrichment used by the activities path:
   ```python
   metadata = await asyncio.to_thread(
       self._metadata_with_steam_news_sync, metadata, title, 10
   )
   ```
   `_metadata_with_steam_news_sync` (main.py:1639) resolves `steam_appid` via
   `_resolve_steam_appid_for_title` (storesearch), fetches deck compatibility, and attaches
   steam news — exactly what was missing. Keep it inside the existing try/except so a
   network failure for one game does not abort the scan (it already catches per-game). Do not
   change `_auto_fetch_metadata_sync` itself (other callers rely on its current behaviour);
   only the scan path composes the extra step.

6. **Clear cache also rescans** _(after task 5 lands)_ in `src/components.tsx` `clearCache` (components.tsx:515):
   after `clearMetadataCache()` + `refreshMetadataCache()`, call `startScanMissing(games)`
   (import from `./backend`; `games` is available in `Content` via `useNonSteamGames`) so
   matches rebuild immediately (now with `steam_appid` thanks to task 5). Keep the existing
   toast; optionally mention a rescan started. Guard against an empty `games` list (no-op).
   Do not block the UI on scan completion.

7. **Scope discipline:** only the redirect + redundant-button removal + clear-cache rescan +
   the scan Steam-appid fix + the log bridge. Do not change matching scoring, the
   `BIsModOrShortcut` patch, `applyMetadata`, or the Community-tab tile content. No npm deps;
   no `from __future__ import annotations` change.

8. **Tests**:
   - `tests/test_frontend_log.py` (harness): `await frontend_log("nav", "x", {"a":1})`
     returns `True` and does not raise; calling with `fields=None` and with a non-dict is
     safe. (The TS rewrite has no runner — rely on `tsc`; keep it obviously correct.)
   - `tests/test_scan_resolves_steam_appid.py` (harness): drive `_scan_missing` (or assert at
     the composition level) with `_auto_fetch_metadata_sync` and `_metadata_with_steam_news_sync`
     stubbed, and verify the scan calls `_metadata_with_steam_news_sync` for a fetched game so
     the saved metadata carries the resolved `steam_appid` (stub it to return a dict with a
     `steam_appid`), and that a per-game failure does not abort the loop. Avoid real network.

9. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9.

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
uv run --with pytest -- pytest -q tests/test_frontend_log.py
scripts/orchestration/run-quality-gates    # tsc --noEmit + rollup build + py_compile + pytest
git status --short                          # clean
```

Expected:

- `tsc --noEmit` + build pass; `tests/test_frontend_log.py` passes; full pytest green; tree
  clean.
- `grep -n "SteamLinksRow\|playhub-steam-links" src/steam.ts` returns nothing (redundant
  buttons removed). `steamLinks.ts` and `openExternalUrl.ts` still exist.

Deferred verification (record in the session log; requires hardware — performed by the
human/orchestrator):

1. Rebuild the installer from `dev` and sideload on a real Steam Deck.
2. In the QAM panel tap **Clear cache** and confirm `playhub-metadata.log` now shows fresh
   **`storesearch`** calls for the games (scan now resolves the Steam appid — the missing
   step) and the persisted `playhub_metadata.json` repopulates `steam_appid` (e.g. Force
   Unleashed II → 32500, Wobbly Life → 1211020, Space Marine → 55150/2183900) instead of
   `None`.
3. On a matched game, click the native **Community Hub / Discussions / Guides** buttons (page
   and context menu) and confirm they open the **matched app's** real Steam pages; check the
   log for `[playhub:nav] steam link` lines showing `original`→`rewritten`.
4. Click **Store Page**: if it now opens the correct app, done. If it still hits the main
   store, the log's `[playhub:nav]` trace (or its absence for the store click) reveals whether
   the store button uses a non-URL in-client route — feed that back as a review note so a
   follow-up can patch that specific path.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished native-steam-nav-redirect
```

This writes:

```text
/tmp/Playhub-Metadata-local/native-steam-nav-redirect_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer native-steam-nav-redirect`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/native-steam-nav-redirect-review-*.md
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
   scripts/orchestration/clear-finished native-steam-nav-redirect
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
   git add docs/review/native-steam-nav-redirect-review-*.md
   git commit -m "docs(review): record native-steam-nav-redirect review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished native-steam-nav-redirect
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer native-steam-nav-redirect` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed native-steam-nav-redirect
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize native-steam-nav-redirect
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/native-steam-nav-redirect_finalized
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
scripts/orchestration/finalize native-steam-nav-redirect
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/native-steam-nav-redirect_finished
/tmp/Playhub-Metadata-local/native-steam-nav-redirect_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
