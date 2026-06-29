# Playhub Metadata: Native SteamOS Support Specification and Implementation Plan

**Repository:** `LoZazaMastro/Playhub-Metadata`  
**Target:** SteamOS / Steam Deck / Linux Decky Loader environments  
**Prepared:** 2026-06-28  
**Status:** Implementation specification (source of intent)  
**Primary goal:** Make Playhub Metadata operate natively on SteamOS without relying on Windows-only build, shortcut, or Xbox/UWPHook assumptions.

> **Execution note (added 2026-06-28):** This document is the design source of intent. It
> has been reviewed against the actual codebase and decomposed into eight executable
> orchestration plans (`docs/plans/2026-06-28_steamos-*.md`) to be run sequentially via the
> `orchestrated-implementation` skill. Where this spec's symbol names or UI labels differ
> from the real code, **the plans are authoritative** (e.g. harden the existing
> `_extract_shortcuts_from_vdf` / `_steam_userdata_roots` rather than the spec's
> `_parse_shortcuts_vdf` / `_detect_steam_installs`; gate the actual Xbox "scan" controls,
> not a literal "UWPHook" button). See `docs/specs/steamos-native-gap-analysis.md` for the
> full gap analysis and the plan ordering.

---

## 1. Summary: Why We Are Changing This

Playhub Metadata is already structured as a Decky Loader plugin and its manifest is broadly compatible with Steam Gaming Mode, but the current implementation and packaging are Windows-first. The README describes the plugin as built for Windows Steam Big Picture, especially non-Steam PC games, Game Pass games, Xbox App games, and UWPHook-imported games. The current package script also depends on PowerShell and a Windows packaging script.

SteamOS users need a native path that does not depend on Windows tooling, Windows Steam install discovery, UWPHook shortcuts, Xbox App/Game Pass local integrations, or Windows-only image fallback logic. The Steam Deck use case is materially different: most non-Steam entries come from Steam ROM Manager, EmuDeck, Heroic, Lutris, Bottles, Flatpak launchers, AppImages, shell wrappers, Proton shortcuts, and ROM paths located under `/home/deck`, `/run/media`, or Flatpak sandbox paths.

The intended change is to split platform-specific behavior from platform-neutral plugin behavior. Metadata, Steam activity/news enrichment, manual metadata editing, manual achievement mapping, and RetroAchievements support should become first-class on SteamOS. Xbox/OpenXBL support should remain available where technically possible, but automatic UWPHook/Xbox App detection should be treated as Windows-only.

In practical terms, this change makes Playhub Metadata safer, clearer, and more useful on SteamOS by:

- producing a Linux-buildable Decky plugin ZIP;
- detecting SteamOS/Linux capabilities at runtime;
- reading SteamOS Steam libraries and non-Steam shortcuts reliably;
- parsing Linux launch commands and ROM paths correctly;
- prioritizing RetroAchievements for Steam Deck emulation workflows;
- disabling or relabeling Windows-only Xbox/UWPHook automation;
- degrading gracefully when Steam UI internals or optional image tooling are unavailable.

---

## 2. Current State Observations

### 2.1 Repository positioning

The project is a Decky Loader plugin, but its README positions it as a Windows Steam Big Picture plugin. It specifically calls out non-Steam PC games, Game Pass games, Xbox App games, and emulated games.

### 2.2 Existing feature surface

The plugin currently supports:

- missing metadata search/fetch;
- community media enrichment;
- Steam news/activity injection for matched non-Steam games;
- manual metadata editing;
- achievement display in Steam Big Picture/Gaming Mode;
- RetroAchievements integration;
- Xbox/OpenXBL integration;
- manual or automatic achievement source selection.

### 2.3 Current Windows-first assumptions

The current implementation has several platform assumptions that need to be isolated or replaced:

| Area | Current behavior | SteamOS issue |
|---|---|---|
| Packaging | `npm run package` invokes PowerShell and `package-win.ps1` | SteamOS/Linux contributors cannot build/package natively without PowerShell |
| Xbox automation | README and UX expect UWPHook for Xbox/Game Pass imported games | UWPHook/Xbox App/Game Pass are Windows workflows, not native SteamOS workflows |
| Steam discovery | Backend exposes `get_local_shortcuts`, but SteamOS root/userdata discovery needs hardened Linux handling | Linux Steam path variants are broader than Windows registry/default paths |
| Launch parsing | Achievement resolution receives concatenated shortcut executable and launch options | SteamOS launch strings use shell quoting, Flatpak wrappers, AppImages, Proton, and `/run/media` paths |
| Image handling | Xbox icon cropping uses Pillow if available or Windows PowerShell fallback | Linux must not rely on Windows PowerShell; Pillow must be optional or bundled |
| Steam UI patching | Frontend patches Steam internals for details, activity, and achievements | SteamOS client updates can change object shapes; defensive guards are mandatory |

---

## 3. Goals

### 3.1 Product goals

1. Allow the plugin to be built and packaged from SteamOS/Linux.
2. Allow the plugin to install and load through Decky Loader on SteamOS.
3. Preserve current Windows behavior unless explicitly platform-gated.
4. Make RetroAchievements detection useful for Steam Deck emulation workflows.
5. Keep manual metadata and achievement mapping functional across platforms.
6. Clearly mark Windows-only Xbox/UWPHook automation as unavailable on SteamOS.
7. Avoid Steam UI breakage if internal stores or routes change.
8. Avoid writing to volatile or managed Steam client folders unless no better option exists.

### 3.2 Engineering goals

1. Introduce a platform capabilities layer shared by backend and frontend.
2. Introduce Steam install discovery abstractions rather than scattered path checks.
3. Introduce Linux-safe command parsing for non-Steam shortcut launch strings.
4. Add test fixtures for real-world Steam Deck shortcut patterns.
5. Add cross-platform packaging that produces the same Decky-compatible ZIP layout.
6. Make optional dependencies explicit and gracefully degraded.

---

## 4. Non-Goals

The SteamOS native pass does **not** need to implement the following in the first release:

1. Native Microsoft Store/Xbox App/Game Pass installation support on SteamOS.
2. Full Xbox achievement automation without user-provided OpenXBL mapping.
3. Conversion of non-Steam achievements into real Steam achievements.
4. Full Steam ROM Manager database integration beyond shortcut/launch parsing.
5. A rewrite of the Steam UI patching layer.
6. A migration away from Decky Loader.
7. Guaranteed support for every emulator or launcher on Linux.

---

## 5. Target Behavior Matrix

| Feature | Windows | SteamOS MVP | SteamOS full support |
|---|---:|---:|---:|
| Decky plugin load | Supported | Supported | Supported |
| Metadata search/fetch | Supported | Supported | Supported |
| Manual metadata edit | Supported | Supported | Supported |
| Community media | Supported | Supported | Supported |
| Steam news/activity for matched apps | Supported | Supported with guards | Supported with guards |
| RetroAchievements manual search | Supported | Supported | Supported |
| RetroAchievements auto-detect from ROM path | Supported | Supported with Linux parser | Supported with EmuDeck/SRM heuristics |
| Xbox/OpenXBL manual title search | Supported | Supported | Supported |
| Xbox/UWPHook auto-detect | Supported | Disabled/relabelled Windows-only | Disabled/relabelled Windows-only |
| Xbox App/Game Pass native scan | Supported through Windows shortcut workflow | Not supported | Not supported unless new Linux workflow exists |
| Cropped Xbox icons | Supported through Pillow/PowerShell fallback | Supported with Pillow or graceful no-crop fallback | Supported with safer cache/proxy path |
| Linux packaging | Not currently primary | Supported | Supported in CI |

---

## 6. Architecture Changes

### 6.1 Add platform capabilities API

Add a backend callable that reports platform and feature support.

**Backend file:** `main.py`  
**Frontend file:** `src/backend.ts`  
**New callable:** `get_platform_capabilities`

#### Backend return shape

```python
async def get_platform_capabilities(self) -> dict[str, Any]:
    return {
        "platform": sys.platform,
        "os_name": os.name,
        "is_linux": sys.platform.startswith("linux"),
        "is_windows": os.name == "nt",
        "is_steamos": self._is_steamos(),
        "steam_root": str(self._detect_steam_root() or ""),
        "steam_roots": [str(path) for path in self._detect_steam_roots()],
        "has_pillow": Image is not None,
        "supports_metadata": True,
        "supports_steam_activity": True,
        "supports_retroachievements": True,
        "supports_retroachievements_auto": True,
        "supports_xbox_manual": True,
        "supports_xbox_uwphook_auto": os.name == "nt",
        "supports_xbox_app_scan": os.name == "nt",
        "supports_loopback_icons": self._can_use_loopback_icons(),
        "supports_localhost_icon_proxy": self._image_proxy_port > 0,
    }
```

#### Frontend TypeScript type

```ts
export interface PlatformCapabilities {
  platform: string;
  os_name: string;
  is_linux: boolean;
  is_windows: boolean;
  is_steamos: boolean;
  steam_root: string;
  steam_roots: string[];
  has_pillow: boolean;
  supports_metadata: boolean;
  supports_steam_activity: boolean;
  supports_retroachievements: boolean;
  supports_retroachievements_auto: boolean;
  supports_xbox_manual: boolean;
  supports_xbox_uwphook_auto: boolean;
  supports_xbox_app_scan: boolean;
  supports_loopback_icons: boolean;
  supports_localhost_icon_proxy: boolean;
}
```

#### Frontend callable

```ts
export const getPlatformCapabilities = callable<[], PlatformCapabilities>(
  "get_platform_capabilities"
);
```

#### UI use

The frontend must load capabilities during plugin initialization and use them to:

- hide or disable Xbox/UWPHook auto-scan on SteamOS;
- show explanatory copy for Windows-only Xbox automation;
- keep manual OpenXBL search/mapping visible;
- enable RetroAchievements auto-resolution only when supported;
- conditionally show diagnostic details in settings.

---

### 6.2 Add Steam install discovery abstraction

Create a small internal abstraction for Steam roots and user data instead of ad hoc path checks.

**New backend helpers:**

```python
@dataclass(frozen=True)
class SteamInstall:
    root: Path
    userdata_dirs: list[Path]
    shortcut_files: list[Path]
    libraryfolders_files: list[Path]
    appmanifest_dirs: list[Path]
```

**Candidate roots to check on SteamOS/Linux:**

```text
$STEAM_COMPAT_CLIENT_INSTALL_PATH
$HOME/.local/share/Steam
$HOME/.steam/steam
$HOME/.steam/root
$HOME/.var/app/com.valvesoftware.Steam/.local/share/Steam
/run/media/*/SteamLibrary
/run/media/*/steamapps
```

**Candidate roots to check on Windows:**

```text
Windows registry SteamPath / InstallPath
%PROGRAMFILES(X86)%\Steam
%PROGRAMFILES%\Steam
```

**Discovery requirements:**

1. Return multiple roots, not just one.
2. Do not assume the first root is writable.
3. Treat symlinks carefully and normalize with `Path.resolve()` where possible.
4. Do not fail if any candidate path is unreadable.
5. Log diagnostics at debug/info level, not as user-facing errors.

---

### 6.3 Read SteamOS non-Steam shortcuts reliably

Steam non-Steam shortcuts are stored under user data directories in `config/shortcuts.vdf`. This file is binary VDF-like data, not ordinary text VDF.

**Implementation requirement:**

```python
def read_non_steam_shortcuts(self) -> list[dict[str, Any]]:
    installs = self._detect_steam_installs()
    shortcuts = []
    for install in installs:
        for shortcut_file in install.shortcut_files:
            shortcuts.extend(self._parse_shortcuts_vdf(shortcut_file))
    return self._dedupe_shortcuts(shortcuts)
```

**Output fields should normalize to existing frontend shape:**

```python
{
    "app_id": int,
    "name": str,
    "exe": str,
    "start_dir": str,
    "launch_options": str,
    "shortcut_path": str,
    "icon": str,
    "source": "steam_shortcuts_vdf",
    "steam_user_id": str,
}
```

**Parser requirements:**

1. Support Windows and Linux shortcut fields.
2. Preserve original raw values for debugging.
3. Strip surrounding quotes only after retaining original value.
4. Decode invalid bytes with replacement rather than throwing.
5. Do not require Steam to be closed.
6. Deduplicate by `app_id`, `name`, `exe`, and `launch_options`.

---

### 6.4 Parse Linux launch commands for ROM discovery

RetroAchievements auto-resolution should not receive an opaque string and hope for the best. It should receive normalized candidate paths extracted from executable, start directory, and launch options.

**New function:**

```python
def extract_candidate_game_paths(
    self,
    exe: str,
    launch_options: str = "",
    start_dir: str = "",
) -> list[Path]:
    ...
```

**Linux parsing requirements:**

Use `shlex.split(..., posix=True)` on Linux and SteamOS. Handle:

- quoted ROM paths;
- escaped spaces;
- `$HOME` and `~`;
- `%command%` placeholders;
- `/run/media/...` SD card paths;
- `/home/deck/Emulation/roms/...` paths;
- Flatpak wrapper commands;
- AppImage launchers;
- shell wrappers such as `/usr/bin/bash -c "..."`;
- Proton launchers;
- Steam ROM Manager generated launch commands;
- EmuDeck conventions;
- paths passed through emulator CLI flags.

**Candidate selection rules:**

1. Prefer existing files with suffixes in `ROM_EXTENSIONS`.
2. Include archive paths and multi-disc playlist paths such as `.m3u`.
3. Include quoted paths even when the file is temporarily unavailable, but mark them `exists=false`.
4. Normalize path separators and decode URL-encoded segments if present.
5. Score candidates by likelihood, not just first match.

**Return shape:**

```python
{
    "path": str,
    "exists": bool,
    "suffix": str,
    "source": "launch_options" | "exe" | "start_dir" | "shell_command",
    "score": float,
}
```

---

### 6.5 Refactor RetroAchievements resolution

The current API accepts `app_id`, `path`, and `title`. Keep this callable for compatibility but route it through the new parser.

**Existing callable to preserve:**

```python
async def resolve_retroachievements_from_path(self, app_id: int, path: str, title: str = "")
```

**New internal flow:**

```text
shortcut details
  -> extract_candidate_game_paths()
  -> hash candidate ROMs if supported
  -> query RetroAchievements hash library / API
  -> save resolved game_id
  -> fetch achievements
```

**Resolution requirements:**

1. Do not hit RetroAchievements if no plausible ROM path or known RA game ID exists.
2. Cache failed path hashes for a short period to avoid repeated API calls.
3. Cache successful app-to-RA-game mapping in existing `ra_game_ids` storage.
4. Support manual override; never replace a manual RA mapping unless user requests it.
5. Surface diagnostic reason codes to frontend:
   - `no_candidate_path`
   - `candidate_missing`
   - `unsupported_extension`
   - `hash_not_found`
   - `api_credentials_missing`
   - `api_error`
   - `matched`

---

### 6.6 Gate Xbox/UWPHook behavior by platform

Xbox/OpenXBL support should be split into two features:

1. **Manual Xbox/OpenXBL title mapping** — cross-platform.
2. **Automatic UWPHook/Xbox App detection** — Windows-only.

**SteamOS behavior:**

- Hide or disable “scan UWPHook games”.
- Do not call `resolve_xbox_from_shortcut` automatically unless `supports_xbox_uwphook_auto` is true.
- Keep `search_xbox_titles` available if OpenXBL credentials are configured.
- Allow user to manually assign Xbox title IDs.
- Label manual Xbox support as “Manual OpenXBL title mapping”.

**Frontend logic:**

```ts
if (!capabilities.supports_xbox_uwphook_auto) {
  disableXboxAutoScan();
  showXboxManualOnlyNotice();
}
```

**Backend logic:**

```python
def _resolve_xbox_from_shortcut_sync(self, app_id: int, title: str = "", path: str = ""):
    if os.name != "nt":
        return {
            "ok": False,
            "reason": "uwphook_auto_unsupported_on_platform",
            "manual_supported": True,
        }
    ...
```

---

### 6.7 Harden image/icon handling

The current image path supports a local HTTP image proxy and a Steam loopback icon strategy. It also relies on Pillow when available and Windows PowerShell as a fallback cropper.

**SteamOS requirements:**

1. Never require Windows PowerShell on Linux.
2. Treat Pillow as optional unless it is explicitly bundled.
3. If Pillow is unavailable, return uncropped icon URLs or skip cropping gracefully.
4. Do not fail achievement fetch because icon processing failed.
5. Prefer Decky plugin settings/cache directories for generated images.
6. Use Steam `steamui` loopback write only if it is confirmed writable and stable.
7. Log fallback mode:
   - `pillow`
   - `no_crop`
   - `loopback_unavailable`
   - `proxy_unavailable`

**Recommended implementation:**

```python
def _xbox_cropper_name(self) -> str:
    if Image is not None:
        return "pillow"
    if os.name == "nt" and self._windows_powershell_executable():
        return "windows"
    return "none"
```

For Linux, `none` should still allow the rest of the achievement payload to load.

---

### 6.8 Add defensive Steam UI guards

The frontend interacts with internal Steam objects such as `appStore`, `appDetailsStore`, `appDetailsCache`, `appAchievementProgressCache`, `SteamClient`, route hooks, app detail routes, activity routes, and achievement routes. These internal shapes can change across SteamOS Stable/Beta/Preview updates.

**Requirements:**

1. Check every internal object before using it.
2. Wrap every patch registration in try/catch.
3. Return unpatch handles only when patch installation succeeds.
4. Avoid assuming `m_mapAppOverview` or `allApps` exists.
5. Avoid assuming `SteamClient.Apps.GetAppDetails` exists.
6. Disable only the affected feature if a Steam internal is unavailable.
7. Surface diagnostic status in plugin settings.

**Pattern:**

```ts
const hasSteamInternals = () => {
  return !!globalThis.SteamClient && !!appStore && !!appDetailsStore;
};

if (!hasSteamInternals()) {
  log.warn("Playhub Metadata: Steam internals unavailable; UI patches skipped");
  return [];
}
```

---

## 7. Files to Change

### 7.1 `package.json`

Add platform-neutral scripts.

```json
{
  "scripts": {
    "build": "rollup -c",
    "watch": "rollup -c -w",
    "package": "node ./scripts/package.mjs",
    "package:linux": "node ./scripts/package.mjs",
    "package:win": "powershell -NoProfile -ExecutionPolicy Bypass -File ./package-win.ps1"
  }
}
```

### 7.2 `scripts/package.mjs` - new

Create a Node-based packager that runs on Windows, Linux, and SteamOS.

**Responsibilities:**

- clean staging directory;
- create Decky plugin folder;
- copy `main.py`, `package.json`, `plugin.json`, `LICENSE`, optional `NOTICE`, and `dist/index.js`;
- optionally copy `dist/index.js.map`;
- generate installer ZIP;
- optionally generate project ZIP;
- avoid platform-specific separators;
- prevent deleting paths outside the repository.

### 7.3 `package-win.ps1`

Keep for compatibility, but do not make it the default `package` script.

### 7.4 `main.py`

Add or update:

- `get_platform_capabilities` callable;
- `_is_steamos()`;
- `_detect_steam_roots()`;
- `_detect_steam_installs()`;
- `_parse_shortcuts_vdf()`;
- `_read_steam_shortcuts()` integration with Linux discovery;
- `extract_candidate_game_paths()`;
- Linux-safe RetroAchievements resolution path;
- platform-gated Xbox shortcut resolution;
- Linux-safe icon fallback behavior;
- diagnostic logging.

### 7.5 `src/backend.ts`

Add:

- `PlatformCapabilities` type;
- `getPlatformCapabilities` callable.

### 7.6 `src/types.ts`

Add shared types:

- `PlatformCapabilities`;
- `ShortcutCandidatePath`;
- `PlatformFeatureStatus` if desired;
- optional achievement resolution reason codes.

### 7.7 `src/components.tsx`

Update UI behavior:

- load capabilities once at panel start;
- hide Windows-only scan buttons on SteamOS;
- show manual Xbox mapping only;
- show RA auto-resolution diagnostics;
- show platform diagnostics in settings.

### 7.8 `src/steam.ts`

Update Steam integration:

- guard Steam internals before patching;
- ensure app discovery does not depend on one Steam object shape;
- pass structured shortcut details to backend where possible;
- avoid triggering Xbox auto-resolution on SteamOS;
- keep RA background sync limited to plausible candidates.

### 7.9 Tests / fixtures - new

Recommended locations:

```text
tests/fixtures/shortcuts/windows_shortcuts.vdf
tests/fixtures/shortcuts/steamos_srm_shortcuts.vdf
tests/fixtures/launch/emu_deck_commands.json
tests/fixtures/launch/flatpak_commands.json
tests/fixtures/launch/proton_commands.json
tests/test_steam_paths.py
tests/test_shortcuts_vdf.py
tests/test_launch_parsing.py
tests/test_platform_capabilities.py
```

---

## 8. Detailed Implementation Plan

### Phase 0: Baseline and safety

**Objective:** Establish current behavior and avoid regressions.

Tasks:

1. Build current plugin on Windows using existing `package-win.ps1`.
2. Install current release on a Steam Deck test device or SteamOS-like Bazzite device.
3. Record current failure modes:
   - plugin load success/failure;
   - metadata fetch success/failure;
   - shortcut discovery result count;
   - RA manual search;
   - RA auto-detection;
   - Xbox manual search;
   - Xbox scan behavior;
   - UI patch stability.
4. Capture logs from Decky.
5. Create a `steamos-native` branch.

Deliverable:

- Baseline notes attached to the branch or issue.

Acceptance criteria:

- Current Windows package behavior is documented.
- Current SteamOS behavior is documented.
- No code behavior is changed in this phase.

---

### Phase 1: Cross-platform packaging

**Objective:** Allow SteamOS/Linux developers to build a Decky-compatible ZIP.

Tasks:

1. Add `scripts/package.mjs`.
2. Change default `npm run package` to use the Node packager.
3. Add `npm run package:win` to preserve PowerShell path.
4. Generate the same plugin folder layout as the existing installer ZIP.
5. Validate ZIP installs through Decky sideload.
6. Add `.gitignore` entries for staging/output artifacts if needed.

Deliverable:

- `Playhub-Metadata_<version>_Installer.zip` produced from Linux and Windows.

Acceptance criteria:

- `npm install` and `npm run build` work on Linux.
- `npm run package` works on Linux.
- ZIP contains the expected files:
  - `Playhub Metadata/plugin.json`
  - `Playhub Metadata/main.py`
  - `Playhub Metadata/package.json`
  - `Playhub Metadata/dist/index.js`
  - `Playhub Metadata/LICENSE`
  - optional `Playhub Metadata/NOTICE`
- Existing PowerShell packaging still works via `npm run package:win`.

---

### Phase 2: Platform capabilities

**Objective:** Let backend and frontend agree on available features.

Tasks:

1. Implement `_is_steamos()` using `/etc/os-release` and SteamOS-specific identifiers.
2. Implement `_detect_steam_roots()`.
3. Add `get_platform_capabilities` backend callable.
4. Add `PlatformCapabilities` type.
5. Add `getPlatformCapabilities` frontend callable.
6. Load capabilities at plugin panel initialization.
7. Store capabilities in state/context.
8. Add small diagnostics panel in settings.

Deliverable:

- UI can show whether it is running on Windows, Linux, SteamOS, or unknown Linux.

Acceptance criteria:

- SteamOS reports `is_linux=true` and `is_steamos=true`.
- Windows reports `is_windows=true`.
- Xbox UWPHook auto support reports true only on Windows.
- RetroAchievements support reports true on SteamOS.
- Missing `/etc/os-release` does not crash plugin.

---

### Phase 3: SteamOS Steam root and shortcut discovery

**Objective:** Read non-Steam games from SteamOS userdata reliably.

Tasks:

1. Implement `SteamInstall` abstraction.
2. Detect Steam roots from environment, common home paths, Flatpak path, and mounted SD card paths.
3. Locate `userdata/*/config/shortcuts.vdf`.
4. Implement or harden binary shortcuts VDF parser.
5. Normalize shortcut fields to existing `GameOption` frontend type.
6. Add deduplication.
7. Add logs for discovered roots and parsed shortcut counts.
8. Add tests using fixtures.

Deliverable:

- `get_local_shortcuts` returns SteamOS non-Steam entries.

Acceptance criteria:

- Steam Deck shortcuts from the primary profile are detected.
- Shortcuts from multiple userdata directories do not crash parser.
- Missing or corrupt `shortcuts.vdf` does not crash plugin.
- Existing Windows shortcut behavior is preserved.
- Returned entries include app ID, name, executable, start directory, launch options, and source file path.

---

### Phase 4: Linux launch parsing for RetroAchievements

**Objective:** Resolve RA games from Steam Deck launch commands.

Tasks:

1. Implement `extract_candidate_game_paths()`.
2. Add Linux `shlex.split` parsing.
3. Add recursive handling for shell wrapper commands.
4. Add environment and home expansion.
5. Add candidate scoring.
6. Integrate with existing `resolve_retroachievements_from_path` flow.
7. Add frontend diagnostics for failure reason.
8. Add tests for:
   - Steam ROM Manager commands;
   - EmuDeck commands;
   - Flatpak RetroArch commands;
   - AppImage commands;
   - paths with spaces;
   - SD card `/run/media` paths;
   - shell `bash -c` launchers;
   - Proton shortcuts.

Deliverable:

- RA auto-detection works for common Steam Deck emulator shortcuts.

Acceptance criteria:

- A quoted ROM path with spaces is extracted correctly.
- A Flatpak RetroArch launch command yields the ROM path, not the Flatpak binary.
- A shell wrapper command yields the inner ROM path.
- Missing ROM files produce a diagnostic, not an exception.
- Manual RA game selection still overrides auto-detection.
- No network call is made when no plausible candidate exists.

---

### Phase 5: Xbox/OpenXBL platform gating

**Objective:** Remove misleading Xbox auto-scan behavior from SteamOS while preserving manual mapping.

Tasks:

1. Split frontend Xbox UI into:
   - manual OpenXBL settings/search/mapping;
   - Windows-only UWPHook scan.
2. Gate UWPHook scan with `supports_xbox_uwphook_auto`.
3. Gate Xbox App/Game Pass wording by platform.
4. Backend returns reason code when auto-resolution is called on unsupported platforms.
5. Do not run background Xbox auto-detection on SteamOS.
6. Keep `search_xbox_titles` and `set_xbox_title_id` available on SteamOS.

Deliverable:

- SteamOS UI clearly shows manual Xbox mapping only.

Acceptance criteria:

- SteamOS does not show a working-looking “Scan UWPHook games” button.
- Manual Xbox title search still works with an OpenXBL API key.
- Windows keeps existing UWPHook scan behavior.
- Unsupported platform calls return a structured reason instead of `None` or an opaque error.

---

### Phase 6: Image and icon fallback hardening

**Objective:** Ensure icons never block achievements or metadata.

Tasks:

1. Make `Pillow` the only Linux cropper.
2. Remove Linux reliance on PowerShell fallback.
3. Add `no_crop` fallback path.
4. Confirm local proxy startup failures do not break achievement payloads.
5. Confirm loopback write failures do not break achievement payloads.
6. Store generated files under Decky settings/cache where possible.
7. Add diagnostics for icon mode.

Deliverable:

- SteamOS can display achievements even when icon cropping is unavailable.

Acceptance criteria:

- Linux without Pillow still fetches achievements.
- Linux with Pillow crops icons if code path is enabled.
- SteamUI folder unwritable state logs fallback and continues.
- Local image proxy failure logs fallback and continues.

---

### Phase 7: Steam UI defensive guards

**Objective:** Reduce plugin breakage from Steam client updates.

Tasks:

1. Audit every access to global Steam internals.
2. Add helper predicates for required internal features.
3. Wrap route patches and store patches in try/catch.
4. Make each patch independently optional.
5. Add settings diagnostics for patch install status.
6. Avoid repeated patch attempts after hard failure unless plugin reloads.

Deliverable:

- Plugin degrades feature-by-feature when Steam internals change.

Acceptance criteria:

- Missing achievement progress cache disables achievement UI patch only.
- Missing activity store disables activity patch only.
- Metadata panel remains available if achievement patch fails.
- Plugin does not crash Steam UI when a patch target is missing.

---

### Phase 8: SteamOS integration testing

**Objective:** Validate on real hardware or close equivalent.

Test environments:

1. Steam Deck OLED or LCD on SteamOS Stable.
2. Steam Deck on SteamOS Beta or Preview if available.
3. Bazzite or ChimeraOS device as a Linux Decky comparison.
4. Windows Steam Big Picture to verify no regression.

Test cases:

| Test | Expected result |
|---|---|
| Install ZIP through Decky | Plugin loads |
| Open plugin settings | No crash; capabilities visible |
| Fetch metadata for non-Steam game | Metadata saved and rendered |
| Search/edit metadata manually | Changes persist |
| Detect SteamOS shortcuts | Non-Steam shortcuts listed |
| RA manual search | Game can be mapped |
| RA auto-detect from SRM shortcut | Candidate ROM path resolved |
| RA auto-detect from Flatpak RetroArch | Candidate ROM path resolved |
| Xbox manual OpenXBL search | Search results appear if configured |
| Xbox UWPHook scan on SteamOS | Hidden/disabled with explanatory copy |
| Steam activity refresh | Works for matched Steam app or gracefully reports no match |
| Restart Steam | Plugin state persists |
| Restart Deck | Plugin state persists |

Deliverable:

- Test report with pass/fail notes and logs.

Acceptance criteria:

- No Steam UI crash during normal navigation.
- No unhandled backend exception for missing files/paths.
- RA path parsing passes fixture tests and at least one real Steam Deck shortcut test.
- Windows core behavior remains intact.

---

## 9. Data and Storage

### 9.1 Existing storage to preserve

Existing settings/data should remain compatible:

```text
playhub_metadata.json
metadata
settings.retroachievements
settings.xbox
settings.achievement_cache
ra_game_ids
xbox_title_ids
xbox_achievement_payloads
achievement_sources
```

### 9.2 New optional storage

Add optional diagnostic/cache fields without requiring migration:

```json
{
  "platform_cache": {
    "last_platform": "linux",
    "last_is_steamos": true,
    "last_steam_root": "/home/deck/.local/share/Steam"
  },
  "path_resolution_cache": {
    "<app_id>": {
      "last_launch_hash": "...",
      "candidates": [],
      "last_reason": "no_candidate_path",
      "updated_at": 1782662400
    }
  }
}
```

Rules:

1. Absence of these fields must not break old installs.
2. Existing data files should be extended lazily.
3. User credentials and API keys must not be duplicated into diagnostics.
4. Path diagnostics may contain local paths; keep them local only.

---

## 10. Error Handling and Diagnostics

### 10.1 Backend reason codes

Use reason codes instead of opaque `None` returns where practical.

```text
platform_unsupported
uwphook_auto_unsupported_on_platform
steam_root_not_found
shortcuts_file_not_found
shortcuts_parse_error
no_candidate_path
candidate_missing
unsupported_extension
hash_not_found
api_credentials_missing
api_error
matched
manual_mapping_exists
icon_cropper_unavailable
loopback_unavailable
proxy_unavailable
```

### 10.2 Frontend presentation

User-facing copy should be short and actionable:

- “Xbox automatic scanning is Windows-only because it depends on UWPHook/Xbox App shortcuts. Manual OpenXBL title mapping is still available.”
- “No ROM path was detected from this Steam shortcut. Use manual RetroAchievements search or check the launch options.”
- “Icon cropping is unavailable on this system. Achievements will still load; icons may be uncropped or missing.”

---

## 11. Testing Strategy

### 11.1 Unit tests

Focus unit tests on pure backend helpers:

- Steam root discovery from mocked home/env paths;
- binary shortcut parser;
- launch command tokenizer;
- candidate ROM scoring;
- platform capability calculation;
- icon cropper mode selection;
- Xbox gating logic.

### 11.2 Fixture examples

Add fixture launch commands similar to:

```text
/usr/bin/flatpak run org.libretro.RetroArch -L /app/lib/cores/snes9x_libretro.so "/home/deck/Emulation/roms/snes/Chrono Trigger.sfc"
```

```text
/home/deck/Applications/EmulationStation-DE.AppImage --no-splash
```

```text
/usr/bin/bash -c "'/home/deck/Applications/PCSX2-Qt.AppImage' -batch '/run/media/mmcblk0p1/Emulation/roms/ps2/Shadow of the Colossus.chd'"
```

```text
STEAM_COMPAT_DATA_PATH='/home/deck/.local/share/Steam/steamapps/compatdata/123' %command%
```

### 11.3 Manual QA

Manual QA should include:

1. At least one ROM shortcut generated by Steam ROM Manager.
2. At least one Flatpak emulator shortcut.
3. At least one AppImage emulator shortcut.
4. At least one non-emulated Linux game shortcut.
5. At least one Windows non-Steam shortcut under Proton.
6. Manual Xbox/OpenXBL title mapping.
7. Metadata-only use with no achievement credentials configured.

---

## 12. Release Plan

### 12.1 Versioning

Recommended release version: `1.5.0`.

Reason: this is a feature release with platform behavior changes, packaging changes, and new backend/frontend callables.

### 12.2 Release notes draft

```text
Playhub Metadata 1.5.0 adds first-class SteamOS/Linux support.

Highlights:
- Added Linux/SteamOS-compatible packaging.
- Added platform capability detection.
- Added SteamOS Steam root and shortcut discovery.
- Improved RetroAchievements auto-detection for Steam Deck launch commands.
- Kept manual OpenXBL/Xbox title mapping available cross-platform.
- Marked UWPHook/Xbox App automatic scanning as Windows-only.
- Hardened Steam UI patching and icon fallback behavior.
```

### 12.3 Documentation updates

Update README sections:

1. Supported platforms:
   - Windows Steam Big Picture
   - SteamOS / Steam Deck through Decky Loader
2. SteamOS feature matrix.
3. Installation from Decky sideload ZIP.
4. RetroAchievements on Steam Deck.
5. Xbox/OpenXBL limitations on SteamOS.
6. Troubleshooting diagnostics.

---

## 13. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| Steam UI internals change | Plugin UI patches break | Defensive guards and feature-level degradation |
| `shortcuts.vdf` parser misses edge cases | Non-Steam games not detected | Add fixtures from real Steam Deck shortcuts |
| Linux launch strings are too varied | RA auto-detect misses some games | Candidate scoring, diagnostics, manual fallback |
| SteamUI loopback path is not writable | Icons fail | Fallback to proxy/no-crop; do not block achievements |
| OpenXBL behavior varies by title | Xbox achievements inconsistent | Keep manual mapping; label SteamOS Xbox support as manual/limited |
| Packaging ZIP layout changes | Decky install fails | Compare against existing installer ZIP layout |
| Existing Windows users regress | Current workflows break | Keep Windows path behavior and add platform gates rather than removing code |

---

## 14. Acceptance Criteria for SteamOS Native MVP

The MVP is complete when all of the following are true:

1. `npm run build` and `npm run package` run successfully on Linux/SteamOS.
2. Generated ZIP installs through Decky Loader on SteamOS.
3. Plugin opens in Steam Gaming Mode on SteamOS.
4. Metadata search/fetch/save works for at least one non-Steam shortcut.
5. `get_platform_capabilities` correctly identifies SteamOS/Linux.
6. SteamOS non-Steam shortcuts are discovered from Steam userdata.
7. RetroAchievements manual search and mapping works on SteamOS.
8. At least one common Steam Deck ROM shortcut auto-resolves to an RA candidate or returns a clear diagnostic reason.
9. Xbox/UWPHook auto-scan is hidden or disabled on SteamOS.
10. Manual Xbox/OpenXBL title mapping remains available.
11. Missing Pillow does not block achievement fetches.
12. Missing Steam internals do not crash Steam UI.
13. Windows packaging and Windows Xbox/UWPHook behavior remain available.

---

## 15. Developer Task Breakdown

### Backend

- [ ] Add `sys` and `dataclasses` imports if needed.
- [ ] Add `SteamInstall` dataclass.
- [ ] Implement `_is_steamos()`.
- [ ] Implement `_detect_steam_roots()`.
- [ ] Implement `_detect_steam_installs()`.
- [ ] Harden `_read_steam_shortcuts()` around SteamOS paths.
- [ ] Implement `_parse_shortcuts_vdf()` or replace with robust parser.
- [ ] Implement `extract_candidate_game_paths()`.
- [ ] Refactor RA path resolution to use candidates.
- [ ] Add platform-gated Xbox auto-resolution.
- [ ] Harden image cropper fallback on Linux.
- [ ] Add `get_platform_capabilities()` callable.
- [ ] Add diagnostics/reason codes.

### Frontend

- [ ] Add `PlatformCapabilities` type.
- [ ] Add `getPlatformCapabilities` callable.
- [ ] Load capabilities at startup.
- [ ] Gate Xbox/UWPHook scan UI.
- [ ] Keep manual Xbox mapping UI.
- [ ] Add RA path diagnostic copy.
- [ ] Guard Steam internals in `src/steam.ts`.
- [ ] Add settings diagnostics panel.

### Packaging

- [ ] Add `scripts/package.mjs`.
- [ ] Update `package.json` scripts.
- [ ] Preserve `package-win.ps1` as `package:win`.
- [ ] Verify ZIP layout.
- [ ] Update release documentation.

### Tests

- [ ] Add launch command fixtures.
- [ ] Add shortcut VDF fixtures.
- [ ] Add platform detection tests.
- [ ] Add candidate path extraction tests.
- [ ] Add Xbox gating tests.
- [ ] Add Linux packaging smoke test.

---

## 16. Open Questions

1. Should the plugin vendor Pillow for Linux, or should icon cropping remain optional?
2. Should SteamOS diagnostics expose full local paths, or redact usernames/storage names?
3. Should the plugin add explicit EmuDeck/Steam ROM Manager parser modules, or keep generic command parsing for MVP?
4. Should Xbox/OpenXBL manual mapping be shown by default on SteamOS, or hidden behind an “advanced/limited” toggle?
5. Should the installer ZIP name remain `Playhub-Metadata_<version>_Installer.zip` for all platforms?
6. Should generated loopback icons continue to be written under Steam `steamui`, or should this be replaced with a Decky-managed cache/proxy-only approach?

---

## 17. Recommended MVP Scope Cut

To keep the first SteamOS release constrained, ship only:

1. cross-platform packaging;
2. platform capabilities;
3. SteamOS shortcut discovery;
4. Linux launch path parsing;
5. RetroAchievements auto/manual support;
6. Xbox manual-only support on SteamOS;
7. icon fallback hardening;
8. defensive Steam UI guards.

Defer:

1. deep EmuDeck integration;
2. deep Steam ROM Manager metadata integration;
3. Heroic/Lutris/Bottles importers;
4. alternative icon storage architecture;
5. broad Linux distribution support beyond SteamOS/Bazzite-like environments.

---

## 18. Definition of Done

This work is done when a Steam Deck user can install the plugin through Decky, open it in Gaming Mode, enrich a non-Steam game with metadata, configure RetroAchievements, auto-detect or manually select an RA game for a ROM shortcut, and avoid misleading Windows-only Xbox scanning flows. The implementation must not regress Windows users and must fail safely when Steam internals, icon cropping, or local shortcut files are unavailable.
