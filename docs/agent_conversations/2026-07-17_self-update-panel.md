# Self-update panel implementation

## Objective

Implement the existing `self-update-panel` plan: trusted GitHub Release discovery in
the Python backend, persistent updater state, Decky Loader install handoff, and an
in-QAM update section with stable/development channel controls.

## Files changed

- Added the stdlib-only updater package under `backend/updater/` and its backend tests.
- Extended `backend/storage.py` and `main.py` with updater persistence, a shared
  re-entrant data lock, startup reconciliation, and failure-envelope RPC methods.
- Added updater types and RPC wrappers in `src/types.ts` and `src/backend.ts`.
- Added the installer bridge, reducer, controller, settings helpers, QAM section, and
  frontend tests under `src/updater/` and `src/components/qam/`.
- Mounted the section from `src/ContentPanel.tsx`, updated `README.md`, and rebuilt the
  committed `dist/index.js` bundle and source map.

## Design decisions

- Release identity is fixed to `Decky-Metadata` / `decky-metadata`; manifests and the
  whole-zip SHA-256 are validated before any candidate reaches Decky Loader.
- Network discovery and revalidation run in worker threads. A shared
  `threading.RLock` protects updater and metadata load-modify-save transactions that
  share the fixed atomic-write temp path.
- Checks snapshot the selected channel. Results from an obsolete channel are neither
  cached by the backend nor applied by the frontend.
- Local `+build` versions can discover releases but cannot invoke self-install; the
  panel directs those users to install manually from GitHub Releases.

## Accepted limitation

The updater intentionally does not port SDH-Ludusavi's cross-process singleton/file
lock machinery. During a Decky reload storm, overlapping plugin processes can both
write `decky_metadata.json`; `os.replace` prevents torn JSON, but last-writer-wins can
drop the other process's update settings, check cache, or pending-install record. A
lost pending record cannot be reconstructed from the loaded version alone, so its
practical impact is a missed automatic promotion until the next manual or automatic
check redetects state. Settings are repopulated on a later successful save.

## Validation

- Backend updater, storage, RPC, concurrency, and corruption regression tests.
- Updated the byte-stable persistence fixture to include the plan-required empty
  `update_settings` and `update_check_cache` keys; its equality assertion is unchanged.
- Frontend reducer, controller, installer, QAM behavior, and settings rollback tests.
- Full pytest, vitest, TypeScript, Rollup, orchestration quality gates, and package
  contents verification are required before the round marker is written.

## Required device-integration gate

Before any human-approved `dev` to `main` promotion, the maintainer must push the full
plugin to real Steam Deck hardware and install a genuine newer
`vX.Y.Z-dev.g<sha>` Dev Release. Record proof that Decky Loader accepts the canonical
plugin identity and whole-zip SHA-256, restarts the plugin, and startup reconciliation
promotes the pending record. The same run must include the QAM initial-focus and D-pad
order pass from `docs/runbooks/on-device-verification.md`. This host round does not
claim end-to-end update success until that gate passes.
