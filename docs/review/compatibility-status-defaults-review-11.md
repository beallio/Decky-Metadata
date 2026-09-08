# Review — compatibility-status-defaults (round 11)

Branch: `feat/compatibility-status-defaults`
Reviewed against: `docs/plans/2026-09-07_compatibility-status-defaults.md`

## Verdict

Discovery is now correct on the installed full build `0.3.14+d134ea4`
(HEAD `964fecdb9236707b3ff78df205155f3ac3680074`). The remaining failure
is the timing of capture/refresh relative to Steam's native publication.
A temporary, source-free diagnostic proved that deferring the complete
existing refresh to the next real main-window rendering frame fixes both
directions. Apply that bounded handoff to production.

## Gate status

- Installed version and bundle were verified against the local correction:
  `/tmp/Decky-Metadata/diagnostics/20260908T193347Z/doctor.json`.
- Chrome runtime inspection of the actual installed module confirmed:
  the corrected classifier is executing, its mounted set contains the
  real class `k` for native app ID 2312439508, the shared document bridge
  returns the Big Picture document, and the active route is accepted.
- A non-pausing debugger logpoint during a normal QAM save confirmed the
  real callback runs with `active=true`, one mounted instance, native
  shortcut eligibility true, and current-route eligibility true.
- Calling the existing refresh after native publication had settled
  restored rich Game Info. Then Main temporarily replaced only that
  revision listener with a coalesced main-window requestAnimationFrame
  dispatcher. Automatic -> Verified -> Automatic passed with the same
  Game Info tab, rich description/developer/publisher, quick links, and
  displayed category intact.
- Evidence under
  `/tmp/Decky-Metadata/compat-final-20260908-uj5zn3hd/`:
  `manual-settled-refresh-diagnostic.json`,
  `frame-handoff-diagnostic-verified.json`, and
  `frame-handoff-diagnostic-restored.json`.
- The diagnostic wrapper was removed and the original listener restored
  after exactly two dispatches. Debugger breakpoints and temporary trace
  state were removed. Global Automatic is restored. This experiment is
  proof of the handoff, not acceptance of the unchanged production bundle.

## Required changes

### R1 — Queue the whole native refresh after publication settles

Replace the immediate revision-listener invocation with one coalesced
native-frame handoff. The successful diagnostic did:

```text
mainDocument.defaultView.requestAnimationFrame(() => originalRefresh())
```

The frame callback must execute the COMPLETE current refresh sequence:
capture the current mounted renderer, validate its exact native app/route,
arm the existing render protection, and force the native update. Do not
capture an instance or arm its shield before queuing; those can be stale by
the time Steam commits the new overview/view.

Requirements:

- Resolve the real main-window document/window through the shared SteamUI
  bridge. Do not schedule on a guessed SharedJSContext or QAM window.
- Coalesce revisions while one frame is pending; read the latest state
  when that frame executes.
- Cancel the pending frame and clear its owner on plugin teardown. Keep
  the existing active/lifecycle guards and native instance cleanup.
- Retain normal in-call launch truth and current-route checks.
- No longer TTL, fixed sleep, polling loop, new rendering system, or
  change to native filter publication is needed.

Add one meaningful regression modeling native publication completing its
DOM/instance update after the revision is sent. The queued callback must
refresh the new visible instance/category, not a stale pre-commit one.
Assert the consumer's rendered result, not a frame/callback call count.

Run the local gate, prepare the full ZIP, record its version and evidence,
commit, mark the code round complete, and exit. Main owns device validation;
do not deploy or operate the Deck concurrently. Do not rewrite history or
merge. Main will fold this focused correction into the organized feature
commit after validation.

The user also requested a matched-games-only toggle be added to the todo
list. It is queued separately; do not expand this correction into that
feature or change the currently approved category policy.

STATUS: CHANGES_REQUESTED
