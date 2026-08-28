# Non-Steam Compatibility Status Implementation

Date: 2026-08-28

## Objective

Implement the `non-steam-compatibility-status` plan. Add a per-shortcut
compatibility selector that does not change official Steam games.

## Changes

- Added the nullable `deck_compat_override` record field. The backend accepts
  only `0` through `3` or `null`.
- Preserved manual overrides through fetched metadata, Steam enrichment, scan
  saves, direct manual saves, and Steam App ID changes. `0` remains an explicit
  Unknown choice.
- Added effective-category precedence and low-nibble baseline restoration.
  The plugin restores the original category on metadata removal and dismount.
- Added the context-menu selector and native Decky modal. It uses the existing
  `save_metadata` RPC and does not update cache or runtime state after a failed
  save.
- Used one plugin-owned compatibility revision signal and a same-route history
  replacement to request a normal SteamUI render without replacing an app-store
  object.
- Documented that Automatic uses Valve's matched category. ProtonDB is not a
  source.

### Review round 01 corrections

- Added `getNativeOverview()`, which reads the exact `appStore.allApps` entry
  instead of the intentionally patched AppID getter. Context-menu insertion,
  override saves, compatibility application, and baseline restoration now use
  that native object. An official AppID cannot mutate a matched shortcut.
- Waited for `ensureMetadataCache()` before the selector opens and at the save
  boundary. A save now copies the loaded record, so it cannot replace rich
  metadata with a blank shell during bootstrap.
- Removed the unused compatibility event. Same-route history replacement is
  the sole refresh mechanism, with its path, query, hash, state, and
  missing-router behavior covered by tests.
- Corrected the context-menu patch header to describe both injected entries.

## Validation

- `./run.sh uv run --with pytest -- pytest -q tests/test_steam_appid_override.py tests/test_deck_compat.py` — passed (15 tests).
- `./run.sh npm test -- --run src/steam/metadataPatch.test.ts` — passed (15 tests).
- `./run.sh npm test -- --run src/compatibilityStatusModal.test.tsx src/contextMenuPatch.test.tsx` — passed (7 tests).
- `./run.sh scripts/orchestration-hooks/quality-gates` — passed after all source and documentation changes (312 frontend tests and all backend tests).
- `./run.sh scripts/decky doctor --deck` at 2026-08-28 07:19 PDT — the Deck was offline. The required device verification and screenshot/JSON evidence remain outstanding. Do not create the round-complete marker until they pass.
- Review-round targeted validation — `./run.sh npx tsc --noEmit` and
  `./run.sh npx vitest run src/steam/core.test.ts src/contextMenuPatch.test.tsx
  src/compatibilityStatusModal.test.tsx src/steam/metadataPatch.test.ts` passed
  (59 tests).
- `./run.sh scripts/orchestration/run-quality-gates` and the local stage of
  `./run.sh scripts/decky verify-change dev --device --explain` passed:
  build, type check, 317 frontend tests, and backend pytest all passed.
- `./run.sh scripts/decky doctor --deck` at 2026-08-28 07:50 PDT still
  reported the Deck offline. The verification dispatcher then stopped before
  deployment with `ssh: connect to host 10.168.168.20 port 22: No route to
  host`. No on-device checks, screenshots, or focused JSON evidence could be
  collected. This external blocker leaves the round incomplete; do not create
  the round-complete marker.
