# 2026-06-29 SteamOS Shortcut Discovery

## Objective

Implement `docs/plans/2026-06-28_steamos-shortcut-discovery.md` to widen SteamOS
shortcut discovery, normalize `shortcuts.vdf` output, harden binary VDF parsing,
and add regression tests.

## Files Modified

- `main.py`
- `tests/test_shortcuts_vdf.py`
- `tests/test_steam_paths.py`
- `tests/fixtures/shortcuts/windows.json`
- `tests/fixtures/shortcuts/steamos_srm.json`
- `docs/agent_conversations/2026-06-29_steamos-shortcut-discovery.md`

## Design Decisions

- Added a frozen `SteamInstall` dataclass and `_detect_steam_installs()` derived
  from `_detect_steam_roots()`.
- Updated Linux `_steam_userdata_roots()` to use `_detect_steam_roots()` while
  preserving the Windows candidate branch.
- Kept existing shortcut keys and added `app_id`, `appid_raw`, `exe_raw`,
  `source`, `steam_user_id`, and `shortcut_file`.
- Normalized signed Steam shortcut app IDs to unsigned 32-bit integers and
  derived missing IDs with the existing Steam shortcut CRC helper.
- Deduplicated shortcuts by `(app_id, name, exe, launch_options)` in first-seen
  order.
- Added file-size, nesting-depth, and entry-count bounds for attacker-controlled
  `shortcuts.vdf` input; invalid byte decoding uses replacement.
- Used JSON fixture specs with a test helper that writes minimal binary VDF
  files, keeping fixture content reviewable while exercising the real parser.

## Validation

- Baseline before implementation: `./run.sh scripts/orchestration/run-quality-gates`
  passed.
- Targeted TDD red run failed for missing normalized fields, root integration,
  install discovery, and parser size bounds.
- Targeted green run: `./run.sh uv run --with pytest -- pytest -q tests/test_shortcuts_vdf.py tests/test_steam_paths.py`
  passed with 9 tests.
- Backend regression: `./run.sh uv run --with pytest -- pytest -q` passed with
  21 tests.

## Deferred Verification

- Confirm on real Steam Deck hardware that primary-profile non-Steam shortcuts
  are returned by `get_local_shortcuts`.
- Confirm multiple real Steam `userdata` profiles do not crash parser or UI
  consumers.
