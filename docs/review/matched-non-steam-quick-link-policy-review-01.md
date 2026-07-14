# Review — matched-non-steam-quick-link-policy (round 01)

Branch: `feat/matched-non-steam-quick-link-policy`
Reviewed against: `docs/plans/2026-07-13_matched-non-steam-quick-link-policy.md`

## Verdict

The planned Store, Support, DLC, and Points Shop policy works on the installed
build, but the round is not acceptable yet: Community Market remains visible
for listed matched non-Steam shortcuts. The user reported the mismatch and it
was reproduced live on shortcut `2312439508`.

## Gate status

- `scripts/orchestration/run-quality-gates`: PASS (6 Vitest files / 50 tests,
  complete Python suite, typecheck, build, version and review-note checks).
- Installed Wobbly Life shortcut `2405230651`: PASS for Store Page -> DLC ->
  Community Hub -> Points Shop, with Support and Market absent.
- Installed delisted shortcut `3497159354`: PASS for Store Page, Support, and
  Market absence.
- Installed listed shortcut `2312439508`: FAIL because Market is visible.
- Live descriptor evidence for the failing row:
  `{"label":"Market","link":"CommunityMarketApp","appid":2312439508}`.

## Required changes

1. Remove the `CommunityMarketApp` quick-link descriptor for every matched
   non-Steam shortcut, regardless of listed/delisted state. Classify it by the
   stable `link` identifier, never by the localized `Market` label.
2. Stop `src/steam/metadataPatch.ts` from re-enabling
   `bCommunityMarketPresence` for listed matched shortcuts merely because they
   have screenshots. Keep native Steam application behavior unchanged. The
   result must fail safely without manufacturing a synthetic-shortcut Market
   link if SteamUI changes shape.
3. Add pure-policy regression coverage proving Market is removed while
   Community Hub, Discussions, Guides, Store, DLC, and Points Shop retain their
   required order. Include stale/unexpected native Market descriptors.
4. Strengthen the committed Deck smoke so listed, delisted, and feature matched
   fixtures all assert Market is absent; preserve never-on-Steam suppression and
   existing backward-compatible arguments.
5. Regenerate `dist/index.js` and its source map, update the session log with
   this live finding and correction, run the full quality gate, deploy the
   corrected frontend to the installed plugin, and re-run the focused quick-link
   smoke plus the exact extended suite required by the plan. Record the fixture
   IDs and results before recreating the round-complete marker.

STATUS: CHANGES_REQUESTED
