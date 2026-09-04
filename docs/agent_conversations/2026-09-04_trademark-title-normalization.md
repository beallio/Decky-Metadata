# Trademark title normalization

## Date

2026-09-04

## Objective

Keep Steam page-title matching reliable when a rendered official game name contains trademark, registered, or copyright marks but the stored metadata title does not.

## Finding

`cleanTitle` removed `™`, `®`, and `©`, while `normalizedTabText` retained them. The visible-title fallback therefore could not match a rendered official name such as `STAR WARS™: The Force Unleashed™ II` to its cleaned metadata title.

The controller configurator normally resolves an app ID from `/app/<id>/controllerconfigurator/...`; title matching is a later fallback for routes that do not expose a parseable app ID or when Steam's router context is unavailable.

## Implementation

- Added a shared trademark-mark expression used by both title-normalization paths.
- Added focused frontend tests covering `™`, `®`, and `©` in the same substring comparison used by visible-title resolution.
- Regenerated the committed frontend bundle and source map.
- Added an Unreleased changelog entry.

## Validation

- Red test: the two new `normalizedTabText` cases failed before the source fix.
- Focused test after the fix: `src/steam/core.test.ts` passed, 35 tests.
- Project quality gate passed: TypeScript check, Rollup build, 26 Vitest files / 392 tests, Python byte-compile, and 477 pytest tests.
- Final `MATCHED_APPID=2312439508 scripts/decky verify-change HEAD^ --explain
  --device --allow-launch` classified the change as `device`, repeated the full
  quality gate, deployed the bundle, passed all routed device checks, launched
  the matched shortcut with a 64-bit game ID, terminated it, and reported
  `STATUS PASS`.

## On-device status

The behavior was reproduced before implementation on both `steamdeck` and
`steamdeck-legos`, including a reversible live rename probe on the Legion Go S.
Both shortcut names and sort keys were restored and the original CDP tunnels
were closed.

The corrected bundle was deployed to `steamdeck`. The first manual deployment
missed its 180-second readiness deadline while Steam reported no network and DNS
failures, but logs showed the plugin loaded successfully with 93 unpatchers. A
subsequent readiness check returned `READY`, and the manual no-launch suite
passed.

The required no-launch device path first deployed the bundle again, reached
`READY`, and passed quick links, rerender stability, Community content, and
controller-layout identity isolation. After explicit launch authorization, the
final device path repeated the safe checks, launched shortcut `2312439508`,
confirmed a 64-bit game ID, terminated the game, and passed.

`steamdeck-legos` remained offline during the bounded post-change wait, so the
corrected bundle was not deployed there.
