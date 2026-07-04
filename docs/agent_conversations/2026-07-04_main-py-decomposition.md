# 2026-07-04 Main.py Decomposition

## Objective

Implement `docs/plans/2026-07-03_main-py-decomposition.md` on
`feat/main-py-decomposition`: decompose the 2,653-line `Plugin` god object in
`main.py` into boring, testable `backend/*.py` services while keeping `Plugin`
a thin RPC facade with an identical RPC surface. Behavior-preserving.

## Design Decisions

- New modules, matching the plan's task list exactly:
  - `backend/matching.py` — pure title-scoring/text/value normalization
    helpers (`normalise_match_title`, `clean_game_title`, `clean_html_text`,
    `rating_to_percent`, `date_to_epoch`, `safe_int`, `as_number`,
    `https_url`, `ign_title_acceptable`, etc.).
  - `backend/shortcuts_vdf.py` — binary/text `shortcuts.vdf` parsing plus the
    `MAX_SHORTCUTS_VDF_*` caps.
  - `backend/storage.py` — `default_data`/`load_data`/`save_data` for the
    on-disk metadata JSON store (mtime-cache preserved).
  - `backend/steam_paths.py` — `SteamInstall`, `is_steamos`,
    `detect_steam_roots`, `detect_steam_installs`, `userdata_roots_from_candidates`.
  - `backend/scan_runner.py` — the generic scan-pipeline engine
    (`ScanPipelineResult`/`Target`, `run_scan_pipeline`, `new_scan_progress`,
    `scan_pipeline_message`) already made generic by the prior
    scan-pipeline-refactor round.
  - `backend/providers/ign.py` — IGN GraphQL search/fetch/mapping.
  - `backend/providers/steam.py` — Steam store search, appdetails, deck
    compat, partner events/news, news text/image helpers.
  - `backend/providers/delisted.py` — steam-tracker.com delisted index
    download/cache/fuzzy-match.
- **Every existing `Plugin` method name is kept**, now as a thin delegator to
  the corresponding backend function (verified via an AST diff: 120 methods
  before, 120 after, identical name sets). This was a deliberate choice over
  renaming/removing internals: the existing test suite monkeypatches dozens of
  `plugin._method` instance attributes (e.g. `plugin._http_json`,
  `plugin._steam_news_for_metadata`) and calls `main.Plugin._static_method`
  directly, so keeping the delegator names identical preserved that coupling
  with zero behavior change instead of rewriting ~20 test files.
- Cross-cutting sanitization (`_sanitize_metadata`, `_sanitize_screenshots`,
  `_sanitize_steam_news`, `_collected_steam_news_image_sources`) and
  orchestration that reads monkeypatchable module globals
  (`_metadata_with_steam_news_sync`, `_steam_news_for_metadata`,
  `_steam_news_for_appid`, `_read_steam_shortcuts`, scan resolvers) were kept
  in `main.py` on purpose:
  - `_metadata_with_steam_news_sync` calls module-level `now()`, and
    `tests/test_steam_appid_override.py` monkeypatches `main.now`; moving this
    method into a backend module would silently stop honoring that patch.
  - Sanitize methods aren't named in the plan's module list, and providers
    only need the *raw* shapes back (Plugin applies sanitize once, exactly
    where the original code did, to avoid double-transform drift).
- Logging (`_plog`/`_redact`), plugin-version resolution, and generic HTTP
  transport (`_http_text`/`_http_json`/`_graphql`/TLS helpers) were left in
  `main.py`: not named in the plan's module list, and every provider function
  that needs them receives `self._http_json`/`self._http_text`/`_plog` as an
  injected callable from the `Plugin` delegator instead. This keeps
  `plugin._http_json` monkeypatching (used by ~8 test files) working through
  the new provider functions without those functions importing `main` back
  (which would invert the dependency direction).
- `backend/providers/steam.py::steam_appdetails_for_appid` returns a raw
  (unsanitized) `screenshots` list; the `Plugin._steam_appdetails_for_appid`
  delegator pops it, calls `self._sanitize_screenshots`, and only re-adds the
  key if the sanitized list is non-empty — reproducing the original
  post-sanitize truthiness check exactly (including the `return details or
  None` empty-payload case).
- `backend/providers/ign.py::ign_images_to_screenshots` returns the raw
  candidate list (no internal sanitize call, unlike the original). This is
  behavior-identical because the caller (`Plugin._game_to_metadata`) always
  wraps the result in `self._sanitize_metadata(...)`, which unconditionally
  re-sanitizes `screenshots`, and sanitize is idempotent.
- `MAX_SHORTCUTS_VDF_BYTES`/`_DEPTH`/`_ENTRIES` now live in
  `backend/shortcuts_vdf.py` instead of `main.py`, since they're VDF-parser
  configuration, not Plugin/RPC surface.
- `STEAM_TRACKER_DELISTED_URL` is re-exported from `main.py`
  (`from backend.providers.delisted import STEAM_TRACKER_DELISTED_URL`) so the
  one test that reads (not patches) it needed no changes.

## Files Modified

- `main.py` (2,653 → 1,281 lines)
- `backend/__init__.py`, `backend/matching.py`, `backend/shortcuts_vdf.py`,
  `backend/storage.py`, `backend/steam_paths.py`, `backend/scan_runner.py`
  (new)
- `backend/providers/__init__.py`, `backend/providers/ign.py`,
  `backend/providers/steam.py`, `backend/providers/delisted.py` (new)
- `scripts/package.mjs` — stages every `backend/**/*.py` file into the
  installer zip (walks the directory instead of a fixed file list)
- `scripts/orchestration-hooks/quality-gates` — `py_compile`s `backend/*.py`
  alongside `main.py`
- `tests/test_shortcuts_vdf.py` — the one test that monkeypatched
  `main.MAX_SHORTCUTS_VDF_BYTES` now monkeypatches
  `backend.shortcuts_vdf.MAX_SHORTCUTS_VDF_BYTES`, since that constant moved
  with the parser it configures
- `docs/agent_conversations/2026-07-04_main-py-decomposition.md` (this file)

## Validation

- `./run.sh python3 -m py_compile main.py backend/*.py backend/providers/*.py`
  — clean.
- `./run.sh uv run --with pytest -- pytest -q` — 114 passed (113 unchanged +
  the one updated assertion target), before and after confirmed at 114/114
  with only the `MAX_SHORTCUTS_VDF_BYTES` patch target changed.
- Frontend callable-name parity: extracted all 22 `callable("...")` names from
  `src/backend.ts` and diffed against every `async def` on `Plugin` — zero
  missing.
- AST diff of `Plugin`'s method names before/after: identical 120-name set
  (no renames, no drops, no additions).
- `node scripts/package.mjs --release` then `unzip -l Decky-Metadata.zip` —
  confirmed all 10 `backend/**/*.py` files are staged alongside `main.py`;
  packaging artifacts removed afterward.
- `node --test tests/package_mjs_test.mjs` — both cases pass unchanged.
- `scripts/orchestration/run-quality-gates` — full hook (tsc --noEmit, rollup
  build, `py_compile`, pytest, version-drift guard) passed end-to-end.

## Follow-Up Notes

- On-device parity (scan, activity refresh, delisted refresh, metadata
  save/remove) remains deferred per the plan.
