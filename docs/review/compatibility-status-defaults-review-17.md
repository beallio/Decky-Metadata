# Review — compatibility-status-defaults (round 17)

Branch: `feat/compatibility-status-defaults`
Reviewed candidate: `3ff40a6`, installed full ZIP `0.3.14+3ff40a6` (live verified)

## Verdict

Round 16's stale-route recovery did not fix the reported failure. Game Info can still render Steam's non-Steam placeholder after a completed editor Save and Done. Keep the approved deferral policy and keep the round 16 change only if it remains correct; the remaining cause is elsewhere.

## Live evidence on the corrected candidate

Fixture: native shortcut `2312439508` (matched Steam ID `15100`).

1. From Library Home, open Game Info: rich matched content, Playable. PASS.
2. QAM global Verified, close QAM: active view stays Playable and rich. PASS.
3. Open native Manage -> `Decky metadata...`: exit applies Verified; native packed becomes 15. PASS.
4. In the editor select per-game Unsupported, Save, then Done: native packed becomes 5 (correct), but Game Info renders the placeholder. The description, developer, publisher, and compatibility panel are missing. FAIL.

At observation time `m_history.location.pathname` was exactly `/library/app/2312439508/tab/GameInfo`, so stale editor route tokens were not the deciding factor in this failure.

The failure is not deterministic. An earlier editor Save of Playable, whose effective category did not change, returned rich content correctly. Treat this as a race, not a fixed input.

## Investigation direction

`saveCurrent` and the other editor save paths call `applyMetadata(appId)` and `refreshCompatibilitySurfaces()`. A changed compatibility batch can publish a replacement native overview into `appStore.m_mapApps`. `Navigation.NavigateBack()` then re-enters Game Info. A publication or metadata re-application that lands during that transition, plus a single-hit render shield that an unrelated call can spend first, matches both the failure and its nondeterminism.

Establish which native call renders the placeholder and why the matched identity is not held for that render. Add temporary instrumentation if needed, then remove it. Do not merely lengthen the shield TTL or hit count, special-case this app, or enumerate MobX store instances during a render walk.

Required contracts stay unchanged: active global updates hold the visible status; QAM and context-menu cancellation do not release it; editor navigation releases pending work; a confirmed editor Save wins; the editor return shows that saved result with rich matched content; native launch identity, other tabs, and cross-game isolation stay correct.

Provide a focused regression that fails on the current bundle for the real transition ordering, not a rewritten scenario that passes trivially. Run the local gates, record actual results, commit, package locally, mark finished, and exit.

## Device state note

The Steam Deck dropped off the network during this validation (SSH and the debugger tunnel both failed). The fixture is currently left at global Verified with per-game Unsupported for `2312439508`. Main owns restoring the captured baseline and the next live validation. Do not make device calls in this round.

STATUS: CHANGES_REQUESTED
