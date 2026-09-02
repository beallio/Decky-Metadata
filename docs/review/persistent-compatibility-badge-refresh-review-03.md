# Review — persistent-compatibility-badge-refresh (round 03)

Branch: `feat/persistent-compatibility-badge-refresh`
Reviewed against: `docs/plans/2026-08-31_persistent-compatibility-badge-refresh.md`

## Verdict

The code change is acceptable, but the implementation record and required live
gate are not complete. Review found that the missing grid check is repeatable
with the existing committed tools. No new production change is required.

The current session record cites
`home-after-hard-reload.png` as Home badge evidence. That file shows a blank
Library Collections tab and no game card, so it does not support the claim.
Independent review then opened `/library/home` without visiting a detail route
and captured a valid Home card at
`/tmp/Decky-Metadata/persistent-compatibility-badge-refresh/reviewer-home.png`.
Space Marine had one yellow Playable indicator more than ten minutes after the
feature deploy.

The non-Steam grid was also available. The route initially left Collections
active. Selecting the exact `Non-Steam18` tab with the committed click/input
tools loaded all 18 cards. After three Down inputs, Space Marine showed the same
yellow Playable indicator at
`reviewer-nonsteam-grid-space-marine.png`. The adjacent Transformers Fall of
Cybertron unresolved-Automatic card had no indicator. On Home, official Brotato
and Teenage Mutant Ninja Turtles cards retained their native indicators and had
no `decky-metadata-compatibility-*` React key.

## Gate status

- Production bridge and focused regressions: PASS.
- Local quality gate: PASS (26 Vitest files, 371 tests, and pytest passed).
- Home badge after hard reload and more than two minutes: PASS in independent
  review; the session record points to the wrong PNG.
- Non-Steam grid badge and unresolved-Automatic negative: PASS in independent
  review; not recorded by the implementer.
- Official-game isolation: PASS in independent bounded fiber evidence; not
  recorded by the implementer.
- `run_all.sh --no-launch`: behavior subchecks passed, but aggregate command
  failed on local `/tmp` quota.
- Final capture and tunnel-down check: NOT COMPLETE.

## Required changes

1. Repeat or adopt the independent Home and non-Steam grid evidence above.
   Record exact commands and machine-readable card ownership/category results,
   and cite the valid PNGs. Correct the false `home-after-hard-reload.png`
   description. Do not claim that the grid was unavailable.
2. Record the unresolved-Automatic and official-game controls. Use the bounded
   rendered-card fiber check only; do not enumerate Steam stores in a React
   walk. Confirm Space Marine remains packed `10`, category `2`, and a native
   shortcut.
3. Free enough quota by removing only regenerable task-local caches and copied
   log/diagnostic outputs under `/tmp/Decky-Metadata`; never remove Deck source
   logs or persistent metadata. Re-run `scripts/deck/verify/run_all.sh
   --no-launch` until the aggregate command exits successfully.
4. Run `./run.sh scripts/decky capture`, close the dedicated tunnel, and verify
   `scripts/deck/tunnel.sh status` reports `tunnel: down`. Update the session
   record with all results, rerun the quality gate if documentation changes,
   commit, and mark the round complete.

STATUS: CHANGES_REQUESTED
