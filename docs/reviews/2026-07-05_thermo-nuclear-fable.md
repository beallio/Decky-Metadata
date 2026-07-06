# Thermo-Nuclear Code-Quality Review — Decky-Metadata

- **Date:** 2026-07-05
- **Model:** Fable 5
- **Branch:** dev
- **Scope:** `main.py`, `backend/**`, `src/**` (incl. `src/steam/**`), `scripts/**`. Excluded: `dist/`, `node_modules/`, `docs/`, `tests/fixtures/`, `.git/`.

**Summary.** The project is in far better shape than most Steam-client-patching plugins: the backend was genuinely decomposed into small, testable modules (`matching`, `storage`, `delisted`, `scan_runner`, `shortcuts_vdf` are clean), and the frontend patch code was split into purposeful files. But two structural debts dominate. First, the backend decomposition stopped halfway: `main.py` (1,315 lines) kept a shadow copy of the entire extracted API as ~90 one-line delegation methods, a third of which are dead — deleting that layer is the single highest-leverage change in the repo. Second, the frontend has three overlapping history/navigation patch layers with duplicated rewrite logic, including one real behavior (the `steamweb` nav-state rewrite) that only runs when debug logging is enabled — feature logic living inside a diagnostics module. Beyond those, the synthetic PartnerEvent machinery in `activity.ts` is a hand-maintained 200-field fake object mirrored by a hand-maintained 250-line type, the Steam-news row shape is built independently in four places across two languages, and a call-count "bypass counter" hack encodes assumptions about Steam's internal call ordering. Findings below, most severe first.

---

## BLOCKER 1 — `main.py` is a 1,315-line pass-through facade; ~90 one-line delegation wrappers, many dead

**LOCATION:** `main.py:646–1315` (`Plugin._search_metadata_sync` through `Plugin._as_number`, plus `_is_steamos`, `_detect_steam_roots`, `_default_data`, `_new_scan_progress`, `_scan_pipeline_message`, `_run_scan_pipeline`, …)

**PROBLEM:** The backend was correctly extracted into `backend/` modules, but the `Plugin` class kept a private wrapper for essentially every extracted function. This is decomposition without deletion: two names for every concept, a file that still trips the ~1000-line smell, and an indirection layer that exists mainly so old tests keep passing. Worse, a large slice of the wrapper layer (and some of the provider functions behind it) is **dead code** reachable from nothing:

**EVIDENCE:**
- Pure delegation, used elsewhere in `main.py` or tests: `_clean_html_text`, `_clean_game_title`, `_safe_int`, `_as_number`, `_https_url`, `_sanitize_screenshots` callers, etc. — dozens of shapes like:
  ```python
  def _steam_event_json(self, value: Any) -> dict[str, Any]:
      return steam_provider.steam_event_json(value)
  ```
- **Dead** (no caller in `main.py`, `src/`, or `tests/`): `_steam_event_json`, `_steam_localized_value`, `_steam_event_clan_id`, `_steam_partner_event_image`, `_steam_news_image`, `_rawg_slug_candidates`, `_ign_images_to_screenshots`, `_shortcut_for_app`, `_jsonish_unescape`, `_field_is_empty`, `_detect_steam_installs` (and its `SteamInstall` import), `_parse_binary_vdf_object`, `_read_vdf_cstring`, `_vdf_get`, `_strip_surrounding_quotes`, `_steam_user_id_from_shortcut_path`, `_shortcut_app_id`, `_slug_candidates`, `_slug_from_ign_value`, `_absolute_ign_url`, `_attributes_to_people`, `_attributes_to_names`, `_first_release_date`, `_infer_store_categories`, `_reasonable_match`.
- `backend/providers/ign.py:78 rawg_slug_candidates` and `backend/providers/steam.py:208 steam_partner_event_image` / `steam.py:251 steam_news_image` are reachable only through those dead wrappers — leftovers of a removed RAWG pipeline and an older image path.
- Test-only wrappers (`_ign_title_acceptable`, `_parse_delisted_html`, `_date_to_epoch`, `_is_non_primary_steam_title`, `_distinctive_tokens_present`) keep the layer alive purely so `tests/*` can call `plugin._x(...)` instead of `matching.x(...)`.

**REMEDY (code judo):** Delete the wrapper layer wholesale. Call `matching.*`, `steam_provider.*`, `ign_provider.*`, `delisted_provider.*`, `shortcuts_vdf.*`, `steam_paths.*` directly at the ~15 real call sites; repoint tests at the backend modules (they already import them elsewhere). Remove the dead provider functions (`rawg_slug_candidates`, `steam_partner_event_image`, `steam_news_image`) and the `SteamInstall`/`detect_steam_installs` path if nothing consumes it. Expected effect: `main.py` drops by roughly 350–450 lines, one layer of naming disappears, and the RPC surface (the `async def` methods) becomes visibly separated from the implementation. The `tests/test_import_sandbox.py` namespace test is the only consumer of `detect_steam_installs` — either delete both or move the test to `backend/steam_paths.py` semantics.

---

## BLOCKER 2 — Feature behavior gated behind debug logging; three overlapping history-patch layers rewriting the same navigation

**LOCATION:** `src/steam/diagnostics.ts:251–262` (inside `installNavigationTrace`), `src/steam/activity.ts:1084–1162` (`installNativeNewsHistoryRedirects`), `src/steam/navigationRedirect.ts:111–202` (`installMainWindowHistoryRedirect`), wiring in `src/steam/install.ts:67–81`.

**PROBLEM:** Steam's history `push`/`replace` and the browser `history.pushState`/`replaceState` are monkey-patched by **three different modules**, each carrying its own copy of "if path contains `steamweb`, rewrite `state.url` to the matched app". One of those copies lives in `diagnostics.ts` — a module that `install.ts` only installs when `getDebugLogging()` resolves true. That means a *navigation-correcting rewrite* (`rewriteSteamwebNavState`, which deep-walks and mutates nav state) executes only for users who happen to have debug logging on. Behavior must never depend on a log level. Separately, `installMainWindowHistoryRedirect` targets `SteamUIStore.m_WindowStore.MainWindowInstance.m_history` while `installNativeNewsHistoryRedirects` targets `Router.WindowStore.GamepadUIMainWindowInstance.m_history` — in Gaming Mode these frequently resolve to the *same object*, so its `push`/`replace` get double-wrapped with near-identical steamweb rewrites, plus a third wrap on `window.history` when diagnostics are on.

**EVIDENCE:**
```ts
// diagnostics.ts — installed only when debugLoggingEnabled (install.ts:69-76)
const { state: newState, rewrote } = rewriteSteamwebNavState(args[0]);
if (rewrote) { ... return original.apply(this, [newState, args[1], args[2]] as any); }
```
```ts
// activity.ts installNativeNewsHistoryRedirects — same idea, different copy
if (path.includes("steamweb") && ... typeof state.url === "string") {
  const rewritten = rewriteSteamLinkToMatchedApp(state.url);
  if (rewritten.rewrote) { state.url = rewritten.url; ... }
```
```ts
// navigationRedirect.ts installMainWindowHistoryRedirect — third copy
if (String(path || "").toLowerCase().includes("steamweb") && ...) {
  const rewritten = rewriteSteamLinkToMatchedApp(state.url); ...
```

**REMEDY (code judo):** Create one history-interception module that owns the *single* patched `push`/`replace` (and `pushState`/`replaceState`) per history object (de-dupe by `WeakSet` on the actual object, not by which global path found it). It applies, in order: (1) the decky-native-news push→replace/back logic, (2) the steamweb `state.url` rewrite. Diagnostics then becomes *observation only* — a listener registered into that same interception point, installed/uninstalled with the debug flag, with zero behavioral branches. This deletes two of the three rewrite copies, removes the debug-gated behavior bug, and eliminates the double-wrap risk. `rewriteSteamwebNavState` (the deep-clone walker in `core.ts:216–256`) becomes unnecessary — the shallow `state.url` rewrite used by the other two layers is the one that ships everywhere today.

---

## MAJOR 3 — `activity.ts` synthetic PartnerEvent: a ~200-line hand-rolled fake object mirrored by a ~250-line hand-maintained type

**LOCATION:** `src/steam/activity.ts:459–658` (`makeDeckyNativePartnerEvent`), `src/types.ts:143–254` (`NativePartnerEvent`); file totals: `activity.ts` 1,283 lines, the largest TS file in the repo.

**PROBLEM:** The fake event object enumerates ~120 stub methods one by one (`GetSaleFeaturedBundles: () => []`, `BHasSaleVanity: () => false`, `GetSaleSectionCount: () => 0`, …). `types.ts` then re-enumerates every one of them by hand — and immediately undermines the effort with `[key: string]: unknown`, so the explicit listing buys almost no type safety while costing double maintenance on every Steam client change. `steamActivityNewsItemsFromMetadata` (lines 113–200) builds a *second* redundant item shape (~55 aliased keys: `image`/`image_url`/`event_image_url`/`capsule`/`capsule_image`/`preview_image_url`/`full_image_url` all set to the same value), and `steamActivityPayloadForApp` wraps it in 11 aliases of the same array (`events`/`rgEvents`/`rgNews`/`rgActivity`/…).

**EVIDENCE:** 60+ consecutive constant-return stubs in one object literal; `NativePartnerEvent` re-declares each signature; both must move in lockstep by hand.

**REMEDY (code judo):** Split the fake into *data core + stub table*. Keep the ~25 fields/methods with real values explicit; generate the constant stubs from grouped tables:
```ts
const FALSE_FNS = ["BIsPartnerEvent","BHasSaleEnabled", ...] as const;
const EMPTY_ARRAY_FNS = ["GetSaleSections","GetTaggedItems", ...] as const;
for (const n of FALSE_FNS) ev[n] = () => false;  // etc.
```
Type it as `NativePartnerEventCore & Record<string, unknown>` and delete the 110-line stub portion of the type (the index signature already makes it the effective contract). Then split `activity.ts` into `activityEvents.ts` (fake-object construction) and `activityPatches.ts` (store/history patching) — the file currently owns both concerns plus the community-feed patch, which belongs beside `communityFeed.ts`.

---

## MAJOR 4 — Steam-news row shape and dedup/clean logic built independently in four places across two languages

**LOCATION:** `backend/providers/steam.py:487–507` (`steam_partner_events_for_appid` row dict), `main.py:924–943` (`_steam_news_for_appid` row dict), `main.py:1032–1052` (`_sanitize_steam_news` row dict), `src/steam/activity.ts:52–64` + `96–111` (`cleanSteamNewsDisplayText`, `uniqueSteamNewsForActivity`).

**PROBLEM:** The same ~18-key news record (`id`/`gid`/`news_id`/`announcement_gid`/`event_type`/`type`/`title`/`url`/`summary`/`body`/`raw_body`/`image`/`image_sources`/`author`/`feedLabel`/`date`) is assembled by three separate Python literals that must stay field-for-field identical. Every path already funnels through `_sanitize_steam_news` before storage, so the first two literals feed a third that rebuilds the identical shape. The frontend then *re-implements* the backend's cleaning regexes (`cleanSteamNewsDisplayText` ≙ `steam_provider.clean_steam_news_text`, including the same BBCode tag list) and the exact dedup key (`title|canonicalUrl-or-day|summary[:180]` in Python; `title|canonicalUrl-or-day|summary[:160]` in TS — already drifted by 20 chars) on data the backend has already sanitized and deduped. `STEAM_ACTIVITY_EVENT_TYPES` (`steam.py:26`) and `DECKY_SUPPORTED_STEAM_ACTIVITY_TYPES` (`activity.ts:233`) are the same set maintained twice.

**EVIDENCE:** Three `rows.append({ "id": ..., "gid": ..., ... "date": ... })` blocks with identical keys; two regex stacks stripping the same `previewyoutube`/`STEAM_CLAN_IMAGE`/`[img]`/`[url=]` BBCode.

**REMEDY (code judo):** One Python `news_row(...)` constructor in `steam.py`; the two upstream fetchers pass raw fields and let `_sanitize_steam_news` be the *only* place the record shape exists. On the frontend, declare the invariant "steam_news arriving from the backend is clean, deduped, and capped" and delete `uniqueSteamNewsForActivity` and most of `cleanSteamNewsDisplayText` (keep at most a display-time HTML-entity strip). If backend records predate the invariant, bump a `steam_news` schema field once rather than re-sanitizing on every render forever.

---

## MAJOR 5 — `bypassCounter` / `bypassBypass`: call-count magic encoding Steam's internal call order

**LOCATION:** `src/steam/core.ts:40–56` (`metadataState`), `src/steam/metadataPatch.ts:374–430` (`BIsModOrShortcut`, `BHasRecentlyLaunched`, `GetGameID`/`GetPrimaryAppID`, `GetPerClientData` patches), `src/steam/routerPatches.ts:42` (`metadataState.bypassBypass = 11`).

**PROBLEM:** Whether `BIsModOrShortcut()` lies to Steam is decided by two global mutable counters set to magic constants (`4`, `11`, `-1` as an "always" sentinel) in *other* patches, decremented per call. This encodes an assumption about exactly how many times Steam's render pipeline calls these methods, in what order, from which component — assumptions no test can pin and any Steam client update can silently break. It is the purest spaghetti in the repo: five patch sites coupled through shared counters with no names for *why* (`bypassBypass = 11` — eleven of what?).

**EVIDENCE:**
```ts
if (metadataState.bypassBypass > 0) { metadataState.bypassBypass -= 1; return false; }
...
if (metadataState.bypassCounter > 0) metadataState.bypassCounter -= 1;
return metadataState.bypassCounter === -1 || metadataState.bypassCounter > 0;
```

**REMEDY:** This hack may be unavoidable in spirit (Steam offers no clean hook), but its *shape* is fixable. Replace numeric counters with an explicit scope guard: `withShortcutIdentitySuppressed(fn)` that sets a boolean for the synchronous extent of the known caller (`GetGameID`, `BHasRecentlyLaunched` handlers), rather than "the next N calls from anywhere". Name each suppression reason (`suppressForGameIdLookup`, `suppressDuringDetailRender`) and document the observed Steam call chain next to each. If the counts genuinely span async boundaries, key the state by route/appId instead of a global integer. At minimum, the magic `4` and `11` need named constants with the empirical justification recorded.

---

## MAJOR 6 — `currentGameDetailAppId` falls back to scanning the entire page text and shadow DOM

**LOCATION:** `src/steam/core.ts:316–361` (`appIdFromDom`, `appIdFromVisibleMetadataTitle`, `currentGameDetailAppId`), supported by `deepQuerySelectorAll` (`core.ts:371–392`) and `visibleElement`.

**PROBLEM:** When the route regex and `lastObservedGameDetailAppId` miss, the code (a) normalizes `document.body.textContent` and substring-matches it against *every* cached metadata title sorted by length, then (b) deep-queries the whole document *including shadow roots* for clickable elements and regex-scans seven attributes each. This is O(page-size × library-size) work with obvious false positives (a game title appearing in a news card or search result attributes the wrong appId), and it feeds real behavior: `installActivityRefreshedListener` and `appLinks.ts`'s 400 ms polling `update()` both call `currentGameDetailAppId()`. A wrong appId here toggles the link-hider CSS for the wrong game or rebuilds activity for the wrong app.

**EVIDENCE:** `appIdFromVisibleMetadataTitle` — `pageText.includes(candidate.title)` over all of `metadataCache`; `appLinks.ts:209` — `window.setInterval(update, 400)` → `shouldHideUnmatchedAppLinks()` → `currentGameDetailAppId()`.

**REMEDY (code judo):** Delete both DOM heuristics. The router render patches (`routerPatches.ts`) already set `metadataState.lastObservedGameDetailAppId` on every game-detail render — route path + last-observed covers every real navigation into a detail page. If a residual gap exists (e.g., cold start directly on a detail route), fix it at the router patch, not with page-text forensics. This also lets `deepQuerySelectorAll`/`visibleElement`/`normalizedTabText` be deleted or shrunk (their only production consumers are these heuristics). Replace the 400 ms `setInterval` in `appLinks.ts` with a history-change listener from the unified history layer of Finding 2.

---

## MAJOR 7 — Metadata store: non-atomic writes plus a deepcopy on every RPC

**LOCATION:** `backend/storage.py:48–53` (`save_data`), `storage.py:21–45` (`load_data`), call pattern in `main.py:308–360` (every `get_*`/`save_*` RPC calls `self._load_data()` first).

**PROBLEM:** Two issues in the canonical persistence layer. (1) `save_data` writes `decky_metadata.json` with a direct `write_text` — a crash or power loss mid-write (this runs on a handheld that gets hard-suspended) truncates the user's entire metadata database. The repo already knows the right pattern: `delisted.save_delisted_index` writes tmp + `os.replace`. (2) `load_data` returns `copy.deepcopy(cache)` on every cache *hit*, and `save_data` deep-copies again — so every RPC that touches state deep-copies the whole store (all games × screenshots × news bodies, with `raw_body` up to 16 KB per item). The copy exists to protect the cache from mutation of `self._data`, i.e., a defensive copy papering over unclear ownership of a mutable dict.

**EVIDENCE:**
```python
if cache is not None and cache_mtime_ns == mtime_ns:
    return copy.deepcopy(cache), cache, cache_mtime_ns   # every hit
...
data_file.write_text(json.dumps(data, ...))              # not atomic
```

**REMEDY:** Make `save_data` tmp+`os.replace` (share one `atomic_write_json` helper with `delisted.py`). Then define ownership: `Plugin._data` *is* the single mutable authority; the mtime check exists only to detect external file edits. Drop both deepcopies — reload from disk only when mtime changed, otherwise keep using the in-memory dict. That deletes the entire cache/mtime tuple-shuffling (`_data_cache`, `_data_cache_mtime_ns`, the 3-tuple return) in favor of one `mtime` field.

---

## MAJOR 8 — Hardcoded Italian UI labels shipped to all users

**LOCATION:** `src/steam/activity.ts:234–244` (`DECKY_STEAM_ACTIVITY_TYPE_LABELS`).

**PROBLEM:** The activity-type labels rendered in the native Activity feed are Italian string literals — `12: "Aggiornamento minore / Note della patch"`, `28: "Notizie"`, `35: "Evento nel gioco"` — with `"Notizie"` as the fallback. Every non-Italian user sees Italian category strings inside an otherwise-localized Steam UI. The project has already been burned by locale assumptions (`tests/test_locale_neutral_tab_detection.py` exists for exactly this class of bug).

**EVIDENCE:** `deckySteamActivityTypeLabel = (type: number) => DECKY_STEAM_ACTIVITY_TYPE_LABELS[type] || "Notizie";`

**REMEDY:** Replace with English defaults (matching the plugin's other UI strings, which are all English) or resolve Steam's own localized event-type strings if a native lookup exists. One-line-per-entry fix; no structural change needed — this is a leftover from the upstream author's locale.

---

## MAJOR 9 — Dead modules, dead exports, and a dead provider mode

**LOCATION:** `src/steamLinks.ts` (22 lines), `src/openExternalUrl.ts` (16 lines), `src/backend.ts:74–76` (`getPlatformCapabilities`), `src/steam.ts` re-export `hasAppDetailsStore`, `src/ContentPanel.tsx:39` (`PLUGIN_VERSION = ""`), `backend/providers/ign.py:78–89` (`rawg_slug_candidates`), `backend/providers/ign.py:70–75` (`slug_candidates` James Bond hardcode).

**PROBLEM:** Whole files and exports with zero importers: `steamLinks.ts` and `openExternalUrl.ts` are imported nowhere in `src/`; the `getPlatformCapabilities` callable is declared but never called from the frontend (the backend logs capabilities itself at startup); `hasAppDetailsStore` is re-exported unused; `PLUGIN_VERSION = ""` is an exported constant whose only purpose is to seed a `useState("")`. `rawg_slug_candidates` survives from a removed RAWG provider (reachable only via the dead wrapper of Finding 1). And `slug_candidates` contains a per-game special case baked into shared matching logic:
```python
if base.startswith("james-bond-blood-stone"):
    candidates.insert(0, "james-bond-007-blood-stone")
```
plus a second 007 hack in the dead `rawg_slug_candidates`. Title-specific fixups do not belong in the slug algorithm; they are exactly the "scattered special cases" growth pattern.

**REMEDY:** Delete `steamLinks.ts`, `openExternalUrl.ts`, the unused callable/export, and `rawg_slug_candidates`. Inline `PLUGIN_VERSION` as `useState("")`. If the James Bond alias genuinely matters, move it to a small `SLUG_ALIASES: dict[str, str]` data table so future one-offs accrete as data, not branches.

---

## MINOR 10 — Scan pipeline over-parameterized for two call sites; enrichment function name hides what it does

**LOCATION:** `backend/scan_runner.py:36–91`, `main.py:553–644`, `main.py:749–790` (`_metadata_with_steam_news_sync`).

**PROBLEM:** `run_scan_pipeline` threads five message-template parameters (`initial_message`, `matched_messages` dict keyed by source, `miss_message`, `error_message`, `log_message`) through two layers of wrappers to serve exactly two callers. That is a generic mechanism hiding a simple data shape — a `Literal` mode or two thin closures would be flatter. Meanwhile `_metadata_with_steam_news_sync` is named as a news fetcher but is actually the *whole* Steam enrichment pipeline (appid resolution, deck-compat fetch, full appdetails merge that overwrites `title`/`description`/`source`, plus news) with an `include_details` flag toggling half its body — and it accepts a non-dict and returns it unchanged, contradicting its `MetadataRecord` return type. The `_steam_scan_match_sync` resolver invokes it by constructing a fake `{"source": "Manual", "id": title}` shell just to trigger the appid-resolution branch.

**REMEDY:** Rename to `enrich_metadata_from_steam` and split the flag into two functions (`enrich_full`, `refresh_news_only`) — the two call profiles are disjoint. Give it a real precondition (`metadata: dict`) instead of the silent passthrough. Collapse scan messages: `scan_pipeline_message` already centralizes formatting, so pass a `mode: "metadata" | "activity"` and keep the strings in one table in `scan_runner.py` instead of at each call site.

---

## MINOR 11 — Type-boundary erosion: `any` proliferation against carefully declared types; `MetadataRecord` declared mid-import block

**LOCATION:** `src/steam/activity.ts` (pervasive `item: any`, `event: any`, `store: any`), `src/steam/metadataPatch.ts:19–21` (`declare const appStore: any` shadowing the typed `SteamInternals["appStore"]` used in `core.ts`), `src/types.ts:253` (`[key: string]: unknown` on `NativePartnerEvent`), `main.py:20–49` (`class MetadataRecord` wedged between `import urllib.request` and `import decky`).

**PROBLEM:** `types.ts` invests ~250 lines in precise Steam-internal contracts, but the code that touches those objects is typed `any` end-to-end, so the contracts are decoration. `metadataPatch.ts` re-declares `appStore`/`appDetailsStore` as `any` while `core.ts` declares the same globals with real types — the same boundary declared twice with different strictness. In Python, `MetadataRecord` is defined in the middle of the import block (a `total=False` TypedDict whose docstring admits four keys are "always present after `_sanitize_metadata`" — i.e., the optionality is known-false for the common case).

**REMEDY:** Type the seams, not the internals: `steam_news` items entering `activity.ts` are `MetadataNews` (already defined — use it in `makeDeckyNativePartnerEvent(item: MetadataNews)`), and the fake-event *output* can stay `Record<string, unknown>` per Finding 3. Move the shared `declare const appStore` into one `src/steam/globals.d.ts` with the `SteamInternals` types. Move `MetadataRecord` below the imports; consider a `Required`-subset alias (`SanitizedMetadata`) as the return type of `_sanitize_metadata` so the "always present" invariant is in the type instead of the docstring.

---

## MINOR 12 — `check_tdd.sh` pre-commit guard has a hole: `backend/*.py` changes trigger no checks

**LOCATION:** `scripts/check_tdd.sh:17–45`.

**PROBLEM:** The hook py-compiles only when `main.py` itself is staged (`grep -qx 'main.py'`) and runs pytest only for `^(main\.py|tests/)`. A commit touching only `backend/providers/steam.py` — where most backend logic now lives after the decomposition — skips both the syntax check and the test run. The guard's coverage model predates the `backend/` split.

**REMEDY:** Change both patterns to `^(main\.py|backend/.*\.py|tests/)` and compile all staged `.py` files (`git diff --cached --name-only | grep '\.py$' | xargs -r "$python_bin" -m py_compile`).

---

## MINOR 13 — Duplicated helpers and shotgun-payload compatibility

**LOCATION:** `src/ContentPanel.tsx:86–91` vs `src/metadataForm.ts` (`epochToDate` duplicated verbatim); `src/steam/activity.ts:213–227` (`steamActivityPayloadForApp` returns the item array under 11 alias keys); `src/steam/core.ts:64–101` (`isNonSteamApp` / `isNonSteamAppWithoutPatchedMethod` pair).

**PROBLEM:** Small reuse misses: `epochToDate` exists twice; the community-feed payload aliases (`events`/`rgEvents`/`rgNews`/`rgActivity`/`rgFeedItems`/`activity`/`activities`/`news`/`items`/`results`) are an acknowledged shotgun ("Steam client internals changed names across versions") that has never been narrowed — one session of on-device CDP inspection (per the project's own debug-loop memory) would identify the one or two keys actually read. The `isNonSteamApp` pair is a subtle trap: `isNonSteamAppWithoutPatchedMethod` treats *any* app with cached metadata as non-Steam (`!!metadataCache[String(appId)]`), which quietly widens "is a shortcut" into "we have metadata for it" — an invariant worth a comment or a rename (`isManagedApp`) since misuse would corrupt real Steam games' overviews.

**REMEDY:** Import `epochToDate` from `metadataForm.ts` in `ContentPanel.tsx`; empirically trim the payload aliases to the observed reader(s) with a fallback comment; rename or document the metadata-cache clause in `isNonSteamAppWithoutPatchedMethod`.

---

## MINOR 14 — Hand-rolled ZIP writer in the packager

**LOCATION:** `scripts/package.mjs:146–246` (`writeZip`, `dosDateTime`, `crc32`, `makeCrcTable`).

**PROBLEM:** ~100 lines re-implement the ZIP local/central/EOCD binary format with hand-written offsets. It works and is dependency-free, but it is bespoke binary-format code that nobody should have to re-verify when a packaging bug appears (no zip64, fixed version fields, silent 16-bit entry-count truncation if the plugin ever ships >65k files — unlikely, but the failure mode is a corrupt archive, not an error).

**REMEDY:** Lowest-effort: shell out to `zip -r` (present on the dev SteamOS/Fedora toolchain and CI) with the staging dir; or accept one devDependency (`archiver`/`yazl`). If dependency-freedom is a hard requirement, keep it — but add a round-trip check (`unzip -t`) to the package step so corruption fails the build instead of the Deck install.

---

## MINOR 15 — Pervasive error swallowing at every layer

**LOCATION:** `src/steam/core.ts:397–420` (`patchMethod` catch-all → retry original → `return undefined`), `main.py:84–93` (`_plog` swallows its own failures), dozens of `void frontendLog(...).catch(() => undefined)` sites, `main.py:365–371` (`frontend_log` catches everything, returns `True`).

**PROBLEM:** The "never break Steam" posture is correct for patch replacement bodies, but it has metastasized: `patchMethod`'s fallback can `return undefined` from a Steam method whose callers expect a value, converting a loud plugin bug into a silent Steam misbehavior that is far harder to attribute. The double-`catch(() => undefined)` idiom around `frontendLog` (which itself never throws server-side) appears ~25 times as ritual.

**REMEDY:** In `patchMethod`, log the replacement error (once per method name, rate-limited) before falling back — currently the error is discarded, so broken patches are invisible even with debug logging on. Make `frontendLog` a fire-and-forget wrapper that internally catches, and delete the per-call-site `.catch(() => undefined)` ritual.

---

## Genuinely clean

- **`backend/matching.py`, `backend/storage.py`, `backend/providers/delisted.py`, `backend/scan_runner.py`, `backend/shortcuts_vdf.py`, `backend/steam_paths.py`** — small, single-purpose, dependency-injected (`plog`, `http_text` as parameters), directly testable. The delisted index module in particular gets freshness, size caps, plausibility checks, and atomic writes right.
- **`shortcuts_vdf.py`** — binary VDF parser with depth/size/entry caps and a text-scrape fallback; defensive without being clever.
- **`src/steam/navigationRedirect.ts` (`installSteamNavigationRedirect`)** and **`core.ts` steam-link target/rewrite helpers** — the `SteamLinkTarget { kind, appId, replace }` shape is a nice minimal abstraction, and the URL-opener patch list is explicit and short.
- **`contextMenuPatch.tsx`** — a genuinely hairy technique (double afterPatch into an unexported class) that is thoroughly documented, attributed for its GPL provenance, and de-duplicates its own injected entry.
- **`scripts/version_guard.py` / `set_release_version.py`** — clean argparse tools with pure, tested cores; the version-drift guard is a good release invariant.
- **Test suite breadth** — TLS verification, type-boundary hardening, locale-neutral detection, import sandboxing, no-duplicate-methods: unusually good invariant coverage for a plugin project. (Several tests couple to the doomed `Plugin._x` wrappers — repoint them as part of Finding 1.)

---

## Tally

| Severity | Count |
|---|---|
| BLOCKER | 2 |
| MAJOR | 7 |
| MINOR | 6 |
| **Total** | **15** |
