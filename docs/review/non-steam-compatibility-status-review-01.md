# Review — non-steam-compatibility-status (round 01)

Branch: `feat/non-steam-compatibility-status`
Reviewed against: `docs/plans/2026-08-28_non-steam-compatibility-status.md`

## Verdict

The persistence and packed-bit implementation is close, and the local quality
gate is green. The branch is not ready to integrate because the native-app
eligibility guard can be bypassed by the plugin's matched-App-ID alias, the
context-menu save can overwrite an existing metadata record before bootstrap
finishes, and the required live SteamUI refresh behavior has not been proved.

## Gate status

- `./run.sh scripts/orchestration/run-quality-gates` passed during review:
  23 frontend test files, 312 frontend tests, and the complete backend pytest
  suite passed; the build and type check passed.
- `scripts/orchestration/check-review-notes-not-deleted` passed.
- `git diff --check dev...HEAD` passed and the working tree was clean before
  this review note.
- `./run.sh scripts/decky doctor --deck` reported the Deck offline. The
  plan-required on-device context-menu, focus, poster, Game Info, reset, and
  rich-details checks are incomplete. The session log correctly records that
  gap.

## Required changes

1. **Use exact native app identity for every eligibility and mutation guard.**
   `getOverview()` calls the plugin-patched `GetAppOverviewByAppID`. That method
   intentionally aliases a matched Steam App ID to the non-Steam shortcut. Live
   probing already showed a lookup for matched Steam App ID `55150` returning
   shortcut `2155012430`. As written, `insertOurEntry()` and
   `saveCompatibilityOverride()` can therefore treat an official game's menu
   App ID as a shortcut, create metadata under the official ID, and mutate the
   aliased shortcut. Add a targeted exact/native lookup that resolves the
   `appStore.allApps` entry whose own `appid` equals the menu/save App ID, and
   use that exact object for context-menu eligibility, save eligibility,
   `applyMetadata()`, and baseline restoration. Do not remove the intentional
   matched-App-ID alias used by rich details. Add regression tests with both an
   exact official overview and a patched getter that returns a shortcut for the
   official ID; assert that the official menu gets no entries, direct save is
   rejected, no official-key metadata is written, and neither overview is
   mutated.

2. **Wait for authoritative metadata before displaying or saving a choice.**
   `openCompatibilityStatusModal()` and `saveCompatibilityOverride()` read
   `metadataCache` without awaiting bootstrap. If the menu is used while
   `refreshMetadataCache()` is in flight, the modal displays a false Automatic
   state and saving builds a blank `metadataTemplate`, which can overwrite an
   existing title, match, description, artwork metadata, and fetched Valve
   category. Await `ensureMetadataCache()` before deriving modal state and again
   in the save boundary so direct callers are safe. Preserve the existing record
   when saving only `deck_compat_override`. Add a test that holds cache loading
   in flight with an existing rich record and proves the modal/save uses that
   record without losing fields.

3. **Make the refresh mechanism real and cover its contract.**
   `refreshCompatibilitySurfaces()` dispatches
   `decky-metadata:compatibility-updated`, but the repository has no listener;
   this is currently a dead signal. Remove it or add the narrow consumer that
   performs the required render. Add focused unit coverage for the history or
   revision path, including path/query/hash preservation and missing-router
   behavior. Do not use `appStore.m_mapApps` replacement: the pre-plan Deck
   probe proved that it drops the matched shortcut's enriched Game Info.

4. **Complete the plan-required Steam Deck verification before marking the next
   round complete.** Deploy through the committed dispatcher without
   `--allow-launch`, drive the actual non-Steam context menu and selector with
   the CDP focus tools, and prove Automatic plus all four explicit categories
   on the poster and Game Info. In particular, change status while Game Info is
   mounted and confirm an immediate visible update without losing enriched
   details. Confirm repeated/alternating menus do not duplicate entries or leak
   App IDs, official games have no selector, Automatic/removal/dismount restore
   correctly, and applicable no-launch smokes pass. Save screenshots and focused
   JSON below `/tmp/Decky-Metadata` and record exact evidence paths and commands
   in the session log. If the Deck remains offline, leave the round incomplete
   and report that external blocker; static green gates do not satisfy this
   plan.

5. Update the stale file header in `src/contextMenuPatch.tsx`, which still says
   the patch adds a single entry, and rerun the full quality gate after all
   changes.

STATUS: CHANGES_REQUESTED
