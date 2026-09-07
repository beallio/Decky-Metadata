# Clear removed Activity news

Date: 2026-09-07

## Objective

Remove injected Activity news as soon as metadata is removed or saved without
news, while preserving Steam Activity and other shortcuts.

## Implementation

- Added a target-only Activity clear helper. It removes the plugin cache and
  only a store value marked as Decky Metadata's injected Activity.
- Called it when metadata is absent or has no news in metadata application,
  the patched Activity getter, and the Activity refresh path.
- Added regression coverage for removal, empty saves, full metadata-cache
  replacement, native-store fallback, another shortcut, native Steam Activity,
  and metadata restoration.

## Verification

- The unmodified base passed 27 frontend files and 430 tests. The new tests
  failed there with stale injected Activity objects in both focused files.
- Removing only the native-store deletion made the same two tests fail. The
  restored implementation passed 2 focused files and 32 tests.
- `scripts/orchestration/run-quality-gates` passed: Rollup build, 27 frontend
  files and 432 tests, Python syntax and 507 collected pytest checks, and
  review-note integrity.
- On `steamdeck`, deployment and `run_all.sh --no-launch` passed. The real
  editor flow removed metadata, saved an empty record, and closed. Its old
  Activity title was absent without reload and after reopening. Another matched
  shortcut remained unchanged. The exact fixture backup was restored and its
  original Activity title returned. Evidence is under
  `/tmp/Decky-Metadata/clear-removed-activity-news-device`.
- The launch check is intentionally unverified. No game was running before,
  during, or after verification.
