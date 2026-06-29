# 2026-06-28 - SteamOS Launch Parsing

## Task Objective

Implement `docs/plans/2026-06-28_steamos-launch-parsing.md` so RetroAchievements
auto-detection parses SteamOS/Linux shortcut launch commands and reports structured
diagnostic reasons when no automatic match is available.

## Files Modified

- `main.py`
- `src/types.ts`
- `src/backend.ts`
- `src/components.tsx`
- `src/i18n.ts`
- `src/steam.ts`
- `dist/index.js`
- `tests/test_launch_parsing.py`
- `tests/fixtures/launch/emu_deck_commands.json`
- `tests/fixtures/launch/flatpak_commands.json`
- `tests/fixtures/launch/proton_commands.json`

## Design Decisions

- Added a non-executing `shlex`-based candidate extractor that tokenizes shortcut
  strings, recursively inspects `bash -c` commands, expands `~` and environment
  variables, URL-decodes path tokens, and scores ROM candidates by source,
  suffix, existence, and ROM-storage path likelihood.
- Preserved the existing `resolve_retroachievements_from_path(app_id, path, title)`
  signature while routing resolution through candidate extraction and structured
  reason codes.
- Treated an existing `ra_game_ids` entry as a manual mapping and returned
  `manual_mapping_exists` without overwriting it.
- Kept frontend diagnostics minimal by adding typed reason codes and replacing the
  generic auto-detect failure toast with short actionable messages.

## Validation

- `scripts/orchestration/run-quality-gates` passed before implementation.
- `./run.sh uv run --with pytest -- pytest -q tests/test_launch_parsing.py` passed.
- `./run.sh npx tsc --noEmit` passed.
- `./run.sh npm run build` passed and regenerated `dist/index.js`.

## Deferred Verification

- Hardware verification remains deferred: test a real Steam Deck ROM shortcut
  from Steam ROM Manager or EmuDeck and confirm it either auto-resolves to a
  RetroAchievements candidate or returns a clear reason. Also confirm manual
  RetroAchievements selection still overrides auto-detection.
