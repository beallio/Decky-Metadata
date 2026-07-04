# 2026-07-03 Dead Code Removal

## Objective

Implement `docs/plans/2026-07-03_dead-code-removal.md` by removing confirmed dead backend helpers and the uninstalled legacy Activity overlay subsystem without changing the installed native Activity path.

## Files Modified

- `main.py`
- `src/steam.ts`
- `dist/index.js`
- `dist/index.js.map`
- `docs/agent_conversations/2026-07-03_dead-code-removal.md`

## Design Notes

- Reconfirmed the backend dead symbols with repo grep before deletion. Removed `_http_text_urllib`, `_http_text_curl`, `_youtube_videos_for_title`, `_rawg_images_for_title`, `_sanitize_videos`, `_title_match_score`, `ROM_EXTENSIONS`, and the now-orphaned constants/imports used only by that cluster.
- Preserved the live `_http_text` path and the installed native Steam Activity store integration.
- Enumerated `safeInstallStep(...)` entries in `installSteamPatches`; the native Activity entries remain `nativeActivityStorePatch` and `nativePartnerEventStorePatch`.
- Removed the uninstalled legacy Activity overlay reachability closure from `src/steam.ts`: DOM renderer, React overlay, empty-state React intercept, injected overlay CSS, route append helper, tab-hint tracker, and private helpers used only by those paths.
- Rebuilt `dist/` from the cleaned TypeScript source.

## Validation

- Baseline before deletion: `scripts/orchestration/run-quality-gates` passed.
- Backend after deletion: `./run.sh python3 -m py_compile main.py` passed.
- Backend tests after deletion: `./run.sh uv run --with pytest -- pytest -q` passed.
- Frontend after deletion: `./run.sh npx tsc --noEmit` passed.
- Build after deletion: `./run.sh npm run build` passed.
- Targeted greps confirmed the removed backend symbols and legacy Activity overlay entrypoints are absent.

## Deferred Verification

On-device sideload remains deferred per the plan: open a non-Steam game's Activity page and confirm Steam native news still renders through the native store patch.
