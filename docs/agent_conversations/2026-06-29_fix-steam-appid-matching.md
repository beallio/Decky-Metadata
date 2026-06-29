# 2026-06-29 Fix Steam Appid Matching

## Task Objective

Implement `docs/plans/2026-06-29_fix-steam-appid-matching.md` on
`feat/fix-steam-appid-matching`.

## Files Modified

- `main.py`
- `tests/test_steam_matching.py`
- `docs/agent_conversations/2026-06-29_fix-steam-appid-matching.md`

## Design Decisions

- Added `NON_PRIMARY_STEAM_TITLE_PATTERNS` and
  `_is_non_primary_steam_title` so demos, DLC, soundtracks, packs, bundles,
  and server/test entries lose to base-game candidates.
- Added `_distinctive_tokens_present` and required all distinctive query tokens
  to appear in a Steam storesearch candidate before scoring it. This rejects
  same-series matches such as Valhalla resolving to Director's Cut.
- Removed the loose `_reasonable_match` bonus from Steam appid scoring and used
  exact normalized match or a `difflib` ratio of at least `0.72` instead.
- Applied an `-800` non-primary title penalty, an `-120` extra-number penalty,
  and a `300` final score floor. This lets the Anniversary Edition base entry
  outrank the Demo and Space Marine 2, while a lone demo is rejected.
- Stopped trusting generated `steam_store_url` values during appid resolution;
  only provider-supplied `source_url` and `id` Steam app URLs short-circuit.

## Validation Results

- Baseline `scripts/orchestration/run-quality-gates`: passed.
- Red `./run.sh uv run --with pytest -- pytest -q tests/test_steam_matching.py`:
  failed as expected for demo preference, wrong-series rejection, variant-only
  rejection, cache-trap behavior, and missing helper methods.
- Green `./run.sh uv run --with pytest -- pytest -q tests/test_steam_matching.py`:
  passed (`7 passed`).

## Deferred Verification

Hardware validation is deferred to the human/orchestrator: rebuild and sideload
on a Steam Deck, confirm affected titles re-enrich through fresh Steam
storesearch requests, verify persisted `steam_appid` values update, and confirm
native Store/Community/Discussions/Guides links open the corrected Steam pages.
