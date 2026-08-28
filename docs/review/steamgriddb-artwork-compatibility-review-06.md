# Review — steamgriddb-artwork-compatibility (round 06)

Branch: `feat/steamgriddb-artwork-compatibility`
Reviewed against: `docs/plans/2026-08-27_steamgriddb-artwork-compatibility.md`

## Verdict

The production fix passes the exact Desktop Library sidebar symptom, and the
direct icon API is correctly diagnostic. The permanent smoke still cannot pass
on that exact surface because it derives route scope only from SharedJSContext;
in Desktop Mode SharedJS reports `/index.html` while the separate `Steam` page
owns Library Home.

## Gate status

- Reviewed commit: `5dc9cafe168ea8a51bb0fc35c48f65e3a990cee6`.
- User confirmed the formerly blank Warhammer icon is visible in Steam Deck
  Desktop Mode Library Home with Decky Metadata enabled.
- Reviewer CDP evidence on target `Steam` found the exact current Home link
  `a[href='/library/home'][aria-current='page']`.
- The affected sidebar row is present with a complete `data:image` image
  (`naturalWidth=600`, `naturalHeight=900`). No raw image/title/path value was
  retained in evidence.
- SharedJSContext simultaneously reports `/index.html`; the existing smoke's
  `routeScope=other` failure is therefore a target-boundary false negative, not
  a production regression.

## Required changes

1. Add a bounded Desktop Library phase to
   `check_artwork_identity.js` (target `Steam`) or a separate equally
   safety-tested probe. Require the exact current Home anchor and locate the
   affected sidebar row using a caller-supplied hash of its label rather than
   emitting/storing the title. Return only booleans, dimensions/counts, and
   short hashes: Home selected, row found, image found/complete, positive
   natural dimensions, data/custom image classification.
2. Update `smoke_artwork_identity.sh` so expected `library-home` is established
   by this authoritative Desktop target when SharedJS lacks a route. Keep the
   SharedJS identity/alias/art-file checks; do not accept an unverified route
   override. Fail on wrong/noncurrent Home, missing row, blank/zero-dimension
   image, malformed label hash, or raw title/URL/path output.
3. Add executable fixtures for Desktop Home+rendered icon passing and Home not
   selected, row missing, blank image, wrong label hash, and raw output failing.
   Preserve the unresolved-without-error direct API fixture and all file-hash
   requirements.
4. Rerun the standalone smoke once on the currently open Desktop Library Home,
   focused verifier/mutation tests, syntax checks, and full quality/review-note
   gates. Update the session with the authoritative Desktop payload, user visual
   confirmation, evidence path, and tunnel-down status. No production
   redeployment or additional launch is required.

STATUS: CHANGES_REQUESTED
