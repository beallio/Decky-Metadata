# Research: Multi-Language UI and Localized Metadata

## Status

Research only. No implementation is approved by this document.

The feature requirement covers both plugin interface text and downloaded metadata.
A UI-only translation layer is not sufficient. The selected Steam language must
also control provider requests, persisted metadata variants, Steam activity text,
and locale-aware formatting.

The preferred future design uses a private, bundled i18next instance for plugin
interface text and a locale-aware backend metadata schema. Provider-native
translations take precedence. English is the deterministic fallback. Any field
that falls back must retain language and provider provenance.

## Research goals

This research answers these questions:

1. Can a Decky plugin detect and follow the Steam language?
2. Does Decky provide a plugin localization API or manifest localization?
3. Which Decky Metadata interface surfaces require translation?
4. Which metadata providers accept a language or locale?
5. Can downloaded metadata be translated for every game?
6. How must persistence and in-memory caches change to prevent cross-language
   leakage?
7. How should existing English and manually edited records migrate?
8. What must be validated before the feature can ship?

## Executive findings

- Multi-language plugin UI is feasible.
- Decky Loader uses i18next and react-i18next for Loader-owned text, but it does
  not expose that translation instance as a supported plugin API.
- `@decky/ui` exposes Steam language discovery through
  `SteamClient.Settings.GetCurrentLanguage()` and
  `SteamClient.Settings.GetAvailableLanguages()`. It does not expose a verified
  Steam language-change event.
- Decky Metadata has approximately 75 to 90 distinct plugin-owned interface
  phrases across about 15 frontend files.
- The current metadata store has one record per shortcut App ID. It cannot hold
  two language variants without one overwriting the other.
- Steam App Details supports localized names, descriptions, genres, and related
  Store text through `l=<steam-language>`.
- Steam partner events can return localized event text and assets when the
  publisher supplied that language. Steam falls back to English when it did not.
- Steam's documented `GetNewsForApp` Web API has no language parameter.
- IGN GraphQL has no verified locale variable or localized field contract.
- Steam Community content is user-authored and is not guaranteed to have a
  translation.
- The Steam Tracker delisted index contains App IDs and names for matching. It is
  not a localized metadata provider.
- Complete translated metadata cannot be guaranteed from the current providers.
  A strict every-field translation requirement needs a machine-translation
  provider for missing descriptions and news.
- Language and Store country are separate. Changing the language must not infer
  a country or change price, availability, or regional content.

## Required product behavior

The active Steam language must control:

- plugin QAM and editor interface text;
- context-menu actions, dialogs, status text, and toasts;
- number, plural, and date formatting;
- downloaded official localized titles when available;
- full and short descriptions;
- genre and feature labels;
- Steam partner-event and supported news text;
- screenshot captions when the source supplies localized captions;
- generated Steam activity labels and bodies.

The following values must remain stable and untranslated:

- the manifest and Loader identity `Decky Metadata`;
- shortcut App IDs and matched Steam App IDs;
- Steam event, announcement, and news GIDs;
- routes, React keys, CSS keys, RPC names, and payload field names;
- Store category IDs, Deck compatibility values, controller IDs, and DLC IDs;
- update channels and internal status codes;
- persisted source identifiers such as `Manual`, `IGN`, and `Steam`;
- source URLs and media URLs;
- raw logs and diagnostic data.

Developer, publisher, author, and game names should use official localized forms
only when the provider supplies them. The plugin must not invent translations of
brands or personal names.

## Current localization architecture

### Plugin interface

`package.json` has no i18n dependency. `rollup.config.js` uses only the Decky
Rollup preset. The installed `@decky/rollup` preset includes JSON support, so
static JSON catalogs can be bundled without another Rollup plugin.

The only existing localization boundary is
`src/steam/quickLinkResources.ts::localizeSteamToken`. It calls Steam's internal
`LocalizationManager.LocalizeString` for Steam-owned tokens and uses a stable
English fallback. This helper is valid for known Steam tokens. It must not become
the storage mechanism for plugin-owned translations because
`LocalizationManager` is an internal Steam object, not a documented Decky plugin
catalog API.

The main plugin-owned text surfaces are:

- `src/ContentPanel.tsx`;
- `src/MetadataPage.tsx`;
- `src/components/qam/MetadataSection.tsx`;
- `src/components/qam/DelistedIndexSection.tsx`;
- `src/components/qam/LogsSection.tsx`;
- `src/components/qam/PluginLogModal.tsx`;
- `src/components/qam/VersionsSection.tsx`;
- `src/components/qam/PluginUpdateSection.tsx`;
- `src/contextMenuPatch.tsx`;
- `src/toast.tsx`;
- compatibility, category, and controller display-label maps;
- generated activity and community attribution labels.

`src/ContentPanel.tsx` currently forces `en-US` number formatting and an
`MM-DD-YYYY` date layout. These must use `Intl.NumberFormat` and
`Intl.DateTimeFormat` for the active locale.

### Decky and Steam language discovery

The Decky frontend library declares:

```text
SteamClient.Settings.GetAvailableLanguages()
SteamClient.Settings.GetCurrentLanguage()
SteamClient.Settings.SetCurrentLanguage()
```

The current library contract does not declare a language-change registration
method. Decky Loader initializes its own i18next instance from
`navigator.language`, but that instance and Loader locale endpoint serve
Loader-owned text only.

A plugin-local language service should:

1. initialize synchronously from `navigator.language`;
2. query `SteamClient.Settings.GetCurrentLanguage()`;
3. normalize the Steam language name to a canonical BCP-47 locale;
4. call `i18n.changeLanguage()` if the resolved Steam language differs;
5. re-check the language when the plugin or a major panel mounts;
6. avoid polling for an undocumented Steam event.

If a future language selector is added, it must be an explicit override. The
initial feature should follow Steam automatically and should not add another
setting without a product requirement.

## Current downloaded metadata pipeline

### Persisted shape

`backend/storage.py::default_data` creates one flat metadata map:

```text
metadata[shortcut_app_id] = MetadataRecord
```

`main.py::get_metadata`, `get_all_metadata`, `save_metadata`, and
`clear_metadata_cache` read or replace those flat records. The frontend mirrors
this shape in `src/steam/core.ts::metadataCache`:

```text
metadataCache[shortcut_app_id] = MetadataData
```

This design supports one language only.

### Provider and merge flow

The current metadata flow is:

1. IGN search and fetch produce an initial record.
2. Steam title resolution finds a matched Steam App ID.
3. Steam App Details can overwrite the title, descriptions, people, genres,
   categories, and screenshots.
4. Steam partner events or `GetNewsForApp` add news.
5. `_sanitize_metadata` converts the result into one complete record.
6. `save_metadata` overwrites the app's prior record.
7. `get_all_metadata` loads that record into the frontend cache.
8. Steam patches inject descriptions, associations, screenshots, compatibility,
   quick links, activity, and community fallback data.

Current provider requests force English:

- `backend/providers/steam.py::steam_appdetails_for_appid` uses `l=english`;
- `backend/providers/steam.py::steam_partner_events_for_appid` uses
  `l=english`;
- `backend/providers/steam.py::resolve_steam_appid_for_title` uses
  `l=english` and `cc=US`;
- `backend/providers/community.py::community_url` uses `l=english`;
- `main.py::_http_text` and `_http_json` send
  `Accept-Language: en-US,en;q=0.9`;
- `main.py::_steam_news_for_appid` requests several language-specific feeds but
  does not select the active locale deterministically.

## Provider capability matrix

| Provider or data source | Verified locale capability | Required behavior |
|---|---|---|
| Steam App Details | Accepts full Steam language names in `l`; localized descriptions, genres, category descriptions, and some names were observed | Request the active Steam language, then English for missing required fields |
| Steam Store search | Accepts `l`; current code also fixes `cc=US` | Localize search output without deriving `cc` from language |
| Steam partner events | Accepts `l`; event text and event assets can be localized by the publisher | Request the active language; record English fallback when the publisher has no translation |
| Steam `GetNewsForApp` | Documented parameters do not include language; language probes returned the same English items | Do not claim the output is localized; use it as an English fallback only |
| IGN GraphQL | Current queries and variables have no locale; no locale contract was verified | Treat returned text as English/default and record the fallback |
| Steam Community | User-generated text remains in the author's language; `l` and `filterLanguage` do not guarantee translation | Preserve original user content; do not label it as translated metadata |
| Steam Tracker delisted index | App ID and title matching only; no locale input | Use it only to recover a Steam App ID |
| Steam artwork | Store and event publishers can provide localized assets | Use localized assets when returned; preserve a locale-neutral media fallback |
| IGN and community artwork | No verified localized asset selection | Treat the asset as locale-neutral or source-authored |

The current repository has no active Playhub network provider. `Playhub` appears
only in historical attribution and synthetic labels. It is not part of the
localized provider design unless a provider is added later.

## Runtime observations

A direct Steam App Details request for App ID 620 showed that `l=german`
returned German descriptions, Store category descriptions, and genres. The game
name remained the official `Portal 2` name. An invalid language value returned
English.

Changing `cc` from `US` to `DE` changed currency and regional Store output. This
proves that `cc` is not a language field. The localization feature must preserve
existing region behavior until a separate region requirement exists.

A Steam partner-event request for a translated app returned German event text
when the publisher had supplied it and English for an unsupported language.
A `GetNewsForApp` request returned the same English text for English, German, and
an invalid locale. This matches the documented lack of a language parameter.

## Preferred UI localization design

Use a private bundled `i18next` and `react-i18next` instance.

Recommended properties:

- static catalogs bundled with the plugin;
- an English catalog as the canonical fallback;
- semantic keys such as `metadata.refresh.action` instead of English sentences
  as keys;
- `useTranslation()` in React components;
- one translation service for toasts, patch callbacks, and other non-React code;
- ICU-compatible plural behavior through `Intl.PluralRules` as supported by
  i18next;
- `Intl.NumberFormat` and `Intl.DateTimeFormat` for values;
- no dependency on Decky Loader's private i18next instance;
- no remote locale fetch from Decky Loader's `/locales` endpoint.

Catalog validation must compare every non-English catalog with the English key
set. Missing keys can fall back at runtime, but supported-language release gates
should report incomplete catalogs.

## Canonical locale and provider adapters

Use one canonical BCP-47 locale in frontend state, RPCs, persistence, logs, and
tests. Convert it at provider boundaries.

Important mappings include:

| Steam language | Canonical locale |
|---|---|
| `english` | `en` |
| `german` | `de` |
| `spanish` | `es-ES` |
| `latam` | `es-419` |
| `portuguese` | `pt-PT` |
| `brazilian` | `pt-BR` |
| `schinese` | `zh-Hans` |
| `tchinese` | `zh-Hant` |
| `koreana` | `ko` |
| `japanese` | `ja` |

The implementation must define and test the complete mapping for every Steam
language returned by `GetAvailableLanguages()`. Chinese script variants must
remain separate. Do not reduce both variants to a generic `zh` value.

## Preferred locale-aware persistence

The backend must separate shared identity and user state from locale snapshots.
A suitable conceptual shape is:

```json
{
  "schema_version": 2,
  "metadata": {
    "1073741824": {
      "shared": {
        "steam_appid": 620,
        "steam_store_url": "https://store.steampowered.com/app/620/",
        "deck_compat_category": 3,
        "deck_compat_override": null
      },
      "localizations": {
        "en": {
          "data": {
            "title": "Portal 2",
            "description": "English description",
            "genres": ["Action", "Adventure"]
          },
          "requested_locale": "en",
          "resolved_locale": "en",
          "fallback_fields": [],
          "providers": ["Steam"],
          "updated_at": 0
        },
        "de": {
          "data": {
            "title": "Portal 2",
            "description": "German description",
            "genres": ["Aktion", "Abenteuer"]
          },
          "requested_locale": "de",
          "resolved_locale": "de",
          "fallback_fields": ["steam_news"],
          "providers": ["Steam", "SteamNews"],
          "updated_at": 0
        }
      }
    }
  }
}
```

The exact serialized shape can differ, but these invariants are required:

- an English fetch must not overwrite a German fetch;
- compatibility overrides and stable identities must not diverge by locale;
- each locale has its own refresh time;
- fallback fields and source provenance are visible to diagnostics;
- a record cannot claim `resolved_locale=de` when all displayed text came from
  an English fallback;
- stable IDs and URLs survive locale refreshes.

The backend should continue to return a flat `MetadataData` projection to the
frontend. It should resolve and merge the active locale before crossing the RPC
boundary. This keeps existing Steam patches focused on one active snapshot.

## Provider fetch and fallback algorithm

For one requested locale:

1. resolve or reuse the stable Steam App ID;
2. fetch Steam App Details in the requested language;
3. fetch Steam partner events in the requested language;
4. fetch English variants for required fields that are absent;
5. use IGN only for fields that Steam does not supply or when there is no Steam
   match;
6. mark IGN text as English/default unless a locale contract is verified;
7. use `GetNewsForApp` only as an English fallback;
8. compose one complete locale snapshot;
9. record `resolved_locale`, provider provenance, and `fallback_fields`;
10. save only the requested locale snapshot.

The sanitizer must not erase the distinction between a missing provider field
and an intentionally empty field before fallback is resolved. The safest design
is to compose and annotate the complete locale snapshot before applying the
existing final metadata sanitizer.

Recommended fallback order:

```text
exact locale -> compatible base locale -> English -> legacy/manual value
```

Examples:

```text
pt-BR -> pt -> en
es-419 -> es -> en
zh-Hans -> en
zh-Hant -> en
```

Do not use a generic Chinese fallback unless the product supplies and validates
that catalog.

## RPC and background-work changes

Locale-aware behavior must reach every metadata-producing path. The affected RPC
and internal operations include:

- `get_metadata`;
- `get_all_metadata`;
- `search_metadata`;
- `fetch_metadata`;
- `apply_fetched_metadata`;
- `auto_fetch_metadata`;
- `start_scan_missing`;
- `get_missing_metadata_count`;
- `enrich_steam_app`;
- `get_community_fallback_page` when it uses stored metadata.

Use both of these controls:

- persist the active content locale for background and restart behavior;
- pass the locale explicitly through fetch and scan functions to avoid hidden
  global-state races.

A scan for German metadata must consider an English-only snapshot as missing
German metadata. Otherwise the current missing-metadata scan will never populate
the requested language.

Manual editor saves should target the active locale snapshot. Shared identity and
compatibility fields must remain shared. Removing metadata should remove the
whole app record unless the UI explicitly gains a remove-current-language
operation; silently revealing an older fallback after removal would be
surprising.

## Existing-data migration

Migration must be lossless and versioned.

Recommended rules:

1. add a root metadata schema version;
2. extract stable Steam identity and compatibility fields into shared data;
3. migrate known downloaded records from the current forced-English providers
   into the English snapshot;
4. migrate `source: Manual` text into an `und` snapshot because its language is
   not known;
5. preserve update times, images, news, overrides, and source URLs;
6. make `und` the final fallback only;
7. mark the active requested locale as missing so the next refresh or scan can
   download it;
8. save through the existing atomic temporary-file replacement path;
9. retain a recoverable original until the first successful schema-2 save.

Do not guess that manually entered text is English.

## Frontend cache and locale switching

`src/steam/core.ts::metadataCache` can remain a flat active-locale projection,
but the active locale must be tracked beside it.

A locale change must:

1. increment a locale generation or request token;
2. request the new active projection from the backend;
3. ignore any response from an older generation;
4. replace the frontend metadata cache atomically;
5. reapply patched descriptions, associations, screenshots, and compatibility;
6. clear generated activity and community fallback caches;
7. refresh the currently visible app detail surface;
8. notify existing compatibility and metadata subscribers.

The current `appIdFromVisibleMetadataTitle` fallback in `src/steam/core.ts` uses
`metadata.title || appName(appId)`. A localized provider title can differ from
the non-Steam shortcut title. App resolution must consider the shortcut name and
known localized titles independently instead of allowing the localized title to
hide the shortcut name.

Refresh gates and promise caches that are keyed only by App ID must add the locale
to their key or reset on a locale change. A late German response must never
replace a newer French projection.

## Steam activity localization

`src/steam/activity.ts` currently builds generated activity as English:

```text
language: 0
name: new Map([[0, title]])
description: new Map([[0, body]])
loadedAllLanguages: true
```

For localized metadata it must:

- use the correct Steam `ELanguage` integer for `language` and localized maps;
- set `loadedAllLanguages` to false when only one language is present;
- preserve event IDs and GIDs across language changes;
- rebuild generated native activity from the active news snapshot;
- invalidate `deckyNativeActivityCache` and related activity caches on locale
  changes;
- translate plugin-generated event-type labels through the plugin catalog;
- preserve publisher text in the publisher-provided or fallback language;
- never report English-only `GetNewsForApp` data as translated.

Stable event IDs prevent duplicate activity entries when only the display
language changes.

## Machine-translation boundary

The present providers cannot guarantee translated text for every game and every
field. Strict translation coverage needs another provider.

A machine-translation layer, if approved, should:

- run only after provider-native locale and English fallback attempts;
- translate descriptions, summaries, genres, and feature labels;
- not translate App IDs, URLs, brands, developer names, publisher names, or user
  handles by default;
- preserve source text and source locale;
- record translation provider, model or API version, target locale, and time;
- cache translations by source-text hash and target locale;
- apply request, response-size, timeout, and cost limits;
- expose failure as an English fallback instead of blocking metadata refresh;
- avoid sending private shortcut paths or user data;
- define whether community posts and full news bodies are in scope.

Provider-native translation should always win over machine translation.
Machine-translated content must be distinguishable in diagnostics and, if the
product requires it, in the interface.

Choosing a translation service is a separate product and dependency decision.
It affects credentials, cost, privacy, offline behavior, service availability,
and packaging policy. This research does not select a service.

## Validation strategy

### Locale and catalog tests

- map every Steam language to one canonical locale;
- cover `schinese`, `tchinese`, `brazilian`, `latam`, and `koreana` explicitly;
- verify exact, base-language, English, and `und` fallback order;
- verify English fallback for a missing UI key;
- compare catalog key sets;
- verify interpolation and plural forms;
- verify locale-aware dates and numbers;
- verify right-to-left direction before Arabic is advertised.

### Storage and migration tests

- migrate a forced-English provider record without data loss;
- migrate a manual non-English record to `und`;
- store English and German variants for one App ID without overwrite;
- refresh German without mutating English or shared compatibility state;
- return the correct flat projection for each locale;
- report fallback fields accurately;
- treat an English-only record as missing for a German scan;
- clear all locale variants when the existing clear-cache action is used;
- preserve stable IDs and user overrides through migration and refresh;
- reject malformed locale and schema data safely.

### Race and cache tests

- switch from German to French while a German request is in flight;
- prove that the late German result cannot overwrite French;
- clear App-ID-only activity caches on locale change;
- keep synthetic activity IDs stable across locales;
- use the correct Steam language integer in generated activity;
- resolve the active app from the shortcut name even when localized metadata has
  a different title;
- prevent a locale-specific news freshness timestamp from suppressing another
  locale's refresh.

### Provider contract tests

- prove that Steam App Details receives the requested language;
- prove that Store country is unchanged by language selection;
- verify provider-native target text where a known fixture has a translation;
- verify English fallback where a fixture has no translation;
- verify that `GetNewsForApp`, IGN, and community data do not claim an unsupported
  target locale;
- bound response size, timeout, and malformed-data handling for every provider.

### On-device validation

Validate at least:

- English;
- one language with long labels, such as German;
- one CJK language, such as Simplified Chinese;
- right-to-left behavior before Arabic support is announced.

For each language, inspect:

- the QAM panel;
- metadata editor;
- context-menu entry;
- dialogs and toasts;
- descriptions and associations in Game Info;
- screenshots and captions;
- activity news and modal bodies;
- date, number, and plural formatting;
- scrolling, initial focus, and D-pad order;
- language switching with the same game open;
- fallback disclosure for untranslated provider fields.

Changes under `src/steam/` require the repository's live Deck verification tools
and the relevant smoke suites in `docs/runbooks/on-device-verification.md`.

## Preferred implementation sequence

1. Add the UI localization service and English catalog.
2. Migrate every plugin-owned interface string and locale-sensitive formatter.
3. Add canonical locale mapping and active-locale discovery.
4. Add the versioned locale-aware backend metadata schema and migration.
5. Make all metadata RPCs and scan paths locale-aware.
6. Localize Steam App Details and partner-event requests.
7. Add explicit English fallback and provenance for unsupported providers.
8. Make frontend metadata, Steam detail, community, and activity caches
   locale-aware.
9. Correct Steam activity language maps and invalidation.
10. Add human-reviewed catalogs for approved languages.
11. Run static, migration, provider, and on-device validation.
12. Decide separately whether strict coverage requires machine translation.

## Acceptance criteria for a future implementation

The feature is complete only when:

- the interface follows the selected Steam language;
- downloaded Steam metadata uses that language when Steam supplies it;
- English fallback is deterministic and recorded;
- two language variants for one game coexist without overwrite;
- changing language replaces visible metadata without restarting the plugin;
- stale requests cannot leak the previous language into the active cache;
- generated activity carries the correct Steam language value;
- stable IDs and user overrides do not change by language;
- existing metadata migrates without loss;
- unsupported providers do not falsely claim translated output;
- every advertised language has a reviewed catalog and on-device validation;
- the build, frontend tests, backend tests, migration tests, and required Deck
  smoke checks pass.

## Open product decisions

Implementation requires decisions on:

1. Which human-reviewed languages ship first.
2. Whether users can override the Steam language inside the plugin.
3. Whether fallback fields need a visible badge or only diagnostics.
4. Whether manual metadata edits are active-locale-only or can be marked
   language-neutral.
5. Whether community posts should remain source-language content.
6. Whether strict coverage requires machine translation.
7. If machine translation is approved, which service, credential model, cost
   limits, privacy policy, and content fields are allowed.

## Sources

### Repository evidence

- `package.json`
- `plugin.json`
- `rollup.config.js`
- `backend/storage.py`
- `backend/providers/steam.py`
- `backend/providers/community.py`
- `backend/providers/ign.py`
- `backend/providers/delisted.py`
- `main.py`
- `src/backend.ts`
- `src/types.ts`
- `src/ContentPanel.tsx`
- `src/MetadataPage.tsx`
- `src/steam/core.ts`
- `src/steam/metadataPatch.ts`
- `src/steam/detailsReassert.ts`
- `src/steam/activity.ts`
- `src/steam/quickLinkResources.ts`

### External sources

- Decky Loader i18next initialization:
  <https://github.com/SteamDeckHomebrew/decky-loader/blob/main/frontend/src/start.tsx>
- Decky Loader plugin rendering boundary:
  <https://github.com/SteamDeckHomebrew/decky-loader/blob/main/frontend/src/components/PluginView.tsx>
- Decky Loader locale and plugin routes:
  <https://github.com/SteamDeckHomebrew/decky-loader/blob/main/backend/decky_loader/loader.py>
- Decky frontend Steam Settings language API:
  <https://github.com/SteamDeckHomebrew/decky-frontend-lib/blob/main/src/globals/steam-client/Settings.ts>
- Steam supported language codes:
  <https://partner.steamgames.com/doc/store/localization/languages>
- Steam Store localization:
  <https://partner.steamgames.com/doc/store/localization>
- Steam event localization:
  <https://partner.steamgames.com/doc/marketing/event_tools#4>
- Steam News Web API:
  <https://partner.steamgames.com/doc/webapi/ISteamNews>
- Observed German Steam App Details response for Portal 2:
  <https://store.steampowered.com/api/appdetails?appids=620&l=german&cc=US>
- i18next fallback behavior:
  <https://www.i18next.com/principles/fallback>
- i18next plural behavior:
  <https://www.i18next.com/translation-function/plurals>
- react-i18next `useTranslation`:
  <https://react.i18next.com/latest/usetranslation-hook>
