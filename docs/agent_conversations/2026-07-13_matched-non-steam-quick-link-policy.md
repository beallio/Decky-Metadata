# Matched Non-Steam Quick-Link Policy — 2026-07-13

## Objective

Implement the approved matched-shortcut quick-link policy from
`docs/plans/2026-07-13_matched-non-steam-quick-link-policy.md`: persist Steam
DLC / Points Shop availability, transform Steam's native quick-link descriptors
for matched non-Steam shortcuts, retain never-on-Steam row suppression, and add
deterministic device coverage.

## Design decisions

- Successful Steam app-details responses always publish
  `steam_dlc_appids` and `has_points_shop`, including empty / false values, so a
  refresh clears stale capability data. A failed response leaves saved values
  untouched.
- Legacy metadata derives Points Shop support from Steam category `29` only when
  no explicit boolean exists. Explicit `false` therefore wins after a successful
  refresh.
- Quick-link classification uses `HelpAppPage`, `GameHub`, and stable Steam URL
  paths rather than localized labels.
- The pure policy removes native DLC / Points descriptors before inserting one
  normalized descriptor for each known capability. Inserted URLs always use the
  matched Steam appid.
- Runtime URL-builder discovery is cached separately from the pure policy. Steam
  localization and URL helpers are preferred, with deterministic English labels
  and public Steam URLs as fallbacks.
- SteamUI integration walks React elements / arrays only. It keeps stable caches
  for both the info-section wrapper and native quick-links wrapper, and never
  enumerates or clones MobX overview/details/store instances.
- The existing body-text `Developer` smoke marker is retained, but the probe now
  also reads the already-rendered details boundary through DOM-attached React
  fibers. This prevents an off-viewport developer row from producing a false
  metadata-loss failure while still requiring a non-empty description and
  developer array. The change was made after the live trace proved both fields
  remained populated when `document.body.innerText` omitted the row.

## Files changed

- `backend/providers/steam.py`
- `main.py`
- `src/types.ts`
- `src/metadataForm.ts`
- `src/steam/quickLinkPolicy.ts`
- `src/steam/quickLinkResources.ts`
- `src/steam/quickLinkPolicy.test.ts`
- `src/steam/routerPatches.ts`
- `src/steam/install.ts`
- `scripts/deck/js/check_quicklinks.js`
- `scripts/deck/verify/smoke_quicklinks.sh`
- `scripts/deck/verify/smoke_idle_quicklinks.sh`
- `scripts/deck/verify/run_all.sh`
- `tests/test_steam_appdetails.py`
- `tests/test_type_boundary_hardening.py`
- `tests/test_deck_fixture_selection.py`
- `dist/index.js` and `dist/index.js.map`
- `README.md`
- this session record

## Validation

- Baseline `scripts/decky verify-change dev --explain`: passed (38 frontend
  tests plus the complete Python suite).
- Backend focused suite: 25 tests passed.
- Quick-link policy + safe React-tree focused suites: 21 tests passed.
- Device-tooling focused suite: 5 tests passed; shell and JavaScript syntax
  checks passed.
- Final `scripts/orchestration/run-quality-gates`: passed. This included
  TypeScript typecheck, Rollup build, 50 Vitest tests, Python byte-compilation,
  the complete pytest suite, version-drift checks, and review-note preservation.
- Full package `0.1.0+f947379` was checksum-verified, copied to the Deck,
  installed through Decky Developer Mode, and reported `INSTALLED_STATE CURRENT`.
- Wobbly Life shortcut `2405230651` was reapplied to Steam app `1211020`; the
  live persisted record contained `steam_dlc_appids: [3106460]`,
  `has_points_shop: true`, and store state `available`.
- `QUICKLINK_FEATURE_APPID=2405230651 scripts/deck/verify/run_all.sh
  --no-launch --extended`: passed. Fixtures were listed `2312439508`, delisted
  `3497159354`, never-on-Steam `3462906031`, and feature `2405230651`. The suite
  passed Store / DLC / Community / Points order, Support removal, delisted Store
  removal, never-on-Steam row suppression, zero-write re-render checks,
  Community fallback, and both extended idle passes.
- The first extended run exposed the known viewport-sensitive Developer marker;
  targeted fiber evidence showed the full description and Ubisoft developer
  were still present. After the probe fix, one aggregate retry hit a transient
  Community-card render miss; its immediate focused retry passed with 18 cards,
  and the final exact aggregate command passed cleanly.
- Live rendered descriptors targeted
  `https://store.steampowered.com/dlc/1211020?...` and
  `https://store.steampowered.com/points/shop/app/1211020`. Both were activated
  through the committed focus-and-click probe, opened the expected `/steamweb`
  real-app URL, returned successfully to Game Info, and remained SteamUI
  `Focusable` links. A physical controller button was not available to this
  remote agent; the controller-specific input check remains a human confirmation
  rather than an automated claim.

## Deferred / out of scope

- Recommended and Community controller-layout population remains deferred to a
  separate Steam Input prototype plan.
- No release/version change or unrelated cleanup was performed.
