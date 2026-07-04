# 2026-07-03 Remove Windows Runtime Support

## Objective

Implement `docs/plans/2026-07-03_remove-windows-runtime.md` by removing Windows-only
backend runtime paths from the Decky Loader plugin while preserving Linux/SteamOS behavior.

## Files Modified

- `main.py`
- `src/types.ts`
- `tests/test_platform_capabilities.py`
- `dist/index.js`
- `docs/agent_conversations/2026-07-03_remove-windows-runtime.md`

## Design Notes

- Removed dead Windows helpers: `_windows_powershell_executable`,
  `_http_text_powershell`, and `_hidden_subprocess_kwargs`.
- Removed Windows Steam path discovery via `_read_windows_steam_path`, `winreg`,
  `PROGRAMFILES`, and `LOCALAPPDATA`.
- Collapsed `_detect_steam_roots` and `_steam_userdata_roots` to the Linux/SteamOS
  paths used by Decky Loader.
- Removed the `is_windows` platform capability from the backend response and the
  corresponding TypeScript field.
- Deliberately kept the browser User-Agent strings containing `Windows NT 10.0`
  because they are HTTP compatibility spoofing, not runtime platform support.
- Deliberately kept `tests/fixtures/shortcuts/windows.json` and the `windows`
  shortcut parser case because they cover imported shortcut parsing robustness.

## Validation

- Red phase: after updating `tests/test_platform_capabilities.py`, ran
  `./run.sh uv run --with pytest -- pytest -q tests/test_platform_capabilities.py`;
  it failed because `get_platform_capabilities()` still returned `is_windows`.
- Green phase: after backend/type changes, the same focused pytest command passed.
- `./run.sh npx tsc --noEmit` passed.
- `./run.sh npm run build` passed and regenerated `dist/index.js`.
- `./run.sh uv run --with pytest -- pytest -q` passed.
