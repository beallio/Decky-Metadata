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

## Review follow-up

- Tightened the focused Activity regression so absent and empty metadata call
  the refresh path before the patched getter runs. It now observes the original
  native getter, which catches a stale injected store value directly.
- Added the same-target ownership control: an unmarked native Activity object
  remains visible while removal clears only the plugin-owned object. Positive
  checks now assert the original, other-shortcut, and restored news titles.
- The review's `refresh` mutation failed as intended: 1 failing and 31 passing
  focused tests, at the original getter's stale injected object. Its `ownership`
  mutation also failed as intended: 1 failing and 31 passing focused tests, at
  the same-target native object. Without either mutation, both focused files
  passed all 32 tests.
