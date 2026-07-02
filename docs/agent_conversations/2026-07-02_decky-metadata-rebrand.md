# 2026-07-02 - Decky Metadata rebrand

## Objective

Implement `docs/plans/2026-07-02_decky-metadata-rebrand.md`: rebrand Playhub Metadata to Decky Metadata, reset the plugin version to `0.1.0`, remove the Xbox/OpenXBL/TrueAchievements and RetroAchievements subsystems, add inline spinner buttons for long-running metadata actions, and replace Diagnostics platform details with a versions panel.

## Files Modified

- `main.py`: removed achievement, Xbox, OpenXBL, TrueAchievements, and RetroAchievements backend endpoints and settings persistence; kept shared metadata, Steam activity, delisted-index, shortcut, and generic HTTP helpers.
- `src/backend.ts`, `src/types.ts`, `src/steam.ts`, `src/index.tsx`, `src/components.tsx`: removed achievement bridge calls, types, route registration, Steam achievement injection/sync patches, and RA/Xbox UI; added Decky Metadata labels, inline scan/delisted spinners, and the versions panel.
- `src/contextMenuPatch.tsx`, `src/log.ts`: updated user-facing display labels and log prefix while preserving internal `/playhub-metadata/` route and `playhub-metadata-edit` key.
- `plugin.json`, `package.json`, `package-lock.json`, `scripts/package.mjs`, `README.md`: updated product identity, version `0.1.0`, publish tags, packaging name, and README content/cache busters.
- `dist/index.js`, `dist/index.js.map`: rebuilt from the updated frontend sources.

## Tests Removed or Updated

- Deleted `tests/test_xbox_gating.py`: covered removed Xbox/OpenXBL gating behavior.
- Deleted `tests/test_icon_fallback.py`: covered removed achievement icon fallback behavior.
- Deleted `tests/test_launch_parsing.py`: covered removed launch-path achievement resolution behavior.
- Deleted `tests/test_rom_hashing.py`: covered removed RetroAchievements ROM hashing behavior.
- Updated `tests/test_platform_capabilities.py`: dropped assertions for removed `supports_retroachievements*` and `supports_xbox*` capability keys while keeping OS/platform capability assertions.
- Updated `tests/test_delisted_index.py`, `tests/test_logging.py`, `tests/test_import_sandbox.py`, and `tests/package_mjs_test.mjs`: removed references to deleted providers/endpoints or adjusted package identity expectations for the rebrand.

## Design Decisions

- Preserved internal `playhub*` route/key/log-area identifiers as required so the context-menu navigation and log correlation paths remain stable.
- Kept `StoreCategory.Achievements` as an incidental Steam store category enum, not part of the removed achievements subsystem.
- Restored `_safe_int` as a shared backend helper after pytest showed it is still required by kept metadata, Steam app-id, and delisted-index paths.
- Changed the generic HTTP request referer away from the removed TrueAchievements URL so kept generic fetchers no longer depend on removed provider constants.

## Validation

- `./run.sh npx tsc --noEmit` passed.
- `./run.sh npm run build` passed and regenerated `dist/`.
- `./run.sh python3 -m py_compile main.py` passed.
- `./run.sh uv run --with pytest -- pytest -q` passed.
- Grep gates passed for removed provider names, old display name, old context-menu label, and removed achievements route symbols.
- Manifest check confirmed `package.json` name/version `decky-metadata` / `0.1.0`, `plugin.json` name/version `Decky Metadata` / `0.1.0`, and publish tags without achievements/OpenXBL/TrueAchievements/Xbox.

## Deferred On-Device Verification

Steam Gaming Mode / Decky Loader verification is deferred because it cannot run in this environment:

- Confirm the QAM title reads `Decky Metadata`.
- Confirm scan and delisted-index spinners animate during real actions.
- Confirm the versions panel renders plugin, delisted-index, and metadata rows correctly.
- Confirm the context-menu label reads `Decky metadata...` and still opens the metadata page.
- Uninstall the old `Playhub Metadata` plugin before sideloading `Decky Metadata`, because the plugin name change creates a new Decky identity while internal route hooks intentionally remain shared.
