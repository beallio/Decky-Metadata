# Review — compatibility-status-defaults (round 13)

Branch: `feat/compatibility-status-defaults`
Reviewed against: `docs/plans/2026-09-07_compatibility-status-defaults.md`

## Verdict

This is a user-approved behavior change, not a request to keep refining
immediate active-Game-Info updates. The user selected **Defer the active
game**: save immediately, update other games immediately, and hold the
current Game Info game's compatibility update until that view is exited.
The updated plan is committed as `ecc757e`; read its Context, Task 2a, and
S33-S40 before editing.

## Gate status

- The preceding cleanup is in `bd383f3`, with handoff `feaa800`.
  It recorded passing local gates, two retained-reload cycles, complete
  device smokes, and restoration to Automatic.
- Its current behavior still changes the active game's packed value and
  force-refreshes Game Info immediately, while only delaying map replacement.
  It also waits for departure from the entire app, not merely the Game Info
  tab. That is not the newly approved policy.
- Preserve the successful reload cleanup, constructor-safe native
  publication, native setter handling, launch truth, and per-game precedence.

## Required changes

### Implement the approved active-view deferral

1. Apply the updated plan completely. Hold the active Game Info game's
   applied compatibility state; do not merely defer a later map notification
   after already changing its status. Other eligible games update normally.
2. Opening/closing QAM or cancelling an overlaid context menu is NOT exit.
   Changing to another tab/page/game, or choosing Decky metadata... and
   entering the editor, IS exit.
3. Use authoritative main-window navigation/tab state. When responding to a
   history callback, use its new location rather than waiting for stale
   joined browser-location tokens to agree.
4. Keep pending work in memory and recompute from the latest metadata,
   override, and global policy at release. Do not replay a stale captured
   category over a later editor Save, match change, or deletion.
5. Preserve the held compatibility nibble across native overview replacement
   while pending. Resolve the current exact native overview on release;
   never recreate a removed shortcut or write through an official alias.
6. Preserve/reconstruct pending work through the in-place reload handoff.
   Actual teardown must cancel pending callbacks, clear the queue, and
   restore native baselines without applying the pending desired status.
7. Remove active Game Info discovery/force-refresh/timing machinery that is
   obsolete under this policy. Do not retain competing immediate and
   deferred paths. Keep unrelated metadata rendering and quick-link policy.

### Documentation and regression coverage

- Update README, `docs/specs/compatibility-status.md`, the on-device runbook,
  changelog, and session record as required by the plan.
- The durable specification must retain S01-S32 and include all S33-S40.
  Explain that values are saved immediately, the active view can remain
  temporarily old, and editor navigation is different from opening a menu.
- Test held status plus immediate other-game updates, same-game tab exit,
  editor exit and latest-choice precedence, repeated changes before exit,
  incoming replacement/deletion, and teardown/reload behavior.
- Assert observable status/publication/consumer transitions rather than
  private queue lengths, callback counts, or source text.

### Exclusive validation and handoff

The implementer owns the Deck for this round after Main releases its
connection. Current Full validation authorization includes the needed
temporary compatibility changes, installation/reload, and safe game smoke.
Use `CDP_PORT=18088` and the committed device tools. Do not change power
settings, other plugins, or the user's full metadata cache.

Validate the exact user flow on matched shortcut 2312439508:

- Start on Game Info with Automatic/Playable.
- Select global Verified in QAM and close QAM. Game Info must remain
  Playable with rich content and links; other eligible games update.
- Leave for Activity, then return to Game Info. It must now show Verified.
- Repeat with a change back to Automatic, and test opening the metadata
  editor as the exit path.
- Confirm repeated choices collapse to the latest policy, and test an
  in-place reload while work is pending without freezing or losing links.
- Verify native collection effects when the deferred update is released,
  ordinary Steam exclusion, no-record behavior, and the applicable full
  and no-launch smokes with explicit safe fixture 2312439508.

Recover a frozen SteamUI only with the documented `steam -shutdown` path.
Do not use debugger instrumentation in the acceptance run. Restore global
Automatic and original per-game values, close the dedicated tunnel, run
local gates, prepare the complete ZIP, record actual results, commit, mark
the round complete, and exit for review.

Do not merge, push, release, or rewrite history. Main will fold validated
fixes into the organized implementation commit. The matched-games-only
toggle remains a separately queued feature and is not part of this change.

STATUS: CHANGES_REQUESTED
