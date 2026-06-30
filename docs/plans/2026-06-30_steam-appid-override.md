# Plan: Manual Steam App ID override in metadata editor (steam-appid-override)

## Context

Some non-Steam shortcuts can't be auto-matched to a Steam app because the title-based
resolver (`_resolve_steam_appid_for_title`) relies on Steam **storesearch**, which excludes
**delisted** games (e.g. *Transformers: Devastation*, SteamDB appid 338930). For these, the
user wants a **manual override**: paste a raw Steam appid, a Steam store/community URL, or a
**SteamDB URL** into the metadata editor, and have the plugin pin that appid as the match so
the game pulls Steam info/community/news and the native link buttons resolve correctly.

Good news — the **backend already honors a manually-set `steam_appid`**:
`_steam_news_for_metadata` (main.py:1747-1750) reads `metadata.get("steam_appid")` first and
only falls back to `_resolve_steam_appid_for_title` when it is absent; `_sanitize_metadata`
(main.py:1651-1652) persists `steam_appid` / `steam_store_url`; and `MetadataData`
(src/types.ts:23-25) already declares both fields. So nothing in the matching/persistence
layer needs to change — what's missing is (a) a **UI field** to set it and (b) an **immediate
per-app re-enrich** so the pinned appid pulls Steam data without waiting for a full
cache-clear/scan.

The metadata editor (`MetadataPage` in src/components.tsx) already has the exact pattern for
this: manual ID-override fields for **RetroAchievements** (`raGameId`, state at line 962, field
~1460) and **Xbox** (`xboxTitleId`, state line 968, field ~1537). We add a sibling **Steam App
ID** field. The editor's draft is `metadata` state; `normalizedMetadata` (line 997) spreads
`...metadata` (so `steam_appid` survives) and is saved via `saveMetadata(appId, …)` (line
1014, `saveCurrent`); `metadataCache` + `applyMetadata(appId)` refresh the live UI.

For the immediate re-enrich, `_metadata_with_steam_news_sync(metadata, title)` (main.py:1662)
already does the full Steam pull and **respects a pinned `steam_appid`**; it just needs a
per-app callable wrapper (none exists today — `start_scan_missing` only touches "missing"
shells, so an already-populated game would be skipped).

**Intended outcome:** in the Playhub metadata editor, a "Steam App ID" field accepts a raw
appid / Steam store URL / Steam community URL / SteamDB URL, extracts the appid, saves it onto
the game's metadata, and immediately re-enriches that one game from Steam (info box, deck
compat, community screenshots, news). Clearing the field reverts to auto title-matching on the
next enrichment. Delisted games like *Transformers: Devastation* (338930) become matchable.

**Relevant files:** `src/components.tsx` (`MetadataPage` editor — new field + parse helper +
apply handler), `src/backend.ts` (new `enrichSteamApp` callable binding), `main.py` (new
`enrich_steam_app` async callable wrapping `_metadata_with_steam_news_sync`),
`src/types.ts` (fields already present — no change expected).

**Out of scope:** the app-links hider (separate plan `fix-applinks-hider-robust`); the
community-media swap (already merged); SteamDB *scraping*/auto-fallback (Cloudflare-blocked —
the manual override is the agreed path); changing the title-based matcher.

**Slug used throughout this plan:** `steam-appid-override`

---

## Orchestration Contract

**Slug:** `steam-appid-override`

**Plan file:**

```text
docs/plans/2026-06-30_steam-appid-override.md
```

**Implementation branch:**

```text
feat/steam-appid-override
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/steam-appid-override_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/steam-appid-override_finalized
```

**Review notes:**

```text
docs/review/steam-appid-override-review-*.md
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
git checkout -b feat/steam-appid-override
```

Commit this plan first:

```bash
git add docs/plans/2026-06-30_steam-appid-override.md
git commit -m "docs(plan): add steam-appid-override implementation plan"
```

---

## Implementation Tasks

Backend (`main.py`) + frontend (`src/components.tsx`, `src/backend.ts`). TDD the backend
callable and the parse helper. Never break existing editor behavior. The device runs an
**Italian** Steam locale, so do not rely on English UI text anywhere.

### A. Backend: per-app Steam re-enrich callable (`main.py`)

1. Add an async callable `enrich_steam_app(self, app_id: int) -> dict[str, Any] | None`
   (place it near `auto_fetch_metadata` / `enrich_community_media`, ~line 932-945):
   - `self._load_data()`; `key = str(app_id)`; `metadata = self._data["metadata"].get(key)`;
     if not a dict, `return None`.
   - `title = str(metadata.get("title") or "")`.
   - `enriched = await asyncio.to_thread(self._metadata_with_steam_news_sync, metadata, title)`.
   - persist + return via the existing path: `return await self.save_metadata(app_id, enriched)`
     (this sanitizes, stamps `updated_at`, and stores it).
   - This **respects a pinned `steam_appid`** because `_steam_news_for_metadata`
     (main.py:1747-1750) reads `metadata.get("steam_appid")` before falling back to title
     resolution. No change to `_metadata_with_steam_news_sync` or the matcher.
2. Do **not** add any new logging of the appid beyond the existing `_plog`/`_redact`
   conventions; never log secrets. No network change beyond what `_metadata_with_steam_news_sync`
   already performs.

### B. Backend tests (`tests/test_steam_appid_override.py`, harness — stub network)

3. With `_metadata_with_steam_news_sync` exercised against stubbed `_http_json` (mirror the
   existing steam tests' stubbing, e.g. `tests/test_steam_community_media.py`):
   - **pinned appid respected:** seed `self._data["metadata"]["123"] = {"title": "X",
     "steam_appid": 338930, ...}`; stub the appdetails/deck/news helpers so they record the
     appid they were called with; `await store.enrich_steam_app(123)`; assert the Steam
     helpers were called with **338930** (not a title-resolved id) and the saved metadata keeps
     `steam_appid == 338930`.
   - **unknown app:** `enrich_steam_app(999)` with no metadata returns `None` and writes
     nothing.

### C. Frontend callable binding (`src/backend.ts`)

4. Add `export const enrichSteamApp = callable<[appId: number], MetadataData | null>(
   "enrich_steam_app");` (mirror the existing `fetchMetadata` / `saveMetadata` bindings).

### D. Frontend: parse helper (`src/components.tsx`, module scope near other helpers)

5. Add a pure exported-or-local helper `parseSteamAppId(input: string): number` that returns
   the appid or `0`:
   - `const s = String(input || "").trim(); if (!s) return 0;`
   - if `/^\d+$/.test(s)` → `Number(s)`;
   - else try, in order, these regexes on `s` (case-insensitive) and return the first capture:
     - `/(?:store\.steampowered\.com|steamcommunity\.com|steamdb\.info)\/app\/(\d+)/i`
     - `/[?&]appid=(\d+)/i`
     - `/\bapp\/(\d+)\b/i`
   - else `0`. Guard `Number(...)` to a finite positive integer (else `0`).
   - Add a couple of inline assertions are **not** needed; instead cover it in the editor's
     behavior (no TS test runner exists), but keep the helper pure so it is trivially correct.

### E. Frontend: editor field + apply handler (`MetadataPage`, `src/components.tsx`)

6. Add local state `const [steamAppIdText, setSteamAppIdText] = useState("");`. In `load()`
   (~line 981-991), initialize it from saved metadata:
   `setSteamAppIdText(saved?.steam_appid ? String(saved.steam_appid) : "");` (use the same
   `saved` object already fetched there; if `load` sets form via `setFormMetadata`, read
   `saved.steam_appid`).
7. Add a new editor row in the same visual area as the RetroAchievements / Xbox override
   fields (search the file for the `raGameId` Field/TextField block ~line 1455-1465 and place
   the Steam field as a sibling section, using the **existing `Field` / `TextField` / `ButtonItem`
   components and the existing `t(...)` localization pattern**). The row contains:
   - a `TextField` labelled via a new i18n key (see task 9) bound to `steamAppIdText` /
     `setSteamAppIdText`, with a description telling the user they can paste an appid, a Steam
     store/community URL, or a SteamDB URL;
   - an **Apply** `ButtonItem` (label via i18n) whose handler `applySteamAppId` does:
     ```
     const parsed = parseSteamAppId(steamAppIdText);
     const next = { ...normalizedMetadata, steam_appid: parsed || null,
                    steam_store_url: parsed ? `https://store.steampowered.com/app/${parsed}/` : "" };
     const saved = await saveMetadata(appId, next);
     metadataCache[String(appId)] = saved;
     const enriched = await enrichSteamApp(appId);
     if (enriched) { metadataCache[String(appId)] = enriched; setFormMetadata(enriched);
                     setSteamAppIdText(enriched.steam_appid ? String(enriched.steam_appid) : ""); }
     applyMetadata(appId);
     toaster.toast({ title: t("pluginName"), body: t("saved") });
     ```
     Wrap in try/catch with a failure toast; gate on `nonSteam` exactly like `saveCurrent`
     (line 1010-1013) — show `t("notNonSteam")` and bail if not a non-Steam app.
   - When `steamAppIdText` is empty, Apply still works and **clears** the pin (`steam_appid:
     null`, `steam_store_url: ""`), so the next enrichment reverts to title matching.
8. Do not remove or reorder the existing title/developers/publishers/release/rating/RA/Xbox
   fields. The Steam field is additive.

### F. i18n

9. Add the new label/description/button strings to the localization files using the **existing
   key pattern** (find where `raGameId`/Xbox labels are defined, e.g. keys like
   `xboxTitleIdLabel`; add `steamAppIdLabel`, `steamAppIdDescription`, `steamAppIdApply`).
   Add them to **every** locale file that defines the RA/Xbox keys (at minimum the default/en
   and `it` Italian, matching whatever set already exists) so the Italian device shows text,
   not a raw key. If a translation is unknown, reuse the English string as a placeholder rather
   than leaving the key missing.

### G. Scope discipline

10. Only: the `enrich_steam_app` callable + its test, the `enrichSteamApp` binding, the
    `parseSteamAppId` helper, the editor field/handler, and the i18n keys. Do **not** change the
    matcher, `_metadata_with_steam_news_sync`, the hider, community media, or unrelated editor
    fields. No new npm deps. Use `npm ci` if install is needed (never an unpinned install).

11. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9.

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
uv run --with pytest -- pytest -q tests/test_steam_appid_override.py
scripts/orchestration/run-quality-gates    # tsc --noEmit + rollup build + py_compile + full pytest
git status --short                          # clean
```

Expected: new backend test passes (pinned appid respected; unknown app → None); `tsc`/build
green; full pytest unchanged-green; tree clean.

Deferred verification (requires hardware — performed by the human/orchestrator):

1. Rebuild from `dev`, sideload.
2. Open a delisted/unmatched non-Steam game (e.g. *Transformers: Devastation*) → Playhub
   metadata editor. In the new **Steam App ID** field paste `https://steamdb.info/app/338930/`
   (and separately test a raw `338930` and a `store.steampowered.com/app/338930` URL) → tap
   **Apply**.
3. Confirm the game's info box, deck-compat badge, and community section populate from Steam
   (source becomes `Steam`), and the native Store/Community/Discussions/Guides buttons resolve
   to app 338930.
4. Clear the field and tap **Apply** → confirm the pin is removed (next enrichment reverts to
   title matching).
5. Confirm the RetroAchievements/Xbox override fields and all other editor fields still work.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished steam-appid-override
```

This writes:

```text
/tmp/Playhub-Metadata-local/steam-appid-override_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer steam-appid-override`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/steam-appid-override-review-*.md
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
   scripts/orchestration/clear-finished steam-appid-override
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
   git add docs/review/steam-appid-override-review-*.md
   git commit -m "docs(review): record steam-appid-override review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished steam-appid-override
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer steam-appid-override` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed steam-appid-override
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize steam-appid-override
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/steam-appid-override_finalized
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
scripts/orchestration/finalize steam-appid-override
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/steam-appid-override_finished
/tmp/Playhub-Metadata-local/steam-appid-override_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.
