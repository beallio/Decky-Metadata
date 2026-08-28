# Review — steamgriddb-artwork-compatibility (round 02)

Branch: `feat/steamgriddb-artwork-compatibility`
Reviewed against: `docs/plans/2026-08-27_steamgriddb-artwork-compatibility.md`

## Verdict

The artwork and authorized launch gates now pass, and the artwork-file oracle
and equal-ID verifier defects are resolved. One production route ambiguity
remains: the strict classifier does not recognize Steam's actual
`/routes/app/<appid>/controllerconfigurator/...` path as an unrelated surface,
so a stale joined detail token can still apply the false identity in Controller
Settings.

## Gate status

- Reviewed commit: `ae5b3140393597d79d9527ff5aa6c2814ed32ed9`.
- Library Home smoke passed with native shortcut identity, resolved icon, and
  six unchanged custom-art file hashes. SteamGridDB presentation was visually
  checked without reapplying artwork.
- Authorized launch smoke passed with 64-bit gameid
  `9255707909357043712`, committed termination, and zero running games after
  five seconds. Targeted rerender also passed.
- Current route/precedence tests and local gates are green; unrelated stale
  delisted-fixture failures were recorded rather than called passes.

## Required changes

1. Extend the strict route classifier to recognize the actual Steam controller
   chooser/settings forms:
   `/app/<appid>/controllerconfigurator/...` and
   `/routes/app/<appid>/controllerconfigurator/...` (plus any source-verified
   equivalent already handled by the current build) as authoritative
   non-detail routes.
2. Add tests for each controller path alone and for both token orders when
   joined with a stale `/library/app/<same-appid>` detail token. Every case must
   return false/native shortcut identity. Add a metadata-patch integration case
   with an armed shield and positive counter proving neither budget is consumed
   in the ambiguous controller transition.
3. Keep consistent duplicate current-detail tokens passing, and preserve all
   Library Home, other-app, in-call truth, matched detail, and prefix-collision
   assertions.
4. Rerun focused route/spoof/metadata tests and the route mutations. Because the
   production classifier changes, redeploy and rerun the Library Home artwork
   smoke, targeted Game Info/quick-links/rerender checks, and the already
   authorized launch smoke. Record final evidence/tallies, close the tunnel,
   run full gates, and recreate the marker only after the corrected commit
   passes.

STATUS: CHANGES_REQUESTED
