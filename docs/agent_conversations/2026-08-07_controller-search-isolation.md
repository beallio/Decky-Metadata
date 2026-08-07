# Controller Search cross-app layout isolation

## Date

2026-08-07

## Objective

Implement `controller-search-isolation` plan so non-Steam shortcut Search pages are isolated from unrelated shortcuts and supplemental sources, while native pages continue to keep only stock-expected layouts.

## Files Modified

- `docs/plans/2026-08-07_controller-search-isolation.md`
- `scripts/deck/js/check_controller_layouts.js`
- `scripts/deck/verify/smoke_controller_layouts.sh`
- `src/steam/controllerLayoutPolicy.ts`
- `src/steam/controllerLayoutPolicy.test.ts`
- `src/steam/controllerLayouts.ts`
- `src/steam/controllerLayouts.test.ts`
- `src/types.ts`
- `README.md`
- `CHANGELOG.md`

## Verification

### Task 2 red baseline and mutation

- First unit run (red baseline before fixes):
  - `./run.sh npx vitest run src/steam/controllerLayoutPolicy.test.ts src/steam/controllerLayouts.test.ts`
  - `100 passed | 3 failed`

- Mutation check (forced shortcut drop no-op):
  - `./run.sh npx vitest run src/steam/controllerLayoutPolicy.test.ts src/steam/controllerLayouts.test.ts`
  - `93 passed | 10 failed`
  - Failing test names:
    - `keeps the displayed shortcut and matched source`
    - `drops an unrelated native appid on a shortcut page`
    - `drops another shortcut and another app's injected source`
    - `drops unmatched native records on a native context when no matched source exists`
    - `keeps only the current unmatched shortcut while isolating every other shortcut`
    - `isolates inactive supplemental Search records while preserving active and native records`
    - `tracks absent and pre-existing supplemental caches and relinquishes on native query`
    - `establishes matched and no-match Search context from getters before query effects`
    - `isolates the displayed shortcut across the reproduced matched and unmatched sequence`
    - `preserves native-source filtering when a supplemental source appid is rendered natively`

- Final baseline again (post-fix):
  - `./run.sh npx vitest run src/steam/controllerLayoutPolicy.test.ts src/steam/controllerLayouts.test.ts`
  - `103 passed | 0 failed`

### Task 1/6 device probe and smoke

- `scripts/deck/deploy.sh`
  - `tunnel: already up (localhost:18081)`
  - `deploy: pushing dist/index.js -> steamdeck:/home/deck/homebrew/plugins/Decky-Metadata/dist/`
  - `scp: Connection closed`

- `mkdir -p /tmp/Decky-Metadata/verification/search-isolation`
- `ssh "${DECKY_DECK_HOST:-steamdeck}" 'cat /home/deck/homebrew/settings/Decky-Metadata/decky_metadata.json' > /tmp/Decky-Metadata/verification/search-isolation/metadata.json`
  - exit 255
  - output: `Bad owner or permissions on /etc/ssh/ssh_config.d/20-systemd-ssh-proxy.conf`

- `scripts/deck/tunnel.sh status`
  - `tunnel: down`

- `scripts/Decky-Metadata`: `scripts/orchestration/run-quality-gates`
  - all gates passed
    - Rollup build, Vitest, Python compile, pytest, version-drift, and note check
  - final line: `quality-gates: OK`

## Notes

Device smoke/proxy path for this plan could not be completed in this environment due SSH/host resolution and SSH config permissions. The code changes and unit-level verification are complete and green. No files in `docs/review/` were created or modified by this run.
