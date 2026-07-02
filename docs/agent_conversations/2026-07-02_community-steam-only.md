# 2026-07-02 - community-steam-only

## Task Objective

Implement `docs/plans/2026-07-01_community-steam-only.md`: replace fabricated IGN/RAWG/YouTube community media with Steam Community Hub visual UGC for Steam-matched non-Steam games, add page-aware native feed support, and leave unmatched games with an empty Community section.

## Files Modified

- `main.py`
- `src/backend.ts`
- `src/steam.ts`
- `src/types.ts`
- `tests/test_community_steam_only.py`
- `README.md`
- `dist/index.js`

## Design Decisions

- Steam community UGC is parsed from keyless `steamcommunity.com/app/<appid>/homecontent/` HTML with a defensive standard-library parser.
- Lazy community enrichment no longer calls YouTube or RAWG. Matched games fetch Steam UGC page 1 and fall back to stored Steam screenshots when the feed is empty; unmatched games store empty community media.
- `community_images` remains backward-compatible with screenshot-like entries and now preserves optional `author` and `link`.
- The native `library/appcommunityfeed/<appid>` intercept honors Steam's requested `p` value. Page 1 uses cached metadata when present; later pages call the backend. Empty pages return `{ hub: [] }`.
- Native `p` is assumed 1-based per the plan. On-device verification should confirm page 1 is not duplicated; if Steam sends a 0-based value on a target system, offset the backend page mapping in a follow-up.

## Validation Results

- `./run.sh uv run --with pytest -- pytest -q tests/test_community_steam_only.py` passed.
- `./run.sh npx tsc --noEmit` passed.

Full quality-gate results are recorded in the implementation round output.
