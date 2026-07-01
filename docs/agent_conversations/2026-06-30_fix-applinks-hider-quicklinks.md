# 2026-06-30 - Fix App Links Hider Quicklinks

## Task Objective

Implement `docs/plans/2026-06-30_fix-applinks-hider-quicklinks.md` so the unmatched non-Steam
app-links hider targets the AppDetails quick-links row instead of the unrelated Remote Play link
row.

## Files Modified

- `src/steam.ts`
- `dist/index.js`
- `dist/index.js.map`
- `docs/agent_conversations/2026-06-30_fix-applinks-hider-quicklinks.md`

## Design Decisions

- Retargeted the CSS module discovery from the Remote Play `LinkRow` module to the AppDetails
  module by requiring `GameInfoQuickLinks` and `GameInfoContainer`.
- Kept the route detection, app-id detection, hider body-class toggle, diagnostics, interval, and
  teardown behavior unchanged.
- Removed the unsafe `[class*="LinkRow"]` fallback. If the AppDetails class cannot be resolved,
  the style now emits no hiding rule so it cannot hide the wrong Remote Play row.
- The target move is based on live CEF DOM inspection. The current Steam build's resolved
  `GameInfoQuickLinks` hash was `_2GqvVM-UeNGM7ptNftUVn_`; this is reference-only and not
  hardcoded.

## Validation Results

- Baseline before edits: `scripts/orchestration/run-quality-gates` passed.
- TDD regression check: `/tmp/Playhub-Metadata-local/applinks_quicklinks_contract_test.py`
  failed before the code change and passed after the code change.
- Targeted frontend checks after edit:
  - `./run.sh npx tsc --noEmit` passed.
  - `./run.sh npm run build` passed and regenerated `dist/index.js`.

## Deferred Verification

Hardware verification remains deferred to the human/orchestrator: sideload the plugin, open an
unmatched non-Steam game, confirm the Store/Community/Discussions/Guides/Market quick-links row is
hidden, and confirm the `[playhub:applinks]` diagnostic reports the resolved
`GameInfoQuickLinks` class as present in the DOM.
