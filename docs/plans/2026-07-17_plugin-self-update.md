# Plan: In-plugin self-update from GitHub Releases

**Status:** Draft / proposal
**Date:** 2026-07-17
**Slug:** plugin-self-update
**Source of design:** `../SDH-ludusavi` (its `updater*` backend modules,
`pluginUpdateController` + `deckyInstaller` frontend, and release CI).

---

## 0. Groundwork landed (2026-07-17)

The enabling name/version changes are **done** so the SDH panel can be dropped
in without special-casing. Verified against Decky Loader source
(`../decky-loader/backend/decky_loader/browser.py`): plugin identity is the
`plugin.json` `name`; the install hash is the sha256 of the whole zip;
discovery only sees `v`+semver tags.

- **Identity renamed to `Decky-Metadata`** — `plugin.json` `name` and the
  `definePlugin` `name` in `src/index.tsx`. `titleView` still shows
  "Decky Metadata". So the future updater constants are fixed:
  `EXPECTED_PLUGIN_NAME = "Decky-Metadata"`, manifest `pluginName =
  "Decky-Metadata"`, `packageName = "decky-metadata"`, manifest asset name
  `Decky-Metadata-<tag>.manifest.json`. (One-time cost: existing sideloaded
  "Decky Metadata" installs must be reinstalled once.)
- **Version semantics** — `scripts/package.mjs` gained `--release-version`,
  `--release-tag`, `--channel`, `--emit-release-metadata`. Local builds still
  stamp `X.Y.Z+<hash>` (non-updatable local build); releases stamp exact
  `X.Y.Z` / `X.Y.Z-dev.g<sha>`; metadata emission writes the manifest +
  `.zip.sha256` (whole-zip digest, `sha256sum -c`-verified).
- **Dev channel** — chosen strategy: per-commit `vX.Y.Z-dev.g<sha>` semver
  prereleases via a manual `Dev Release` workflow
  (`.github/workflows/dev-release.yml`). The rolling `dev` prerelease stays for
  the on-device loop and is intentionally invisible to discovery (non-semver
  tag).
- **Stable CI** — `.github/workflows/release.yml` now guards tag ==
  package.json == plugin.json and uploads the zip + `.sha256` + `.manifest.json`.

Remaining work is the actual port (backend `updater` package + RPCs, frontend
`deckyInstaller`/controller/reducer/section) per §3 below — the two "blocking
incompatibilities" in §2 are now resolved.

---

## 1. What SDH-Ludusavi actually does

The feature is **"update this plugin to a newer GitHub release from inside the
QAM,"** not a general package installer. The mechanism has three layers.

### 1.1 The real installer is Decky Loader, not the plugin

The plugin never downloads or unzips anything itself. The frontend calls Decky
Loader's own backend RPC:

```ts
// src/utils/deckyInstaller.ts
window.DeckyBackend.callable("utilities/install_plugin")(
  url, EXPECTED_PLUGIN_NAME, version, sha256, installType
)
// installType: 2 = update, 3 = downgrade
```

Decky downloads the zip from `url`, verifies `sha256`, and installs it over the
running plugin. So the plugin's job is only to **discover a trustworthy
candidate** (URL + sha256 + version) and **hand it to Decky**.

### 1.2 Backend = discovery + validation + bookkeeping (no network install)

`py_modules/sdh_ludusavi/updater*.py`:

- **`updater_client.py`** — `GitHubReleaseClient(owner, repo)` hits
  `GET /repos/{owner}/{repo}/releases` and `/releases/tags/{tag}` with stdlib
  `urllib` + a hardened SSL context. Returns a `JsonResponse(status, headers, body)`.
- **`updater_discovery.py`** — for each release:
  - tag must be `vX.Y.Z` (parsed via `parse_plugin_version`);
  - release must carry **exactly one `.zip` asset** and **exactly one
    `<Name>-<tag>.manifest.json` asset**;
  - fetches the manifest, checks `pluginName`/`packageName`/`tag`/`version`/
    `channel` all agree, and that the manifest's `assetName` equals the zip's
    name. The **`sha256` comes from the manifest**, not computed on-device.
  - `select_candidate()` decides upgrade vs. `move_to_stable` vs.
    `downgrade_to_stable` from installed-vs-latest version + channel.
- **`updater.py` (`PluginUpdater`)** — orchestrates: 24h check cache, GitHub
  rate-limit cooldown (403/429 + `Retry-After`), `pending_update_install`
  bookkeeping, and **startup reconciliation** (`reconcile_pending_install`):
  after Decky restarts the plugin at the new version, it promotes/clears the
  pending record by comparing the loaded version to the requested one.
- Persists two blobs: `settings_payload()` (`update_channel`,
  `automatic_update_checks`) and `cache_payload()` (`update_check_cache`).

### 1.3 Frontend = orchestrate the handoff + UI

- **`controllers/pluginUpdateController.tsx`** + **`pluginUpdateReducer.ts`** —
  a `useReducer` state machine (`hydrating → idle → checking → installing →
  handoff_pending`). On install it: revalidates the candidate (re-fetches the
  release, re-checks sha256/url/version), records the pending install, then
  races the Decky installer call against a 3s timer (Decky often restarts the
  plugin mid-call, so the promise may never resolve → "handoff pending" path).
- **`components/PluginUpdateSection.tsx`** — a `PanelSection` with: installed
  version, "receive development releases" toggle, "automatically check" toggle,
  status line, candidate details, **Install / Revert**, **View Release Notes**
  (`Navigation.NavigateToExternalWeb`), **Check now**. Guards on
  `isDeckyInstallerAvailable()` and `isLocalBuild` (version containing `+`).
- Mounted as one more section inside the QAM content (`LudusaviContent.tsx`),
  wired to settings toggles and an `onInstallVersionConfirmed` callback that
  optimistically updates the shown version.

### 1.4 Release CI must produce the manifest + checksum

`release.yml` packages the zip, then emits **three** assets per `vX.Y.Z` tag:
`…-<tag>.zip`, `…-<tag>.zip.sha256`, and `…-<tag>.manifest.json` (schemaVersion,
pluginName, packageName, version, tag, channel, assetName, **sha256**). The
manifest is the trust anchor the backend validates against.

---

## 2. How the current project (Decky-Metadata) differs

| Concern | SDH-Ludusavi | Decky-Metadata today |
|---|---|---|
| GitHub releases | stable `vX.Y.Z` **+** dev semver prereleases, each with `.zip` + `.manifest.json` + `.sha256` | stable `vX.Y.Z` (asset `Decky-Metadata.zip`, `--generate-notes`) **+ rolling `dev` tag** prerelease; **no manifest, no sha256 asset** |
| Version string | `parse_plugin_version` semver w/ dev semantics | `plugin.json`/`package.json` `version`; dev builds stamped `X.Y.Z+<gitHash>` (a "local build" marker) |
| Settings store | `PluginUpdater` split settings/cache blobs | `decky_metadata.json` `{ "settings": { debug_logging }, ... }` via `Plugin._data` |
| Backend | `py_modules/` package + `service`/`coordinator` layering | flat `main.py` (`Plugin` class) + `backend/` package; **no `py_modules/`** |
| Version RPCs | via service | `get_plugin_version()`, `get_system_versions()` already exist in `main.py` |
| QAM shell | `PanelSection`s inside `LudusaviContent` | `Content` = one `<Focusable>` with section components; sections must be individually focusable (see `qam-controller-scroll-nav` memory) |
| Frontend RPC | `@decky/api` `callable` in `api/ludusaviRpc.ts` | thin wrappers in `src/backend.ts` |
| Owner/repo | `beallio/SDH-Ludusavi` | `beallio/Decky-Metadata` (`git remote` confirmed) |

### Two blocking incompatibilities to decide up front

1. **The rolling `dev` tag is invisible to SDH-style discovery.** Discovery only
   accepts tags matching `v` + semver (`prevalidate_release_candidate` requires
   `tag_name.startswith("v")` and a parseable version). The current dev channel
   publishes to a tag literally named `dev` with an in-file version of
   `X.Y.Z+<hash>`. That release would be skipped entirely, and a `+`-tagged
   installed version is treated as a non-updatable "local build."
2. **Manifest/asset naming.** Discovery wants exactly one `.zip` and one
   `<Name>-<tag>.manifest.json`. The current stable asset is the fixed name
   `Decky-Metadata.zip` (fine — it's still "one zip"), but no manifest exists.

**Recommendation: ship in two phases.** Phase 1 = **stable channel only**
(works against the existing `vX.Y.Z` tags with a manifest added). Phase 2 = dev
channel, which requires reworking the dev release to semver prerelease tags
(e.g. `v0.3.2-dev.N`) or teaching discovery about the rolling tag. Phase 1
delivers the whole user-facing feature for released users; Phase 2 is an
opt-in refinement.

---

## 3. Proposed implementation

Port the SDH design, adapting names/paths to this repo. Keep the "Decky is the
installer, we only discover + validate + hand off" architecture unchanged — it
is the safe part and shouldn't be reinvented.

### 3.1 Backend (Python)

Because this repo has no `py_modules/` package, add a small self-contained
updater package and wire it into the existing `Plugin` class.

**New files** (mirror SDH, trimmed):

- `backend/updater/__init__.py`
- `backend/updater/client.py` — `GitHubReleaseClient(owner="beallio",
  repo="Decky-Metadata")`; reuse `main.py`'s existing hardened SSL context
  (`_build_https_context`) and TLS-failure logging rather than duplicating.
- `backend/updater/discovery.py` — `parse_plugin_version`, manifest parse,
  `prevalidate_release_candidate`, `validate_*`, `select_candidate`. Constants:
  `PLUGIN_NAME = "Decky-Metadata"`, `PACKAGE_NAME = "decky-metadata"`, manifest
  asset name `f"Decky-Metadata-{tag}.manifest.json"`.
- `backend/updater/models.py` — `JsonResponse`, `UpdateCandidate`,
  `ParsedPluginVersion`, `ReleaseManifest`.
- `backend/updater/pending.py`, `rate_limit.py` — pending-install freshness +
  `Retry-After` parsing (copy near-verbatim; they're pure functions).
- `backend/updater/updater.py` — `PluginUpdater` with the same method surface:
  `load_state`, `settings_payload`/`cache_payload`, `set_channel`,
  `set_automatic_checks`, `get_context`, `check_for_update`, `revalidate`,
  `record_install_requested`, `confirm_install_handoff`,
  `clear_pending_install`, `reconcile_pending_install`, `has_pending_install`.
  Inject callbacks (`save_callback`, `log_callback`, `version_resolver`,
  `now`, `monotonic`) exactly like SDH so it stays unit-testable.

**`main.py` wiring:**

- Persist updater state inside `decky_metadata.json` under new keys
  (`update_settings`, `update_check_cache`) alongside the existing `settings`
  blob; `save_callback` = the existing `_save` path; `log_callback` = `_plog`.
- Instantiate `PluginUpdater` in `_main()`; call `load_state(...)` after
  `_data` is loaded and `reconcile_pending_install(_resolve_plugin_version())`
  on startup (this is what promotes a completed update).
- Add async RPC methods (thin wrappers, matching existing style):
  `check_for_plugin_update(current_version, force)`,
  `revalidate_plugin_update(candidate)`,
  `record_update_install_requested(candidate)`,
  `confirm_update_install_handoff(version)`,
  `clear_pending_update_install(version)`,
  `get_update_check_context()`,
  plus `get_update_settings()` / `set_update_channel()` /
  `set_automatic_update_checks()`.
- `_resolve_plugin_version()` already returns the `plugin.json` version — reuse
  it as `version_resolver`. Note the `+<hash>` dev suffix is preserved (it's the
  "local build" signal the UI already keys on).

**Dependency note (per AGENTS.md §):** no third-party Python deps — the SDH
updater is stdlib-only (`urllib`, `ssl`, `json`, `datetime`). Compliant.

### 3.2 Frontend (TypeScript/React)

**New files** (port from SDH):

- `src/steam/deckyInstaller.ts` — `isDeckyInstallerAvailable()`,
  `invokeDeckyInstaller(url, version, sha256, installType, traceId?)`.
  `EXPECTED_PLUGIN_NAME` must equal the name Decky Loader stored the plugin
  under. **Verify this on-device** — it is likely the `plugin.json` `name`
  `"Decky Metadata"` (with a space), which differs from the repo/zip folder
  `Decky-Metadata`. Getting this wrong makes install silently no-op.
- `src/updater/pluginUpdateReducer.ts` — copy the reducer + state type.
- `src/updater/pluginUpdateController.tsx` — copy the controller; repoint its
  RPC imports at new wrappers in `src/backend.ts`.
- `src/components/qam/PluginUpdateSection.tsx` — port the UI, but **conform to
  this repo's QAM focus rules**: each row that must be gamepad-reachable needs a
  focusable `Field` (`focusable`/`highlightOnFocus`), following the existing
  `VersionsSection`/`LogsSection` pattern rather than SDH's bare
  `PanelSectionRow`s (see `qam-controller-scroll-nav` memory).

**`src/backend.ts`** — add `callable` wrappers for each new RPC method.

**`src/ContentPanel.tsx`** — mount `<PluginUpdateSection>` (natural spot: just
above or below `<VersionsSection>`). Feed it `pluginVersion` (already fetched),
and add update-channel + auto-check settings loading alongside the existing
`getDebugLogging` effect. `onInstallVersionConfirmed` should optimistically set
`pluginVersion`.

**Types** — extend `src/types.ts` with `PluginUpdateCandidate`,
`UpdateCheckResult`, `UpdateCheckContext`, `UpdateChannel`.

### 3.3 Settings model

Extend the persisted settings with `update_channel: "stable" | "development"`
(default `stable`) and `automatic_update_checks: boolean` (default `true`).
These live next to `debug_logging`. Surface get/set through the same
`get_state`/save flow already used for `debug_logging`.

### 3.4 Release CI (`.github/workflows/release.yml`)

**Phase 1 (stable):** after packaging on a `vX.Y.Z` tag, additionally emit:

- `Decky-Metadata-<tag>.zip.sha256` (via `sha256sum`), and
- `Decky-Metadata-<tag>.manifest.json` with:
  `{ schemaVersion:1, pluginName:"Decky-Metadata", packageName:"decky-metadata",
  version:"<X.Y.Z>", sourceVersion:"<X.Y.Z>", tag:"<vX.Y.Z>", channel:"stable",
  assetName:"<zip asset name>", sha256:"<hash>", generatedAt:"<iso>" }`.

  Two options for the zip asset name, since discovery keys the manifest name to
  the tag but requires only "exactly one `.zip`":
  - keep uploading the fixed `Decky-Metadata.zip` and set `assetName` to that; or
  - rename the uploaded asset to `Decky-Metadata-<tag>.zip` for clarity.

  Pick one and make `assetName` match it exactly. Add the two new files to the
  `gh release create` upload list. A small `scripts/emit_release_manifest.mjs`
  (or inline bash + `jq`) keeps this readable and testable.

- Add a **version-alignment guard** (tag == `package.json` == `plugin.json`),
  mirroring SDH's release.yml, before publishing.

**Phase 2 (dev channel):** decide between (a) publishing dev builds under semver
prerelease tags `v<next>-dev.<N>` (each a real release discovery can parse) with
their own manifest, or (b) extending discovery to understand the rolling `dev`
tag. (a) matches SDH and is lower-risk; (b) avoids tag churn. Defer until Phase
1 ships.

### 3.5 Tests (mirror SDH's coverage; this repo already runs pytest + vitest)

- **pytest:** version parsing, manifest validation, `select_candidate` action
  matrix (update / move_to_stable / downgrade_to_stable / no-op), rate-limit
  cooldown, pending-install freshness + reconciliation promotion/clear, cache
  hit/expiry. (SDH has ~30 updater tests — port the behaviourally meaningful
  ones.)
- **vitest:** reducer transitions, controller happy path + handoff-pending +
  failure/rollback, `deckyInstaller` API-shape selection, `isLocalBuild` gating.
- **CI static check:** a test asserting the release workflow emits all three
  assets and that manifest field names match what `discovery.py` validates
  (prevents the manifest/discovery contract from silently drifting).

---

## 4. Suggested sequencing

1. Backend updater package + unit tests (no wiring) — pure, offline-testable.
2. `main.py` RPC wiring + settings persistence + startup reconciliation.
3. Release CI: manifest + sha256 emission + version-alignment guard; cut one
   throwaway `vX.Y.Z` test tag and confirm the three assets land.
4. Frontend: `deckyInstaller`, reducer, controller, section, `backend.ts`
   wrappers, `ContentPanel` mount + settings + tests.
5. On-device verification (per `backend-deploy-full-plugin` memory: a real
   update handoff needs the **full plugin** pushed + a genuine newer release,
   not just the UI bundle). Verify `EXPECTED_PLUGIN_NAME`, the Decky install
   call, the plugin restart, and startup reconciliation promoting the pending
   record.
6. Phase 2 (dev channel) as a follow-up.

## 5. Open questions / risks

- **`EXPECTED_PLUGIN_NAME`** — confirm the exact string Decky uses for this
  plugin before trusting the install call. (Highest-risk unknown.)
- **Rolling `dev` tag** — incompatible with discovery as-is; Phase 2 decision.
- **`+<hash>` local builds** correctly excluded from auto-install — confirm
  that's the desired behaviour for sideloaded dev testers (it matches SDH).
- **Rate-limit / offline** paths must degrade to "manual install from GitHub"
  messaging (SDH already does; keep it).
- **On-device install actually restarts the plugin mid-RPC** — the 3s
  handoff-timer race and reconciliation exist precisely for this; keep both.
