# Live Community Media and Metadata Gap-Fill

## Objective

Make Community-tab media live and non-persistent, preserve Steam metadata while
using IGN only to fill gaps, retain native YouTube video-card output, remove the
Steam/context-menu import cycle, and prevent Deck verification from selecting
non-game launchers as never-on-Steam fixtures.

## Files modified

- `main.py`
- `src/types.ts`
- `src/contextMenuPatch.tsx`
- `dist/index.js.map`
- `scripts/deck/verify/select_fixtures.py`
- `tests/test_community_fallback.py`
- `tests/test_deck_fixture_selection.py`
- `tests/fixtures/agent_workflow/metadata.json`
- `docs/specs/community-fallback.md`
- `README.md`
- this session log

## Design decisions

- A positive `steam_appid` gets a live Steam Community scrape first. Non-empty
  Steam cards return immediately, so IGN and YouTube are not requested or mixed
  into that page.
- Empty/unavailable Steam content falls through to one off-thread live-media
  operation. It fetches IGN by saved source URL, or uses title-based lookup when
  no source URL exists, and fetches YouTube independently so either source can
  fail without losing the other.
- Community videos were removed from the persisted backend and frontend metadata
  shapes. Legacy `community_videos` input is dropped by sanitization, and normal
  metadata fetch no longer performs YouTube enrichment.
- Scan-time IGN merging fills absent, falsey, or `source: Manual` placeholders
  only. Substantive Steam values and Steam screenshots remain authoritative.
- The context menu imports shared Steam helpers directly from the existing leaf
  `src/steam/core.ts`, removing the rollup cycle without changing behavior.
- A no-Steam-ID fixture must also have stored game metadata evidence (non-manual
  source, developer, or description), excluding bare launcher records while
  preserving meaningful never-on-Steam game coverage.
- Existing frontend video cards retain `type: 2` plus `youtube_video_id`; image
  cards retain `type: 5` without that field. Playback remains a deferred
  on-device acceptance check as required by the plan.

## Validation

- Required preflight: `scripts/decky doctor` completed with known local-state
  warnings; `scripts/decky verify-change dev --explain` passed.
- Baseline orchestration quality gate passed before implementation (30 Vitest
  tests and the full Python suite), reproducing the planned rollup cycle warning.
- TDD red runs captured the stored-media RPC behavior, IGN-overrides merge, and
  launcher fixture misclassification before their implementations.
- `tests/test_community_fallback.py`: 26 passed after live media and gap-fill
  changes.
- Community-feed frontend suite: 10 passed, covering video and unchanged image
  card shapes.
- Fixture-selection and diagnostic-capture suites: 7 passed.
- TypeScript type-check passed; Rollup built without the prior circular
  dependency warning.
- Final orchestration quality gate passed: TypeScript, Rollup, 30 Vitest tests,
  Python compilation, the full pytest suite, version drift, and diff checks were
  green. Review-note deletion checks passed, and the captured Rollup output had
  no circular-dependency warning.

No on-device deployment or game launch was performed. The plan requires full
plugin installation and its four live acceptance checks before promotion to
`main`.
