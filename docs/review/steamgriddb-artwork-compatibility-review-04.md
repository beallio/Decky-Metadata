# Review — steamgriddb-artwork-compatibility (round 04)

Branch: `feat/steamgriddb-artwork-compatibility`
Reviewed against: `docs/plans/2026-08-27_steamgriddb-artwork-compatibility.md`

## Verdict

The production fix, artwork proof, and authorized launch gate remain accepted.
The permanent verifier now has a tested 15-second cold-cache deadline, but its
required one-invocation live smoke could not run because the Steam Deck again
became unreachable before opening the tunnel. Integration remains blocked only
on that final verifier evidence and durable audit update.

## Gate status

- Reviewed commit: `5f2260956b6de13785fec660a9c78bb82b6c7936`.
- Delayed icon hydration beyond five seconds and never-resolving timeout cases
  have focused red/green coverage; the five-second mutation fails as required.
- Focused fixture tests and full local quality gates passed; no production
  bundle changed in this round.
- The prior Library Home artwork/file-hash proof and 64-bit launch/termination
  evidence remain valid for the unchanged production bundle.
- Reviewer retry: `scripts/deck/tunnel.sh up` on `steamdeck`/port `18085`
  failed with `No route to host` before any CDP or state mutation.

## Required changes

1. Make `steamdeck` reachable and leave the existing SteamGridDB fixture on
   Library Home.
2. Without redeploying or launching, open port `18085` and run one
   `smoke_artwork_identity.sh` invocation for shortcut `2155012430`, matched app
   `55150`, expected scope `library-home`, expected identity `true`, using the
   existing six-file baseline manifest. It must resolve within the new bound,
   preserve exact file hashes, and restore/close cleanly.
3. Update the session record with the single-invocation timing, evidence path,
   final focused/full tallies, and tunnel-down status. Commit the durable record
   and recreate the marker. No second launch or production deployment is
   required because this round changed only standalone verification tooling.

STATUS: CHANGES_REQUESTED
