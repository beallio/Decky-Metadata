# Review — compatibility-default-scopes (round 01)

Candidate: `2530fd52ed4edb370ac7894f2cf0a15c1c047bf7`
Base: `dev`
Plan: `docs/plans/2026-09-10_compatibility-default-scopes.md`

## Verdict

Four verified findings require correction before device installation. Main reviewed the shared runtime resolver and corroborated independent read-only persistence and UI reviews. The recorded full quality gate passed (502 frontend tests, 4 skipped, backend suite, type/build checks), but the defects below are not covered by that green result. Do not author an approval note or integrate in this round.

## R1 — Preview must report eligibility, not coincidentally equal categories

At `src/MetadataPage.tsx:156-163`, `effective === globalDefault` is used as proof that the global default applies. For a Steam-ID record with Valve Verified, global Verified, and scope `no-steam`, the resolver correctly falls back to Valve Verified, but the preview incorrectly claims global inheritance. Unknown and other equal categories have the same problem.

Determine scope eligibility explicitly and share that decision with the effective resolver rather than duplicate the four scope predicates or infer eligibility from a numeric result. Preserve fixed/Follow Valve precedence. The editor must identify the outside-scope fallback even when its value equals the global default. Cover both coincident equal values and a scope-only revision while the editor is mounted; the current state-slot preload/fake resolver test does not establish that update behavior. Do not retain full-sentence wording assertions merely to pin display formatting.

## R2 — Keep save ownership, busy state, and errors across QAM popup remount

The new scope dropdown opens the native popup in another window. That can destroy Content instance A before its captured popup onChange runs; the returned QAM is Content instance B. A's handler sets A's component-local `compatibilitySaveInFlight` and busy state (`src/ContentPanel.tsx:211,531-534`), but B initializes new false values and renders enabled controls while A's backend request is still pending. B can then issue a second category/scope save. If A rejects, its inline error is written to the discarded instance instead of B.

Extend the existing shared compatibility/focus lifecycle so one policy transaction, its pending display state, and its error survive this popup remount. Both controls on B must remain disabled and reject activation until the request settles. A failed save must restore the last confirmed selection, surface the error in B, and return focus to the originating scope control. A stale plugin-lifecycle completion must not unlock or mutate a newer transaction. Reuse the current generation and bounded focus machinery; do not create a second general UI state machine.

Add a real two-instance/remount behavioral regression: A opens the menu; B mounts; A's callback selects a scope with a deferred RPC; B cannot start either save; resolve or reject the request and verify B's selection/busy/error and focus handoff. Test select/cancel/failure for category and scope origins where behavior differs. The current stored-origin assertions (`ContentPanel.updateSettings.test.tsx:350-359`) are plumbing checks, not proof of native focus restoration. If adapting the hook harness, ensure old setters cannot mutate B's hook storage simply because a global state array was replaced.

## R3 — Normalize an invalid present canonical scope

At `backend/storage.py:81-90`, a file containing only `deck_compat_default_scope: "bad"` has `has_scope=True`, `canonical_scope=None`, and `has_legacy_scope=False`. The condition at line 85 deletes the key instead of normalizing it to `all`. This violates Task 1, which reserves absence for files where neither scope key exists.

Include canonical-key presence in the normalization branch. Cover canonical-only invalid values and show that a later ordinary successful save persists the normalized canonical value while preserving unrelated data. Keep valid canonical precedence and the legacy-true fallback unchanged. Keep scope migration itself free of read-time writes; do not expand this correction into unrelated existing metadata normalization behavior.

## R4 — Make the absent-key rollback regression reach rollback

In `tests/test_deck_compat.py:502-506`, the `absent` fixture has no settings file when `_save_data` is replaced. Its setter fails in `_load_data` while trying to create that file (`main.py:1137-1138`), before inserting the scope key or entering the setter's save/rollback block. It therefore passes even if absent-key rollback is deleted.

Seed an existing settings file without either scope key before installing the failure hook. Then exercise a save that inserts the canonical key and fails during persistence. Assert the key is removed from in-memory state, disk state is unchanged, and a later successful read/save still behaves correctly. The regression must fail if the rollback removal branch is disabled.

## Round boundaries and evidence

Main has current authorization for full ZIP installation and all live checks, including launch fixture 2312439508, but owns those device actions after the corrected candidate passes local review. Do not contact the Deck or mutate its state in this correction round.

Run the focused reproductions and required local gates, record exact failing assertions and red/green outcomes, and retain concise logs under `/tmp/Decky-Metadata`. Keep free space sufficient; do not delete other plugins' temporary folders. Build/package after committing the implementation so the packaged version identifies its code commit; record the version/checksum without claiming delivery or installation. Commit the corrections and session evidence, mark this round finished, and exit. No source-history rewrite, merge, push, release, or approval note.

STATUS: CHANGES_REQUESTED
