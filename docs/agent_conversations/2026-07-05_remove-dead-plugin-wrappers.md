# 2026-07-05 Remove Dead Plugin Wrappers

## Objective

Implement `docs/plans/2026-07-05_remove-dead-plugin-wrappers.md`.

## Source

Thermo-nuclear review (`docs/reviews/2026-07-05_thermo-nuclear-fable.md`), BLOCKER 1 + MAJOR 9:
the backend decomposition left one-line `Plugin` delegation wrappers in `main.py`, a large
fraction of which have zero live callers, plus a few provider functions reachable only through
those dead wrappers, and two frontend modules imported nowhere. This is a deletion-only,
behavior-preserving pass: only symbols with zero live callers were removed.

## Task 0 — Audit gate (zero-caller grep evidence)

Ran a word-boundary reference check for every enumerated symbol across `main.py`, `backend/`,
`src/`, `tests/`, `scripts/`, excluding each symbol's own `def` line. All 27 originally enumerated
symbols printed no output (i.e., no callers besides their own definition):

```
_scan_pipeline_message, _steam_event_json, _steam_localized_value, _steam_event_clan_id,
_steam_partner_event_images, _steam_partner_event_image, _save_delisted_index_sync,
_delisted_index_is_fresh, _steam_news_image, _ign_images_to_screenshots, _rawg_slug_candidates,
_jsonish_unescape, _field_is_empty, _shortcut_for_app, _normalise_match_title, _vdf_get,
_strip_surrounding_quotes, _steam_user_id_from_shortcut_path, _parse_binary_vdf_object,
_read_vdf_cstring, _slug_from_ign_value, _absolute_ign_url, _attributes_to_people,
_attributes_to_names, _first_release_date, _infer_store_categories, _reasonable_match,
_rating_to_percent
```

Borderline case per the plan: `_shortcut_app_id` (main.py, `@staticmethod`, line ~1265 pre-edit).
A word-boundary grep across the same paths found only its own `def` line — genuinely zero-ref, so
it was added to the deletion set (29 methods deleted total, not 28; the extra one was flagged as
"verify during implementation" in the plan rather than pre-listed).

Category (C) provider-function grep evidence:
- `rawg_slug_candidates` (`backend/providers/ign.py`): only caller was `main.py`'s dead
  `_rawg_slug_candidates` wrapper. `slug_candidates` / `slug_from_ign_value` confirmed still
  called elsewhere — kept.
- `steam_partner_event_image` (singular, `backend/providers/steam.py`): only caller was the dead
  `_steam_partner_event_image` wrapper. `steam_partner_event_images` (plural) confirmed still
  live via `_steam_partner_events_for_appid` — kept.
- `steam_news_image` (singular, `backend/providers/steam.py`): only caller was the dead
  `_steam_news_image` wrapper. `steam_news_image_candidates` confirmed still live — kept.

## Deletions

**`main.py`** — 29 dead `Plugin` methods removed (the 28 enumerated + `_shortcut_app_id`).
Lifecycle hooks (`_main`, `_unload`, `_migration`), all `async def` RPC methods (including
`get_platform_capabilities`, still live via `main.py`'s internal call), and every live wrapper
named in the plan's category (A) list were left untouched. Deleted only the dead blocks in place;
no surrounding code was reordered or reformatted.

**`backend/providers/ign.py`** — deleted `rawg_slug_candidates`. `slug_candidates` and
`slug_from_ign_value` remain, still called by live code.

**`backend/providers/steam.py`** — deleted `steam_partner_event_image` (singular) and
`steam_news_image` (singular). `steam_partner_event_images` (plural) and
`steam_news_image_candidates` remain, still called by live code.

**Frontend:**
- `git rm src/steamLinks.ts src/openExternalUrl.ts` — zero importers anywhere.
- `src/backend.ts` — removed the `getPlatformCapabilities` callable export and dropped
  `PlatformCapabilities` from the `./types` import. The backend `get_platform_capabilities` RPC
  method in `main.py` was left untouched (still live at its internal call site).
- `src/types.ts` — removed the `PlatformCapabilities` type after re-confirming (post-`backend.ts`
  edit) it had no remaining importer anywhere in `src/`.
- `src/steam/core.ts` — removed the `hasAppDetailsStore` export. The underlying
  `declare const appDetailsStore` stays; it's still used inside `hasSteamInternals`.
- `src/steam.ts` — removed `hasAppDetailsStore` from the re-export list.

## Deferred (out of scope, noted per plan's scope-discipline rule)

- The now-unused `import html` at the top of `main.py` (its only caller, `_jsonish_unescape`, was
  deleted). Not touched here: it wasn't in the plan's enumerated deletion list, `py_compile`
  doesn't flag unused imports, and the plan explicitly says not to make unrelated cleanups in this
  pass. Worth a one-line removal in a future pass.
- The full BLOCKER 1 wrapper-collapse (repointing live call sites/tests to `matching.*` /
  `steam_provider.*` / `ign_provider.*` directly and deleting the live wrapper layer) — deferred to
  its own plan, per the plan's explicit scope note.
- The MAJOR 9 "James Bond" slug-candidate special-case relocation (`backend/providers/ign.py`,
  live logic) — not touched.
- `PLUGIN_VERSION = ""` inlining (`src/ContentPanel.tsx`) — live reference, not touched.

## Validation Results

- Baseline: `git status --short` clean on `dev` before branching; plan file already committed to
  `dev` at `f52e888`, so no separate plan commit was needed on the feature branch.
- `./run.sh python3 -m py_compile main.py backend/*.py backend/providers/*.py` — clean.
- `./run.sh uv run --with pytest -- pytest -q` — full suite green, unchanged (no test referenced
  any deleted symbol).
- `./run.sh npx tsc --noEmit` — clean.
- `./run.sh npm run build` — succeeded; `dist/index.js` + `dist/index.js.map` rebuilt and staged.
- All plan-specified grep/scope gates re-run post-edit: dead `Plugin` methods gone, lifecycle
  hooks + RPC methods present, dead provider functions gone with callees kept, dead frontend
  files/exports gone, no dangling `steamLinks`/`openExternalUrl` references.
- `git status --short` diff scope: `backend/providers/ign.py`, `backend/providers/steam.py`,
  `dist/index.js`, `dist/index.js.map`, `main.py`, `src/backend.ts`, `src/steam.ts`,
  `src/steam/core.ts`, `src/types.ts`, plus deletion of `src/openExternalUrl.ts` and
  `src/steamLinks.ts` — matches the plan's "Relevant files" list exactly.
