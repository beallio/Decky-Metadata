# Review — compatibility-default-scopes (round 02)

Tested full installed ZIP: `0.3.14+0d10462` (implementation `a79eca4`).
The plan now names the existing reload integration boundaries; its user-visible scope is unchanged.

## Passed live checks

Main installed the corrected candidate and verified all four scopes against every captured native shortcut and ordinary Steam overview. Native Verified shortcut counts were 8, 8, 12, and 16 for steam/no-steam/metadata/all, with corresponding live Great on Deck counts 38, 38, 42, and 46. Source provider did not drive eligibility; excluded Steam games retained Valve fallback. Long scope text wraps and is fully readable.

The equal-category preview correction passed on the real editor: global Playable plus no-steam scope described a Steam-matched Playable record as outside scope/from Valve; changing only scope to steam changed its explanation to inheritance. Both native dropdowns preserved the expected next controller navigation target after select/cancel once the existing native return transition settled.

The active matched Game Info view held Verified when changed to no-steam, survived context-menu cancel and in-place plugin import, and applied Valve Playable after leaving and returning. These early passing checks do not cover the later failure below.

## Required correction — saved Steam ID removal leaves stale editor/runtime state

Evidence: `/tmp/Decky-Metadata/four-scopes-live-qe4_x60v/post-reload-failure.json` and the named snapshots in that directory.

Observed sequence on the candidate:

1. Global Verified. Change a matched game's scope to no-steam while Game Info is active. Reload this plugin in place with `DeckyPluginLoader.importPlugin("Decky Metadata")`, wait for import completion and loaded QAM controls, then exit Game Info. The held-view check passes.
2. Use existing no-record shortcut `3245664592` (Heroic Games Launcher). Its captured native packed value is 0. Open its editor and save a disposable manual record. Under no-steam scope it correctly becomes Verified (15).
3. Enter Steam App ID 15100 and click Apply Steam App ID. Enrichment returns a Steam record with category 2. Under no-steam scope it correctly falls back to Playable (10).
4. Change scope to steam via QAM while the editor remains open. It correctly becomes Verified (15).
5. Clear the actual Steam ID input with native keyboard Ctrl+A/Backspace, verify the DOM input is empty, and click Apply Steam App ID. Wait for the editor's busy Search control to return to enabled Search. The persisted record is now `steam_appid: null`, `deck_compat_category: null`, `deck_compat_override: null`, source Steam.
6. Despite the saved clear, the editor still says `Use global default (Verified)` under steam scope, and the native object remains 15. Opening QAM refreshes metadata and changes the native value to 10, not the captured native 0. Cycling scope no-steam -> steam still leaves the editor claiming inheritance and native value 10.

The correct post-clear behavior is outside-scope/native status in the editor and the captured native 0. Source remaining Steam is not membership: the Steam ID is absent. The disk record is correct; runtime/preview state is not.

Investigate the editor acknowledgement/cache reconciliation and the in-place reload lifetime together. A retired editor/router callback retaining an old scope/cache is a hypothesis, not an established cause. Confirm the supported Decky import invocation as part of the investigation; do not mistake a verification-procedure problem for a source defect. Establish a focused reproduction of the failing state transition before changing source. Keep the original baseline across intermediate Valve/default categories; do not recapture a plugin-written Playable value as native.

Required coverage: within one editor entry, create a no-ID record, add a Steam ID, change scope, clear the ID, and resolve against the confirmed cleared record. Include an in-place reload before the entry and a scope-only revision afterward. The editor preview and native publication must agree with the persisted record, while unrelated records and user-edited fields are preserved. Retain existing held-view and per-game override behavior. Do not fix this by forcing a whole SteamUI restart, suppressing the mismatch, or special-casing the fixture.

## Test controls and restored state

An empty browser `fill` did not reliably clear the native input on an earlier attempt; that attempt is not evidence. The failing sequence above used Ctrl+A/Backspace, checked the empty input, and confirmed the saved null ID/category before evaluating the failure.

Main removed the disposable record and restored the original logical settings (Automatic, all scope) and original record set through the UI. A subsequent full UI reload was attempted only for recovery, not counted as a passing in-place check. It timed out, and the Deck then became unreachable; final native-state restoration after that restart remains to be checked when it returns. Power settings were not changed.

No device calls in this correction round: Main owns the authorized device checks. Run focused red/green regressions and the full local gates, record actual evidence, commit the correction, package the committed code, mark finished, and exit. No approval note, merge, history rewrite, push, or release.

STATUS: CHANGES_REQUESTED
