# Research: ProtonDB Data for Non-Steam Games

## Status

Research only. No implementation is approved by this document.

The preferred future design is an optional, default-off ProtonDB community badge
for matched non-Steam shortcuts. The badge would appear as a passive row below
Steam's native feature badges in Game Info. Decky Metadata would fetch and cache
ProtonDB data during metadata enrichment or a bounded backfill. Opening Game Info
would not make a Decky Metadata network request.

Do not use ProtonDB to replace Valve compatibility categories. Do not write
ProtonDB values to Steam's packed compatibility state.

## Research goals

This research answers these questions:

1. Can ProtonDB identify a non-Steam game reliably?
2. Can Decky Metadata use ProtonDB's live summary endpoint safely?
3. Should ProtonDB replace Valve Verified, Playable, Unsupported, or Unknown?
4. Can Decky Metadata show a separate ProtonDB badge in native Game Info?
5. Should ProtonDB data be fetched on Game Info entry or during metadata scans?
6. How would the feature coexist with `bschelst/protondb-decky`?
7. What must be verified before implementation and release?

## Executive findings

- ProtonDB summaries are keyed by a real Steam App ID.
- A non-Steam shortcut App ID is a local synthetic identifier and must never be
  sent to ProtonDB.
- Decky Metadata already resolves and stores a separate `steam_appid` for a
  matched Steam release.
- ProtonDB medals do not have the same meaning as Valve's Deck compatibility
  categories.
- A separate, attributed community badge is valid. Replacing Valve status is
  not valid.
- The native Game Info feature-list target was identified on the live Deck.
- A passive fourth row fit below Steam's native feature badges and did not add a
  D-pad focus stop.
- Deck-side Python can reach ProtonDB. A bounded nine-game sequential backfill
  completed without errors or rate limits.
- The current missing-metadata scan cannot be reused unchanged for ProtonDB
  backfill because it excludes complete records and treats optional misses as
  failures.
- `protondb-decky` uses a different Game Info target, cache, resolver, and
  request lifecycle. There is no confirmed low-level patch conflict, but
  enabling both produces duplicate ProtonDB information and duplicate requests.

## Current Decky Metadata architecture

### Shortcut identity

`backend/shortcuts_vdf.py` reads or derives a local non-Steam shortcut App ID.
A derived ID uses CRC32 data and Steam's high-bit shortcut namespace. It is a
local shortcut identity, not a Steam catalog identity.

The backend persists metadata under that shortcut ID:

```text
metadata[shortcut_app_id]
```

### Matched Steam identity

`backend/providers/steam.py::resolve_steam_appid_for_title` resolves a real
Steam App ID from:

1. a trusted stored Steam Store URL;
2. a manually entered Steam App ID or URL;
3. conservative Steam Store title search;
4. delisted-game matching where available.

The matched identity is stored separately:

```text
metadata[shortcut_app_id].steam_appid
```

`main.py::_metadata_with_steam_news_sync` uses that Steam App ID for Steam news,
Store details, and Valve Deck compatibility. The frontend also uses it for
matched quick links and controller layouts.

### Current Valve compatibility fields

`src/types.ts::MetadataData` and the Python metadata record contain:

```text
deck_compat_category   Raw Valve category
deck_compat_override   Explicit per-game user choice
```

`src/steam/metadataPatch.ts::effectiveCompatibilityCategory` currently resolves:

```text
manual override > Valve category > no projected category
```

This behavior must remain independent of ProtonDB.

## ProtonDB interface research

### Observed live endpoint

```text
GET https://www.protondb.com/api/v1/reports/summaries/{steam_appid}.json
```

An observed response contains:

```json
{
  "bestReportedTier": "platinum",
  "confidence": "strong",
  "score": 0.91,
  "tier": "platinum",
  "total": 748,
  "trendingTier": "platinum"
}
```

Observed behavior:

- no authentication is required;
- the path requires a Steam App ID;
- a missing or unknown summary returns HTTP 404;
- the response does not contain the title or requested App ID;
- the response does not contain a freshness timestamp;
- the canonical aggregate is `tier`;
- `bestReportedTier`, `trendingTier`, and `provisionalTier` can disagree with
  `tier` and must not replace it silently.

A 2018 maintainer discussion called `/api/v1` a formal API and an ad hoc data
contract for consumers. No current API specification, rate policy, SLA,
freshness contract, or deprecation policy was found.

### CORS and request ownership

Normal browser CORS does not permit a direct frontend request from SteamUI.
`protondb-decky` uses Decky's `fetchNoCors`. The preferred Decky Metadata design
uses its Python backend instead. This keeps request limits, response-size bounds,
timeouts, schema validation, cache policy, and diagnostics in one place.

### Data and attribution

ProtonDB publishes report exports under ODbL and individual contents under DbCL.
These licenses permit reuse with attribution and other obligations. They do not
provide a current service guarantee for the live HTTP endpoint.

Before public release, confirm with ProtonDB:

1. that a distributed Decky plugin may call the summary endpoint;
2. expected request volume and cache duration;
3. required attribution text;
4. whether live-response caches have obligations beyond the published exports.

## ProtonDB and Valve semantics

### ProtonDB medals

ProtonDB defines:

| Tier | ProtonDB meaning |
|---|---|
| Platinum | Runs perfectly out of the box |
| Gold | Runs perfectly after changes |
| Silver | Runs with minor issues but is generally playable |
| Bronze | Runs but often crashes or prevents comfortable play |
| Borked | Will not start or is crucially unplayable |
| Pending | Not enough final evidence for a rating |

`Native` is a report/runtime variant, not a medal quality level.

### Valve categories

Valve defines:

| Category | Valve meaning |
|---|---|
| Verified | Passes all Deck checks with no configuration work |
| Playable | Functions but can require manual work |
| Unsupported | Does not function because of Proton or hardware incompatibility |
| Unknown | Valve review information is unavailable |

Valve Verified includes controller input, glyphs, text input, launcher behavior,
performance, resolution, text legibility, and middleware checks. ProtonDB
Platinum does not establish those requirements.

### Validated conflicts

Observed examples prove that the systems do not map one-to-one:

- Cyberpunk 2077: ProtonDB Gold; Valve Deck Verified.
- Apex Legends: ProtonDB Silver with strong confidence and many reports; Valve
  Unsupported because of anti-cheat.
- Destiny 2: ProtonDB Borked; Valve Unsupported.
- A pending summary can carry a provisional Platinum value while the final tier
  remains Pending.

### Rejected status-replacement design

The following precedence was considered and rejected:

```text
manual override > ProtonDB-derived Steam category > Valve category > Unknown
```

It would let a community aggregate replace a first-party Deck review while
using Valve-looking badges. It could mark an anti-cheat-blocked game Playable or
mark ProtonDB Platinum as Verified without controller and display evidence.

Do not:

- map Platinum to Verified;
- map ProtonDB medals into `deck_compat_category`;
- write ProtonDB results into `steam_hw_compat_category_packed`;
- describe a ProtonDB-derived result as a Valve status;
- use ProtonDB failure as Unsupported.

An independent Claude Opus 5 review reached the same no-replacement conclusion.
The exact model was `claude-opus-5` through Claude Code 2.1.251 with no fallback
configured. The review conditionally approved a separate, attributed badge.

## Non-Steam identity research

### Identity priority

Use identity sources in this order:

1. explicit Steam App ID or Steam Store URL;
2. persisted user-confirmed match;
3. exact cross-store ID relation;
4. conservative Steam title search as a candidate;
5. no ProtonDB request when the result is ambiguous.

Potential exact crosswalks:

- IGDB `external_games` can relate Steam, GOG, and Epic IDs, but requires Twitch
  credentials and must not ship a shared client secret.
- Wikidata has Steam, GOG, and Epic properties under CC0, but coverage is
  incomplete.
- SteamGridDB supports external platform IDs but requires an API key and warns
  that mappings can be stale.

The existing Decky Metadata `steam_appid` convention is sufficient for an
initial display-only feature because the same match already drives Steam data,
quick links, and controller layouts. Future work can add match provenance if
product requirements demand explicit confirmation.

### Resolver validation

The existing resolver produced valid automatic matches for examples including
Control, Cyberpunk 2077, Diablo IV, Kingdom Hearts, Prey, and Dead Space. It
failed closed for examples such as Alan Wake 2, Fortnite, Minecraft, and some
delisted titles. Known delisted Steam IDs still produced ProtonDB summaries.

A ProtonDB result always describes reports for the matched Steam release. It is
not proof that an Epic, GOG, or other store build behaves identically. Launcher,
DRM, anti-cheat, executable, patch, and DLC differences remain possible.

## Preferred future feature

### User-facing behavior

Add a QAM toggle:

```text
Show cached ProtonDB row

Shows a passive ProtonDB community rating for matched non-Steam games in Game
Info. Does not change Steam Deck Compatibility.
```

Behavior:

- default off;
- off means no Decky Metadata ProtonDB request and no row;
- on queues bounded scan-time enrichment and allows display;
- disabling stops queued work, hides the row, and prevents late responses from
  becoming visible;
- existing cache can remain private while disabled;
- official Steam games never receive the Decky Metadata row.

Suggested passive row:

```text
ProtonDB · Gold
```

An optional second line can show:

```text
Strong confidence · 155 reports
```

The row must include the word `ProtonDB`. It must not use Valve's Verified icon
or wording. The first version should have no click action, Focusable wrapper,
`tabIndex`, or controller action.

### Eligibility

Render only when every condition passes:

```text
setting enabled
AND exact rendered App ID is a native non-Steam shortcut
AND metadata belongs to that shortcut App ID
AND metadata.steam_appid is positive
AND cached summary steam_appid equals metadata.steam_appid
AND cached summary is structurally valid
AND tier is a recognized final medal
```

Pending, malformed, unknown, mismatched, or unavailable data produces no row.

### Shared provider cache

ProtonDB data belongs to the Steam product, not to one local shortcut. Store it
once under a root cache keyed by canonical Steam App ID:

```json
{
  "settings": {
    "protondb_badge_enabled": false
  },
  "protondb_cache": {
    "15100": {
      "steam_appid": 15100,
      "tier": "gold",
      "confidence": "strong",
      "score": 0.74,
      "total": 155,
      "fetched_at": 1788110000,
      "source_url": "https://www.protondb.com/app/15100"
    }
  }
}
```

`get_all_metadata` can project the matching shared cache entry into each returned
frontend metadata record. The persisted shortcut record does not need a copy.

Benefits:

- one request per Steam product;
- duplicate shortcuts can share one result;
- a changed shortcut match cannot carry the old result forward;
- shortcut deletion does not destroy data still used by another shortcut;
- Game Info can read the normal frontend metadata cache synchronously.

### Provider contract

A future `backend/providers/protondb.py` should:

- accept only a validated positive integer Steam App ID;
- construct a fixed summary URL from that integer;
- use the standard library only;
- bound timeout to about 10 to 12 seconds;
- bound the response to 64 KiB;
- accept only a JSON object;
- validate known final tiers;
- validate finite score in `0..1`;
- validate non-negative integer total;
- normalize camelCase fields to the persisted shape;
- treat HTTP 404 as no data;
- retain a last good value after temporary transport failure;
- avoid logging response bodies;
- deduplicate in-flight requests by Steam App ID;
- recheck the setting and parent match before saving a late response.

Suggested provisional policy until ProtonDB provides guidance:

- one concurrent request;
- seven-day positive refresh interval;
- seven-day negative cache for 404;
- about 15 minutes before retrying a temporary failure;
- no request from a React render or Game Info mount.

## Scan-time caching design

### Normal metadata search

```text
match metadata
→ resolve Steam App ID
→ fetch normal Steam/IGN data
→ if ProtonDB toggle is enabled, fill shared ProtonDB cache
→ save successful metadata even when ProtonDB is unavailable
```

### Existing-record backfill

```text
toggle enabled
→ select complete records with positive Steam App IDs
→ deduplicate by Steam App ID
→ sequentially fetch missing or stale ProtonDB entries
→ update shared cache
→ refresh the frontend metadata view
```

### Current scanner limitation

`main.py::_metadata_needs_scan` selects only incomplete metadata:

```text
return not self._metadata_is_complete(metadata)
```

Existing complete records would not receive ProtonDB data after the toggle is
introduced.

`backend/scan_runner.py::run_scan_pipeline` also treats every non-matched result
as a failure. A valid ProtonDB 404 would therefore be reported as a metadata
failure if the generic scan were reused without changes.

The future design needs either:

- a separate, small ProtonDB enrichment queue; or
- provider-specific progress semantics in a generalized enrichment runner.

Do not rerun Steam title matching, IGN, artwork, descriptions, or delisted lookup
for a record that only needs ProtonDB enrichment.

Suggested provider progress states:

```text
cached
fetched
no data
temporary failure
completed
```

A ProtonDB miss must not increment primary metadata failure counts.

## Live Steam Deck validation

Validation date: 2026-08-30.

### Fixture

```text
Shortcut App ID: 2312439508
Stored Steam App ID: 15100
Title: Assassin's Creed: Director's Cut Edition
```

### Native Game Info feature list

The live right column contained:

1. Single-Player
2. Family Sharing
3. Partial Controller Support

Fiber inspection found a common native class component with props:

```text
overview
feature
minimode
suppresstooltip
```

Observed native feature values:

| Feature | Label |
|---:|---|
| 7 | Single-Player |
| 23 | Family Sharing |
| 2 | Partial Controller Support |

`overview.appid` and `details.appid` were the exact shortcut ID `2312439508`, not
matched Steam ID `15100`. This supports strict per-shortcut rendering without
cross-game leakage.

The native list was one React element with direct feature-component children.
This is a stronger target than `appDetailsClasses.InnerContainer` or a minified
CSS class.

### Layout probe

A temporary fourth passive row was inserted after the native rows:

```text
ProtonDB · Gold
```

Observed result:

- correct right-column alignment;
- no overlap or clipping;
- sufficient vertical space;
- pressing D-pad Down from Game Info continued directly to Store Page;
- the temporary row did not receive `gpfocus`;
- the row was removed after the probe.

### Deck-side endpoint probe

For Steam App ID `15100`:

```json
{
  "status": 200,
  "content_type": "application/json",
  "bytes": 143,
  "elapsed_ms": 261,
  "tier": "gold",
  "confidence": "strong",
  "total": 155
}
```

An invalid/no-data ID returned HTTP 404 in 72 ms.

### Sequential backfill probe

The live metadata store contained:

```json
{
  "metadata_records": 14,
  "matched_records": 9,
  "unique_steam_appids": 9,
  "duplicate_mappings": []
}
```

A temporary one-at-a-time backfill with 200 ms between requests completed:

```text
Requests: 9
Total duration: 2.794 seconds
Successful: 9
HTTP failures: 0
Rate limits: 0
Response size range: 138 to 146 bytes
Latency range: 42 to 235 ms
```

Observed summaries:

| Steam App ID | Tier | Confidence | Reports |
|---:|---|---|---:|
| 15100 | Gold | Strong | 155 |
| 32500 | Gold | Strong | 59 |
| 55150 | Gold | Strong | 265 |
| 213120 | Silver | Low | 7 |
| 224060 | Silver | Good | 23 |
| 338930 | Platinum | Moderate | 9 |
| 1211020 | Platinum | Strong | 28 |
| 2751000 | Platinum | Strong | 28 |
| 3041230 | Gold | Strong | 232 |

This proves that a small sequential backfill is practical on the current Deck.
It does not establish acceptable request volume for a large library.

### Validation cleanup

- Temporary on-device probe code was deleted.
- The temporary Game Info row was removed.
- Temporary local probe files were deleted.
- The CDP tunnel was stopped.
- No repository file was changed during device research.
- The log audit reported `fatal: false` and no known error signature for the
  validation work.

## Interaction with `bschelst/protondb-decky`

### Versions reviewed

Upstream repository:

```text
Repository: https://github.com/bschelst/protondb-decky
Default branch: main
Commit: 5d5f6ee54325dd6dd1e26984f45bef7e2f581685
Commit date: 2026-05-25
Package version on main: 1.3.3
```

The live Deck had `protondb-decky` version 1.2.0 installed with its library badge
enabled.

### Upstream library patch

`src/lib/patchLibraryApp.tsx`:

1. patches `/library/app/:appid`;
2. finds `appDetailsClasses.InnerContainer`;
3. inserts `<ProtonMedal />` at child index 1;
4. renders the medal as an absolute overlay on the hero/header.

The proposed Decky Metadata row uses the separate Game Info native feature list.
The two plugins do not mutate the same React child list.

Decky route patches run sequentially and should compose in either load order.
The current Deck already ran Decky Metadata and `protondb-decky` together. The
upstream Gold overlay and Decky Metadata's existing Game Info behavior rendered
without a confirmed route-patch failure.

### Upstream non-Steam matching

`src/hooks/useAppId.ts` resolves non-Steam games independently:

1. read the shortcut title;
2. request Steam Community SearchApps;
3. choose an exact cleaned-title result.

It does not use Decky Metadata's stored `steam_appid`. The two plugins can
therefore choose different Steam editions and show different tiers.

The live Assassin's Creed fixture produced Gold in both paths, but that does not
prove general identity agreement.

### Upstream requests and cache

`src/hooks/useBadgeData.ts` and `src/actions/protondb.ts` can request on Game Info
mount when cache data is missing or old:

- ProtonDB summary;
- Steam app details for Linux support;
- the upstream analysis gateway.

Upstream uses LocalForage stores such as `protondb-badges-cache`. Its primary
badge freshness is 24 hours. Current upstream grid support can also prefetch in
batches and uses a seven-day status age.

The proposed Decky Metadata cache lives in backend `decky_metadata.json`. The
stores do not collide, but they do not coordinate. If both caches are stale,
both plugins can request the same ProtonDB summary.

### Upstream toggle caveat

In current upstream source, `ProtonMedal` invokes `useBadgeData` before checking
`settings.enableLibraryBadge`. Hiding the upstream library badge does not
necessarily prevent its mount-time requests.

The current upstream grid and store patches also have separate lifecycle
behavior. Disabling a visual setting can leave an existing injected grid/store
element until a later route or reinjection cycle.

Therefore, Decky Metadata can guarantee only its own toggle contract. It cannot
guarantee that Game Info causes no ProtonDB-related network activity when
`protondb-decky` is installed.

### Coexistence matrix

| Upstream badge | Decky Metadata row | Result |
|---|---|---|
| Absent/off | Off | No Decky Metadata ProtonDB UI or request |
| Absent/off | On | Passive right-column row; scan/backfill requests only |
| On | Off | Interactive upstream hero badge and upstream request behavior |
| Hidden by upstream setting | On | Local row visible; upstream can still request |
| On | On | Two indicators and independent caches |
| Both stale | Both on | Duplicate summary requests are possible |
| Different title matches | Both on | Conflicting tiers are possible |

### Coexistence safeguards

If implemented, Decky Metadata should:

- remain default off;
- scope the row to strict native non-Steam shortcuts;
- state in QAM that `ProtonDB Badges` can produce a second indicator;
- keep a separate backend cache and settings key;
- use its own React key, data marker, and CSS namespace;
- never read or write upstream LocalForage stores;
- never call upstream hooks or analysis gateway;
- never depend on upstream settings;
- never suppress itself by searching for an upstream DOM class;
- use a stable owned-child marker and avoid repeated array splicing;
- remove its wrapper, listeners, timers, and queued work on dismount;
- ignore late responses after disable, rematch, route change, or unload.

Suggested names:

```text
Setting: protondb_badge_enabled
Cache: protondb_cache
React key: decky-metadata-protondb-row
DOM marker: data-decky-metadata-protondb
CSS prefix: decky-metadata-protondb-
```

## Expected repository scope for future implementation

Backend:

- `backend/storage.py`
- new `backend/providers/protondb.py`
- `backend/scan_runner.py` or a dedicated enrichment runner
- `main.py`

Frontend and QAM:

- `src/types.ts`
- `src/backend.ts`
- `src/ContentPanel.tsx`
- `src/components/qam/MetadataSection.tsx`

SteamUI:

- `src/steam/routerPatches.ts`
- `src/steam/reactTreeWalk.ts`
- `src/steam/install.ts`
- a small passive badge component and pure eligibility resolver

Tests and documentation:

- provider, sanitizer, cache, setting, race, and negative-cache backend tests;
- QAM default/load/save/rollback tests;
- feature-list target, stable insertion, duplicate prevention, identity, and
  teardown frontend tests;
- README and changelog only when behavior ships;
- committed `dist/index.js` when frontend behavior ships;
- a normal implementation session record under `docs/agent_conversations/`.

## Required implementation tests

### Backend

- setting defaults false and persists;
- off means no provider request;
- invalid, zero, negative, or missing Steam App ID makes no request;
- summary URL is built only from the validated integer;
- all accepted tier/confidence values are normalized;
- pending, malformed, oversized, and unknown-tier responses fail closed;
- HTTP 404 is negative-cached without primary scan failure;
- timeout, TLS, JSON, 429, and 5xx errors preserve last good data;
- shared cache deduplicates duplicate shortcut mappings;
- single-flight behavior prevents duplicate concurrent requests;
- late result is rejected after disable or match change;
- complete records can enter ProtonDB-only backfill without rerunning providers.

### Frontend

- exact native shortcut and cache App ID are required;
- official Steam games never receive the row;
- unmatched shortcuts never receive the row;
- pending, malformed, and mismatched cache entries render nothing;
- row is inserted once after all native feature rows;
- missing or ambiguous feature-list target returns native output unchanged;
- row has visible and accessible ProtonDB attribution;
- row has no D-pad focus stop;
- setting off hides immediately;
- route change cannot leak the previous game's row;
- repeated route render, plugin reload, and upstream plugin load order do not
  duplicate the row;
- no compatibility field, packed bit, app-store object, or native badge changes.

### Live Deck release gate

1. Validate current native feature-list fingerprint.
2. Enable and disable from QAM while Game Info remains mounted.
3. Verify the row appears from cache without a Game Info network request.
4. Verify matched, delisted, unmatched, duplicate, and official fixtures.
5. Switch rapidly between games and confirm no App-ID bleed.
6. Verify focus order with `gpfocus_dump.js` and inventory with
   `focus_order.js`.
7. Verify offline, 404, timeout, stale-cache, and late-response behavior.
8. Verify metadata refresh and toggle-triggered backfill progress.
9. Verify plugin reload and dismount remove all owned UI and work.
10. Test with `protondb-decky` absent, installed but hidden, enabled, loaded
    before Decky Metadata, and loaded after Decky Metadata.
11. Confirm no new errors with the project log audit.

Backend changes require a full packaged plugin install on the Deck before this
release gate. Use the project runbook and committed Deck tooling.

## Product recommendation

Do not build a ProtonDB-to-Valve status replacement.

A future passive row is technically viable and has live placement proof. Its
unique value is:

- use of Decky Metadata's stored non-Steam match;
- scan-time caching;
- a native-looking, passive Game Info location;
- no Decky Metadata request on Game Info entry.

`protondb-decky` already provides a richer interactive ProtonDB experience for
users who want hero overlays, report submission, analysis, Store badges, and
library icons. Decky Metadata should not copy those features.

If the passive row is implemented, keep it opt-in and document that enabling it
beside `protondb-decky` produces two independent ProtonDB indicators. This is an
expected coexistence result, not a low-level patch error.

## Open decisions before implementation planning

1. Should low-confidence but final tiers appear with their confidence and report
   count, or should the row require a minimum confidence?
2. Should enabling the toggle immediately start bounded backfill, or wait for an
   explicit metadata refresh?
3. Should cached data remain visible after temporary refresh failure, and for
   how long?
4. Is a passive text row sufficient, or is a later focusable ProtonDB link
   required?
5. Is the existing stored `steam_appid` sufficient, or should automatic matches
   gain explicit provenance before badge eligibility?
6. Should QAM show provider-specific cached, missing, and failed counts?
7. Does ProtonDB approve the planned live-endpoint volume and attribution?

## Primary sources

- ProtonDB summary example:
  <https://www.protondb.com/api/v1/reports/summaries/1145360.json>
- ProtonDB medal definitions:
  <https://www.protondb.com/news/medal-rating-system>
- ProtonDB contribution semantics:
  <https://www.protondb.com/contribute>
- Historical maintainer API discussion:
  <https://github.com/tryton-vanmeer/ProtonDB-for-Steam/issues/5>
- ProtonDB data exports:
  <https://github.com/bdefore/protondb-data>
- ODbL 1.0:
  <https://opendatacommons.org/licenses/odbl/1-0/>
- DbCL 1.0:
  <https://opendatacommons.org/licenses/dbcl/1-0/>
- Valve compatibility criteria:
  <https://partner.steamgames.com/doc/steamhardware/compat>
- Steam App ID documentation:
  <https://partner.steamgames.com/doc/store/application>
- IGDB API:
  <https://api-docs.igdb.com/>
- SteamGridDB API:
  <https://www.steamgriddb.com/api/v2>
- Wikidata Steam App ID property:
  <https://www.wikidata.org/wiki/Property:P1733>
- `protondb-decky` repository:
  <https://github.com/bschelst/protondb-decky>
- Upstream library patch:
  <https://github.com/bschelst/protondb-decky/blob/5d5f6ee54325dd6dd1e26984f45bef7e2f581685/src/lib/patchLibraryApp.tsx>
- Upstream App ID resolver:
  <https://github.com/bschelst/protondb-decky/blob/5d5f6ee54325dd6dd1e26984f45bef7e2f581685/src/hooks/useAppId.ts>
- Upstream badge data hook:
  <https://github.com/bschelst/protondb-decky/blob/5d5f6ee54325dd6dd1e26984f45bef7e2f581685/src/hooks/useBadgeData.ts>
- Upstream cache:
  <https://github.com/bschelst/protondb-decky/blob/5d5f6ee54325dd6dd1e26984f45bef7e2f581685/src/cache/protobDbCache.tsx>
- Upstream ProtonDB actions:
  <https://github.com/bschelst/protondb-decky/blob/5d5f6ee54325dd6dd1e26984f45bef7e2f581685/src/actions/protondb.ts>
- Upstream grid patch:
  <https://github.com/bschelst/protondb-decky/blob/5d5f6ee54325dd6dd1e26984f45bef7e2f581685/src/patches/LibraryGridPatch.ts>
