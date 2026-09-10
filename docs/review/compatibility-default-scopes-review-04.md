# Review — compatibility-default-scopes (round 04)

Installed/tested candidate: `0.3.14+18f1c50` (implementation `97c2aa1`).

## Passed live checks

The formerly failing post-reload editor sequence now passes: after a version-preserving in-place import, creating a manual record, adding ID 15100, changing scope, and clearing the ID produces the outside-scope/native preview and restores the original packed 0. Later scope changes update the same editor/runtime correctly. A retained editor save also replaces the actual native map entry, and fixed/Follow Valve/Unknown precedence passes.

All four scopes pass across the captured native and ordinary Steam overviews. Native Great on Deck counts on this final candidate are 38 / 38 / 42 / 46 for steam / no-steam / metadata / all, derived from the current captured collection and native fixture sets. The original Library tab has been restored.

## Required correction — QAM can show enabled scope under confirmed Automatic after reload

Evidence: `/tmp/Decky-Metadata/four-scopes-live-qe4_x60v/qam-post-reload-failure.json`.

Sequence: install candidate, perform in-place `importPlugin("Decky Metadata", "0.3.14+18f1c50")`, complete the editor/scope tests, return Home, select scope `metadata`, then set the category to Automatic. Reopen QAM and wait for the settled controls.

Observed simultaneously:

- Persisted settings: `deck_compat_default: null`, `deck_compat_default_scope: "metadata"`.
- Shared runtime: category null, scope metadata, loaded true.
- Category combobox text: `Automatic — use matched Steam status`.
- Scope combobox text: `All games with saved metadata`, **disabled false**.

The scope must be disabled when the confirmed category is Automatic. The failure persists beyond the load/return transition.

Relevant code: `ContentPanel.tsx:245-259` treats any same-generation `compatibilityPolicySaveSnapshot` as authoritative, including a completed transaction, and uses its copied category/scope instead of the current shared runtime. Also, policy-save and popup-origin state in `qamCompatibilityFocus.ts` still belong to each module bundle, whereas the runtime now spans bundles. A retained callback can settle one module's transaction while the returned QAM reads another module's older completed snapshot in the same shared generation.

Ensure that completed transactions cannot override current confirmed category/scope. Keep pending-save and popup-origin ownership coherent across the same retained-callback/new-panel lifecycle the runtime now supports. Use the existing save/focus flow, not a parallel UI state machine or polling workaround. Include busy state and error propagation: neither control may accept another save while a retained callback owns one, and a failed save must appear in the returned panel.

Add a regression that lets a transaction settle, advances the confirmed category to Automatic through another current/retained caller, emits the real compatibility revision, and verifies scope is disabled with its value retained. Exercise two module instances sharing the compatibility runtime, not only two component instances importing the same module-local QAM store. Existing scope/category select/cancel/failure focus tests must stay green.

## Current device state

Main restored the record set, Automatic/all policy, and every captured native packed category. No temporary metadata remains. The Deck is reachable. Main owns further device verification, including the already-authorized launch; no device calls in this correction round.

Run focused red/green cases and full local gates, commit the correction, package the committed code, record evidence, mark finished, and exit. No approval note, merge, push, release, or unrelated changes.

STATUS: CHANGES_REQUESTED
