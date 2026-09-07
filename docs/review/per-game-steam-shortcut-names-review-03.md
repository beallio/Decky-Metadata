# Review — per-game-steam-shortcut-names (round 03)

Branch: `feat/per-game-steam-shortcut-names`
Reviewed against: `docs/plans/2026-09-06_per-game-steam-shortcut-names.md`

## Verdict

Changes required at `071bf47`. The entry tokens, hydration reconciliation,
normalized cleared-ID path, scalar Decky API connection and shared-context
smoke reloads address most of round 02. Two frontend semantic defects remain,
verified directly in source after the independent review jobs timed out.

## Gate status

- Independent project gates passed: 423 frontend tests, 505 backend tests,
  TypeScript/build/Python checks and review-note retention.
- Both devices still failed SSH with `No route to host` at the last check.
  Full-package installation and required live acceptance remain pending.

## Required changes

### R1 — Preserve the full successful enrichment, not just three identity fields

`MetadataPage.tsx:532-537,562-566` uses `reconcileSteamIdentity(enriched)`,
discarding every enriched field except steam_appid, steam_store_name and
steam_store_url even when there were no edits during the request. Real
enrichment persists descriptions, compatibility, DLC/store categories and other
Steam details. The frontend instead puts the old values in its form/cache, so
`applyMetadata` uses stale values and a later Save overwrites the enriched
backend record with those old values.

Reconcile the complete enriched response field-wise against the snapshot taken
when that enrichment started. Preserve only genuinely newer editable values,
not every old value. Synchronize form companion text fields as required by the
existing editor contract. Do not retain the blanket form-revision early return
as the sole conflict strategy: it leaves this same backend/form split whenever
a user types during enrichment. Editor token and Steam-match guards still
apply. Keep background edits available.

Add delayed enrichment tests that return changed descriptions, compatibility
and another non-title field: with no concurrent edits all arrive in the
form/cache and survive later Save; with a concurrent title edit that title
survives while untouched enriched fields still arrive and survive later Save.
Assert complete consumer-visible data, not just Steam-name fields.

### R2 — Finish captured restore cleanup after leaving the editor

`MetadataPage.tsx:714-718` returns for an old editor token before clearing A's
saved history. Restore on A, navigate to B (or A/B/A), then resolve the native
restore: Steam has restored A but its durable history is never cleared.

After a confirmed native restore, complete the captured app ID's backend
history cleanup regardless of which editor is now visible. Token guards
protect local UI updates/toasts/busy state, not the already-started operation's
durable completion. Add a deferred native-restore navigation case proving A's
history is removed while B's history/form stay untouched. Also cover cleanup
failure retaining A's safe restored history without affecting B.

### R3 — Preserve the device integration gate

Finish these local corrections and evidence. Install and exercise the full
ZIP on each named device only when reachable, using the available GUI skill;
no direct VDF write, automatic rename, or unapproved game launch. When still
offline, report the missing device checks accurately; do not integrate, claim
approval, or substitute fixture success for actual install/UI validation.

STATUS: CHANGES_REQUESTED
