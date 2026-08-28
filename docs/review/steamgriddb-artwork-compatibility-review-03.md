# Review — steamgriddb-artwork-compatibility (round 03)

Branch: `feat/steamgriddb-artwork-compatibility`
Reviewed against: `docs/plans/2026-08-27_steamgriddb-artwork-compatibility.md`

## Verdict

The production route-scope correction, Library Home artwork proof, and
authorized launch gate all pass. One permanent-verifier reliability defect
remains: its five-second icon hydration bound already failed on the tested cold
cache and required a second invocation, so a correct release can be reported as
broken under the exact supported conditions.

## Gate status

- Reviewed commit: `91318c4b1ef3709c487d7ff6821af6d1d5d0e8e5`.
- Conflicting detail/Home/controller routes fail native with shield/counter
  preservation and focused mutation coverage.
- Library Home reports native shortcut identity, resolved icon, and six
  unchanged artwork-file hashes; Game Info/rerender/quick-links checks passed.
- Authorized launch used the 64-bit shortcut gameid, terminated through
  committed tooling, and left zero running games.
- Current full local/device gates are otherwise green apart from the explicitly
  recorded unrelated stale delisted fixtures.

## Required changes

1. Increase the bounded icon-resolution wait to cover the observed cold-cache
   latency in one invocation (for example a named 10–15 second deadline with
   fixed polling cadence), without unbounded retry or raw URL output. The tested
   first run remained unresolved after 20 attempts / 5.03 seconds, while the
   unchanged next bounded poll resolved immediately; five seconds is therefore
   disproven as a sufficient permanent bound.
2. Add executable probe tests where icon hydration occurs after more than five
   seconds but before the new deadline and must pass, plus a never-resolving
   case that must fail at the exact bound. Mutating the deadline back to five
   seconds must fail the delayed fixture.
3. Rerun the artwork smoke on the existing Library Home fixture in a single
   invocation, verify restoration and unchanged file hashes, then rerun focused
   safety tests and full quality/review-note gates. No production bundle
   redeployment or second launch is required if only the standalone verifier
   changes. Update the session record with final timings/tallies and recreate
   the marker.

STATUS: CHANGES_REQUESTED
