# 2026-07-05 Locale-Neutral Activity Labels

## Objective

Implement `docs/plans/2026-07-05_locale-neutral-activity-labels.md`.

## Finding

Thermo-nuclear review (`docs/reviews/2026-07-05_thermo-nuclear-fable.md`, MAJOR 8) found
`DECKY_STEAM_ACTIVITY_TYPE_LABELS` in `src/steam/activity.ts` (~234-244) and the fallback in
`deckySteamActivityTypeLabel` (~260) were hardcoded Italian string literals shipped to every
user, with the generic fallback being the Italian word `"Notizie"`. These labels feed
`feedlabel`/`author` and `GetCategoryAsString`/`GetEventTypeAsString` on synthetic activity
events rendered in the native Activity feed, while every other user-facing string in the plugin
is English.

## Files Modified

- `src/steam/activity.ts` — label values and fallback only
- `tests/test_locale_neutral_activity_labels.py` — new source-scan regression guard
- `dist/index.js` — rebuilt

## Change

Replaced the nine `DECKY_STEAM_ACTIVITY_TYPE_LABELS` values with English equivalents matching
Steam's own event-type vocabulary and the plugin's existing English tone, and changed the
`deckySteamActivityTypeLabel` fallback from `"Notizie"` to `"News"`. Numeric event-type keys
(12/13/14/15/23/24/25/28/35), `DECKY_STEAM_ACTIVITY_TYPE_TAGS`, and all surrounding logic are
unchanged — string-only substitution.

| Key | Before (Italian) | After (English) |
|---|---|---|
| 12 | Aggiornamento minore / Note della patch | Minor update / Patch notes |
| 13 | Aggiornamento standard | Update |
| 14 | Aggiornamento importante | Major update |
| 15 | Pubblicazione contenuti scaricabili | Downloadable content |
| 23 | Evento: bottino | Event: Loot |
| 24 | Evento: vantaggi | Event: Perks |
| 25 | Evento: sfida | Event: Challenge |
| 28 | Notizie | News |
| 35 | Evento nel gioco | In-game event |
| fallback | Notizie | News |

## Validation Results

- Red: `./run.sh uv run --with pytest -- pytest -q tests/test_locale_neutral_activity_labels.py`
  failed against the Italian source (`Aggiornamento` present, `"News"` absent).
- Green: same command passed after the label/fallback substitution.
- `./run.sh npx tsc --noEmit`: passed.
- `./run.sh npm run build`: passed and rebuilt `dist/index.js`.
- `./run.sh uv run --with pytest -- pytest -q` (full suite): passed.
- `grep -nE "Aggiornamento|Notizie|Pubblicazione|bottino|vantaggi|sfida|nel gioco" src/steam/activity.ts`:
  zero matches.
- `grep -nE "Aggiornamento|Notizie" dist/index.js`: zero matches.

## Deferred

Full runtime internationalization (resolving Steam's own localized event-type strings via a
native lookup, or a Decky i18n layer) is out of scope for this plan and deferred to its own
effort. This plan only removes the hardcoded Italian by substituting English defaults.
