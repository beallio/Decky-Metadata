# SteamOS Native Spec — Gap Analysis & Decomposition

Review of `docs/plans/playhub-metadata-steamos-native-spec.md` against the actual codebase
(`main.py`, `src/*.ts(x)`, packaging, tooling), with the gaps found and how the executable
orchestration plans address them.

## Method

Grepped `main.py` (~7,200 lines) and the frontend for every symbol the spec assumes, and
read the real implementations of Steam path discovery, the binary VDF parser, Xbox
resolution, image handling, and packaging.

## Gaps found

1. **`main.py` is not importable off-device → no unit tests possible.**
   `import decky` is unconditional (line 27) and the repo has no Python test runner. The
   spec's entire testing strategy (`tests/test_*.py` over backend helpers) cannot run as
   written. *Addressed by* `steamos-test-harness` (decky stub via `tests/conftest.py`,
   `uv run --with pytest`, pytest wired into the quality gate) — sequenced **first** so every
   later backend plan can be test-driven.

2. **Spec function names don't match the code.** The spec proposes `_parse_shortcuts_vdf`,
   `read_non_steam_shortcuts`, `_detect_steam_installs`, `_detect_steam_roots` as new. The
   code already has `_read_steam_shortcuts`, `_extract_shortcuts_from_vdf`,
   `_parse_binary_vdf_object`, `_vdf_get`, and `_steam_userdata_roots`. *Addressed by*
   `steamos-platform-capabilities` (adds `_detect_steam_roots`) and
   `steamos-shortcut-discovery` (hardens the **existing** parser/roots instead of forking
   parallel functions).

3. **Narrow Linux Steam-root coverage.** `_steam_userdata_roots` only checks
   `~/.local/share/Steam` and `~/.steam/steam`; missing `$STEAM_COMPAT_CLIENT_INSTALL_PATH`,
   `~/.steam/root`, the Flatpak path, and `/run/media/*` SD-card paths. *Addressed by*
   `steamos-platform-capabilities` + `steamos-shortcut-discovery`.

4. **Shortcut output not normalized.** Existing parser emits raw fields but no int `app_id`,
   `source`, `steam_user_id`, or dedup. *Addressed by* `steamos-shortcut-discovery`.

5. **Missing imports.** The spec's capabilities use `sys.platform` but `main.py` does not
   `import sys`; launch parsing needs `shlex`, also not imported. *Addressed by* the
   capabilities and launch-parsing plans respectively.

6. **Frontend UI labels in the spec don't exist.** The spec references a "Scan UWPHook
   games" button, `disableXboxAutoScan()`, and `OpenXBL`-labelled controls. The frontend
   uses "Xbox"/"scan" terminology (no literal "UWPHook"/"OpenXBL"). *Addressed by*
   `steamos-xbox-gating`, which instructs the implementer to locate the **actual** controls
   in `src/components.tsx` / `src/steam.ts` and gate them on
   `capabilities.supports_xbox_uwphook_auto`.

7. **`SteamClient.Apps.GetAppDetails` is referenced but unused** (0 occurrences). *Addressed
   by* `steamos-ui-guards`, which guards the internals actually accessed (`appStore`,
   `appDetailsStore`, `appAchievementProgressCache`, `m_mapAppOverview`, `allApps`, …) rather
   than inventing code for an unused symbol.

8. **Packaging cannot run on Linux and Node has no built-in zip.** `pnpm` is absent (use
   `npm`); a system `zip` binary can't be assumed. *Addressed by* `steamos-packaging`, which
   specifies a dependency-free `node:zlib`-based ZIP writer and keeps `package-win.ps1` as
   `package:win`.

9. **Phases 0 and 8 are not codeable.** Baseline capture and on-device hardware testing are
   manual. They are folded into each plan's **Deferred verification** section rather than
   given their own implementer plan.

## Decomposition (8 sequential orchestration plans)

Order respects dependencies (capabilities feed Xbox gating, icon diagnostics, and UI guards;
discovery feeds launch parsing):

1. `steamos-test-harness` — pytest + decky stub + gate wiring (foundation)
2. `steamos-packaging` — cross-platform Node packager
3. `steamos-platform-capabilities` — `get_platform_capabilities` + helpers + frontend + diagnostics
4. `steamos-shortcut-discovery` — extend roots, normalize/dedupe shortcuts
5. `steamos-launch-parsing` — `extract_candidate_game_paths` + RA resolution + reason codes
6. `steamos-xbox-gating` — platform-gate UWPHook auto; keep manual OpenXBL
7. `steamos-icon-fallback` — Pillow-only/no-crop fallback; never block achievements
8. `steamos-ui-guards` — defensive Steam-internal guards; README + 1.5.0 version bump

Each plan is independently verifiable off-device (unit tests + tsc/build gate); real Steam
Deck validation is the deferred, human-gated step.
