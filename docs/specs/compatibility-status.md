# Compatibility status

## User behavior

Decky Metadata can set a Steam compatibility category on native non-Steam
shortcuts. The QAM **Default compatibility status** applies immediately to
existing and new shortcuts, including shortcuts that have no saved metadata.
Its choices are, in order: **Automatic — use matched Steam status**,
**Verified**, **Playable**, **Unsupported**, and **Unknown**.

The per-game **Compatibility status** has, in order: **Use global default**,
**Follow Valve**, **Verified**, **Playable**, **Unsupported**, and **Unknown**.
A fixed per-game choice wins over all other sources. Follow Valve ignores the
global default. It uses the current Steam match's category only; if none is
available, Steam keeps the shortcut's original status. Use global default uses
the numeric QAM category when selected, otherwise it uses the matched Steam
category or the original status when unavailable.

Unknown is an available Valve category, not missing data. Steam presents it
without a compatibility badge. All manual and default categories are choices
made by the user. They do not mean Valve certified the shortcut, and they do
not describe emulator performance.

## Scenario reference

`Original` is the native shortcut status before Decky Metadata changed it.

| ID | Global | Per-game condition | Expected result |
| --- | --- | --- | --- |
| S01 | Automatic | Legacy null/absent; Valve Playable | Playable; editor shows Use global default. |
| S02 | Verified | Unmatched, Use global default | Verified. |
| S03 | Verified | Valve Unsupported, Use global default | Verified. |
| S04 | Verified | No metadata record | Verified; no record is created. |
| S05 | Verified | Shortcut appears after bootstrap | Verified when its native overview exists. |
| S06 | Playable | Valve Verified, Use global default | Playable. |
| S07 | Unsupported | Valve Verified, Use global default | Unsupported. |
| S08 | Unknown | Valve Verified, Use global default | Unknown; remove a positive badge. |
| S09 | Unsupported | Fixed Verified | Verified. |
| S10 | Verified | Fixed Playable | Playable. |
| S11 | Verified | Fixed Unsupported | Unsupported. |
| S12 | Verified | Fixed Unknown | Unknown; never fall back. |
| S13 | Verified | Follow Valve, Valve Playable | Playable. |
| S14 | Verified | Follow Valve, Valve Unknown | Unknown; 0 is available. |
| S15 | Verified | Follow Valve, no Steam match | Original. |
| S16 | Verified | Follow Valve, no category | Original. |
| S17 | Any | Follow Valve category Playable -> Verified | Verified after normal refresh. |
| S18 | Verified | Follow Valve unavailable -> Playable | Playable after normal refresh. |
| S19 | Verified -> Unsupported | Inherit, Follow Valve, and fixed games | Only inheriting game follows global change. |
| S20 | Verified -> Automatic | Inheriting game with Valve Playable | Playable. |
| S21 | Verified -> Automatic | Inheriting game without category | Original, not old Verified. |
| S22 | Verified | Follow Valve -> Use global default | Verified after Save. |
| S23 | Verified | Use global default -> Follow Valve | Valve category or Original after Save. |
| S24 | Any | Scan, enrichment, or unrelated save | Keep numeric and valve per-game choices. |
| S25 | Verified | Follow Valve match removed or reassigned | Keep Follow Valve; do not reuse old category. |
| S26 | Verified | Record removed or cache cleared | Inherit global; global setting persists; injected Activity clears. |
| S27 | Any | Plugin reload then overview replacement | Reload and apply saved policy to exact native shortcuts. |
| S28 | Any | Dismount during callback | Restore baselines; late callback is inert. |
| S29 | Any | Steam game or official-ID alias | No mutation, badge, or filter change. |
| S30 | Any | Global or per-game save fails/cancels | Last confirmed setting remains active; show failures. |
| S31 | Any | Old load completes after successful save | New confirmed choice stays active. |
| S32 | Automatic / Follow Valve | Nonzero Original and no Valve data | Preserve Original and high packed bits. |

## Technical contract

Settings JSON stores `settings.deck_compat_default` as `0`, `1`, `2`, `3`, or
`null`; missing and null both mean Automatic. Values map to Unknown,
Unsupported, Playable, and Verified. Invalid persisted values, including
booleans, load as Automatic. `get_compatibility_default()` and
`set_compatibility_default(category)` return the persisted numeric-or-null
value. The setter rejects any other input without changing the saved or
in-memory value.

`MetadataData.deck_compat_override` and `MetadataRecord.deck_compat_override`
store a number, `"valve"`, or null. Null or an omitted field means Use global
default; `"valve"` means Follow Valve. Existing numeric values, including 0,
keep their meaning. Existing null/omitted Automatic records become inheritance,
so they retain their prior visible behavior while the global setting remains
Automatic. `deck_compat_category` stays provider-owned and is numeric-or-null;
the setting and `"valve"` are never written there.

Metadata saves preserve an omitted override. Explicit null resets it to
inheritance. A provider scan preserves the latest saved override under the data
lock, even when its sanitized provider shell contains null. Refresh,
enrichment, scans, and Steam-ID changes preserve the per-game override but
clear a stale provider category when it no longer belongs to the current
match. Removing a record removes that per-game choice and recomputes
inheritance; clearing metadata does not change the global setting.

For an unchanged Steam match, a failed or malformed Valve lookup keeps a valid
last-known provider category, including Unknown (0). An authoritative Valve
response with no category clears it. The plugin never carries a cached category
through a changed or removed Steam App ID.

The frontend loads one confirmed setting at startup. A requested value is not
published until the backend save succeeds. A shared mount generation makes old
setting saves, setting loads, metadata loads, and bootstrap callbacks inert
after dismount. Policy application makes one linear pass over exact native
shortcut overviews, retains high packed bits, captures native low-nibble
baselines before mutation, and publishes one shared revision after a changed
batch. Metadata refresh uses one native-entry batch for metadata records; it
does not rescan the full library once per global-only baseline. Availability
changes publish a revision even when the packed value already matches, so
mounted Home/grid badges update. The same resolver serves startup, incoming
overviews, metadata removal, detail state, and mounted Home/grid indicators.
It never writes through a matched official-AppID alias or a regular Steam game.

On plugin dismount, baseline restoration uses one native-entry lookup pass and
late setting responses cannot reapply a category. VDF-only IDs wait for a real
native overview; the plugin never fabricates an overview just to apply policy.
