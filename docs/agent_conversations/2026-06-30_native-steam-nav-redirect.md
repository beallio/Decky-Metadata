# 2026-06-30 native-steam-nav-redirect

## Objective

Implement `docs/plans/2026-06-29_native-steam-nav-redirect.md` on
`feat/native-steam-nav-redirect`.

## Setup Notes

- The repository was clean on `dev` before branching.
- `docs/plans/2026-06-29_native-steam-nav-redirect.md` was already committed on
  `dev` (`01c0a5a`, with follow-up `c2e2990`), so the plan's first-commit
  command had no staged diff to commit on the implementation branch.
- Baseline `scripts/orchestration/run-quality-gates` passed before production
  edits.

## Files Modified

- `main.py`
- `src/backend.ts`
- `src/components.tsx`
- `src/steam.ts`
- `tests/test_frontend_log.py`
- `tests/test_scan_resolves_steam_appid.py`
- `dist/index.js`

## Design Decisions

- Added `frontend_log` as a never-raising backend callable that delegates to
  `_plog` and returns `True`.
- Kept Steam appid resolution out of `_auto_fetch_metadata_sync`; `_scan_missing`
  now composes `_metadata_with_steam_news_sync` before saving scan results.
- Added a pure `rewriteSteamLinkToMatchedApp` helper and an idempotent redirect
  installer for Steam/web openers after Steam internals are available.
- Removed the prior injected Steam links row because Steam's native buttons now
  own that UI.
- Clear cache starts a background metadata scan when games are available, without
  blocking the UI on scan completion.

## Validation

- Targeted tests were first run red, then green after implementation:
  `./run.sh uv run --with pytest -- pytest -q tests/test_frontend_log.py tests/test_scan_resolves_steam_appid.py`.
- `./run.sh npx tsc --noEmit` passed during frontend validation.
- Full pre-round validation to run before commit/marker:
  `scripts/orchestration/run-quality-gates`,
  `scripts/orchestration/check-review-notes-not-deleted`,
  `git status --short`.

## Deferred Hardware Verification

- Rebuild/sideload on Steam Deck.
- Use QAM Clear cache and confirm fresh `storesearch` calls plus repopulated
  `steam_appid` values in `playhub_metadata.json`.
- Open native Community Hub, Discussions, Guides, and Store Page buttons for a
  matched shortcut and confirm navigation targets the matched Steam app.
- Check `playhub-metadata.log` for `[playhub:nav] steam link` entries showing
  original and rewritten URLs.
