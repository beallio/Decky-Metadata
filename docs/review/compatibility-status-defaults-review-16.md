# Review — compatibility-status-defaults (round 16)

Branch: `feat/compatibility-status-defaults`
Reviewed candidate: `161d624`, installed full ZIP `0.3.14+161d624`

## Verdict

The retained-hold correction is present, but the approved editor-return scenario still fails on the actual Deck. Keep the approved deferral policy. Resolve the native Game Info rendering failure on re-entry; do not restore immediate global updates while Game Info stays open.

## Confirmed live reproduction

Fixture: native shortcut `2312439508`, matched Steam ID `15100`, Assassin's Creed. Global Automatic, per-game Use global default. Start from a fresh native Library route and open Game Info: rich description, Ubisoft Montreal, Playable, and quick links are present.

1. Open QAM and select global Verified, then close QAM. PASS: active Game Info stays Playable with rich details and links.
2. Open native Manage -> Decky metadata.... PASS: leaving Game Info applies Verified; native packed category is 15.
3. Select per-game Unsupported. Click Save. Wait for the actual `entryBusy`-controlled Search button to return to enabled Search (the Save button itself is always enabled and is NOT a completion signal). Click Done once. Do NOT click the already selected Game Info tab again.
4. After the page settles, native packed category is 5 (Unsupported correctly won), but selected Game Info displays Steam's non-Steam placeholder. The description, developer, and compatibility panel are missing; quick links remain.

Evidence: `/tmp/Decky-Metadata/round16-editor-return-failure.json`. Main also reproduced loss of rich fields when saving Use global default and returning from the editor. One earlier explicit Playable save returned correctly, so do not assume every editor return fails deterministically.

Main restored this fixture to Use global default and global Automatic through the UI, then left Game Info. Power settings were not changed.

## Required correction

Find why a completed editor save and native return can leave the matched Game Info subtree in the native placeholder state. Inspect the lifetime of the retained native Game Info tree, route shield, and compatibility publication. Distinguish an actual route re-entry from a continuously open active Game Info view. Do not merely increase a delay/TTL, special-case this app, enumerate MobX store instances in a render walk, or introduce a second general refresh system.

Preserve these contracts: active global updates hold the visible status; QAM/context-menu cancellation does not release it; editor navigation releases pending work; confirmed editor Save wins; returning to Game Info displays that saved result and rich matched details. Native launch identity and cross-game route isolation must remain intact.

Use a focused regression for the demonstrated lifecycle failure if it can be represented with real renderer/route behavior. Run the required local gates, record actual results, commit the correction, package locally, mark finished, and exit. Main owns the live Deck and will validate the resulting candidate. No device calls, integration, push, history rewrite, or matched-games-only toggle work in this round.

STATUS: CHANGES_REQUESTED
