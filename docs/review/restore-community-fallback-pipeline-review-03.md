# Review — restore-community-fallback-pipeline (round 03)

Branch: `feat/restore-community-fallback-pipeline`
Reviewed against: `docs/plans/2026-07-11_restore-community-fallback-pipeline.md`
Reviewed commit: `94edb59` — full on-device end-to-end verification performed.

## Verdict

**CHANGES_REQUESTED.** On-device end-to-end testing (Wolverine `3156562597`,
Community tab actually rendered) reveals the feature does **not** populate the
Community section yet. The backend logic is correct, but two blockers remain and
one is architectural. Good news first: the backend fallback data path is proven
correct on real device data.

## Confirmed GOOD (on-device)

- Backend converter verified against the live store record: Wolverine has 17
  screenshots → `metadata_screenshots_to_fallback_items` returns **17 items on
  page 1** (all `assets2.ignimgs.com` URLs, 640x340 preserved) and **0 on page
  2**. Exactly the plan's expectation. The permissive-host converter works.
- The community feed patch **does** fire for non-Steam shortcuts when the
  Community tab renders (`[decky:community] feed selected appId='3156562597'`),
  and native-wins fallthrough is correct (it fell back to `source='native'` when
  the RPC failed).
- Round-02 discovery narrowing is correct: on-device the predicate selects only
  the fetcher hooks (`CD/a/cH/zg` on module `39054`, `EH/Kp` on `70239`) and
  excludes protobuf `Message`/news-event classes. Diagnostics now log properly.
- quick-links + re-render smokes pass; 0 cache-write churn.

## Blocker 1 (BLOCKING, feature non-functional) — backend never reaches the device via the dev loop

On-device the Community tab shows **"Community Content — No additional
content"**. Cause: `get_community_fallback_page` throws a "Python Exception"
because the backend is absent —
`/home/deck/homebrew/plugins/Decky-Metadata/backend/providers/` has no
`community.py` and the installed `main.py` has **0** occurrences of
`get_community_fallback_page`.

Root cause is the deploy path: `scripts/deck/deploy.sh` (invoked by
`scripts/decky verify-change --device`) **only** `scp`s `dist/index.js`. It never
pushes `main.py` or `backend/`. So `verify-change --device` reported green smokes
for a frontend calling an absent backend — a false pass. (I manually `scp`'d the
new `main.py` + `community.py` to the device to verify the converter; the running
plugin still needs a backend reload to serve the RPC live, which requires a full
package install / `plugin_loader` restart.)

Required:
- This change ships a backend. On-device verification and release must deploy the
  **full plugin** (package + install), not just the bundle. Note this in the plan's
  verification steps so the false-pass cannot recur.
- Optional but recommended: give `deploy.sh` a `--backend` mode that also pushes
  `main.py`/`backend/` for dev iteration (documented as requiring a plugin reload).

## Blocker 2 (BLOCKING, architectural) — the synthetic-detail shield cannot install

The round-02 hardening finds the right methods but **still binds zero**. Live
diagnosis: the fetcher exports (`CD/a/cH/zg` on module `39054`) are **getter-only,
non-configurable** accessor properties (`Object.getOwnPropertyDescriptor` →
`configurable:false`, no `value`). The patch primitive is `beforePatch`, which
installs by assignment (`module[name] = wrapped`); a patch/unpatch round-trip
throws:

```
Cannot set property CD of #<Object> which has only a getter
```

This is permanent, not a timing issue — the 20 init `pending` retries were this
same per-method throw caught in the install loop. It fails identically at
render-time. You cannot shield these fetchers by reassigning the module export.

Required — re-architect (do NOT reassign getter-only exports):
1. First establish **necessity** once Blocker 1 is deployed: with synthetic
   `90909…` cards actually rendered, does opening one issue a published-file
   detail/comment/reaction request? If not, delete the shield entirely (simplest
   correct fix). The orchestrator can confirm this on-device next round.
2. If needed, shield at a **patchable boundary**, mirroring the existing working
   vote shield (`communityVoteModule.dK` — patch that layer, not the getter-only
   fetcher). Candidates: the ServiceMethod/transport send layer (drop/short
   requests whose id starts with `90909`), the React-Query `queryFn`/QueryClient
   layer, or shaping the synthetic hub items so SteamUI never requests details for
   them. Verify the chosen boundary is a writable/configurable method before
   relying on `beforePatch`.
3. Keep the always-on `frontendLog` status line; add the descriptor check
   (writable/configurable) to the diagnostic so a non-patchable target is reported
   explicitly rather than as silent `pending`.
4. Add a frontend regression asserting the shield refuses/handles a getter-only
   target without throwing, and (if kept) that it binds a writable boundary.

## Re-verification (orchestrator, next round)

After the fix and a full-plugin deploy I will confirm on-device: (a) the Community
tab renders the 17 ignimgs images for Wolverine and page 2 is empty; (b) the
shield (if retained) reports `installed` with a patchable boundary; (c) opening a
synthetic card issues no failing published-file lookup. No launch without
explicit authorization.

STATUS: CHANGES_REQUESTED
