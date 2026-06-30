# Review: steam-appid-override

## Scope reviewed
Diff `dev..feat/steam-appid-override` — `main.py`, `src/backend.ts`,
`src/components.tsx`, `src/i18n.ts`, `tests/test_steam_appid_override.py`.

## Findings
- **Backend (`enrich_steam_app`)**: correctly loads saved metadata, returns `None` for
  unknown apps, and re-enriches via `_metadata_with_steam_news_sync` which honors the pinned
  `steam_appid` (main.py:1747-1750). Persists through `save_metadata`. Matches plan task A.
- **Test**: asserts the pinned appid (338930) is the one passed to news/deck/details, that the
  title resolver is never invoked, and that store URL / deck compat / description flow into the
  saved record; unknown-app path saves nothing. Strong, targeted coverage. Plan task B.
- **Binding (`enrichSteamApp`)**: mirrors existing callable bindings. Plan task C.
- **`parseSteamAppId`**: pure helper; handles raw digits, store/community/SteamDB `/app/<id>`,
  `?appid=`, and generic `app/<id>`; clamps to a finite positive integer. Plan task D.
- **Editor field + `applySteamAppId`**: gates on `nonSteam`, saves the pin, re-enriches,
  refreshes `metadataCache`/form/UI, clears the pin on empty input; reuses existing style
  helpers and panel pattern. Plan task E.
- **i18n**: `steamAppIdLabel/Description/Apply` added to both the default and Italian locales,
  matching the device locale. Plan task F.

## Scope discipline
No changes to the matcher, `_metadata_with_steam_news_sync`, the hider, community media, or
unrelated editor fields. No new npm dependencies.

## Gates
`run-quality-gates` green: `tsc --noEmit`, rollup build, `py_compile`, full pytest all pass;
working tree clean.

Approval authorized by the human (project owner) for merge into `dev`. The `dev → main`
promotion remains a separate human gate.

STATUS: APPROVED
