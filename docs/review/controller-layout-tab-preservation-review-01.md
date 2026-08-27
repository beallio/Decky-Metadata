# Review — controller-layout-tab-preservation (round 01)

Branch: `feat/controller-layout-tab-preservation`
Reviewed against: `docs/plans/2026-08-26_controller-layout-tab-preservation.md`

## Verdict

Changes are required. The production scoping/descriptor design is mostly aligned
with the plan, but the patch is installed too late to capture the user's first
tab selection, the permanent smoke has several false-positive paths, named
integration/isolation/privacy tests are non-discriminating, and neither required
post-change device sequence was completed.

## Gate status

- Reviewed commit: `cca06fea9a43cc2dbf8a8a2d44e4666208c83f9f`.
- Reviewer reran `scripts/orchestration/run-quality-gates`: TypeScript/build,
  20 Vitest files / 248 tests, Python byte-compilation, and 400 pytest tests
  passed; final output was `quality-gates: OK`.
- Review-note deletion check passed and the feature worktree remained clean
  after the gate.
- The same-build pre-change device baseline is useful and confirms the native
  Legion reset, but the session log explicitly records that both post-change
  deployments failed before copying. No post-change hardware claim is accepted.

## Required changes

1. **Install before the initial chooser selection can occur.**
   `beforeControllerQuery` currently calls `ensureInstalled()` only for a direct
   filter query. On a fresh store-driven chooser query it clears memory and
   returns. The user then selects Community while the Tabs render is still
   unwrapped; the first direct filter query installs the wrapper only after that
   selection has already been lost, so there is no remembered tab to restore.
   Attempt lazy/idempotent installation on the store-driven query as well,
   before clearing its exact key. Keep retry/fail-open behavior when the chunk
   genuinely is unavailable. Add an end-to-end test starting uninstalled:
   store-driven query installs, first chooser render captures Community, direct
   query preserves memory, and remount overrides the native reset. A mutation
   that removes store-driven installation must make this test fail.

2. **Wait for the direct query and chooser remount deterministically.**
   `check_controller_tab_persistence.js` loops only while
   `BConfigurationQueryInFlight` is already true, but this direct UI query is
   intentionally identified by that flag being false. It can therefore return
   immediately and let the smoke inspect pre-query data/tab state. Wait for a
   real completion signal, such as replacement of the displayed cache entry
   captured before the call (with a bounded timeout), then require the Big
   Picture spinner/remount/list state to settle before the after snapshot.
   Tests must prove a delayed cache/remount cannot pass early and a missing
   completion signal fails with the expected timeout.

3. **Require the intended controller type.**
   Change the standalone smoke interface to accept an explicit expected type
   and fail unless the probe equals it. Document/pass `102` for
   `steamdeck-legos` and `4` for `steamdeck`. This prevents a wrong host or
   first-listed controller from passing solely because the type-4 native path
   also retains Community.

4. **Restore and verify the original tab before PASS.**
   The current success path checks `restore_status` before the EXIT trap runs,
   so restoration has not happened and a failed restore can still print PASS.
   Execute `dom-restore` explicitly, validate its returned selected tab equals
   `originalSelectedTab`, then disarm the trap and print PASS. Retain the trap
   only as best-effort early-error cleanup without replacing the original
   nonzero status. Add a test/mutation showing failed restoration exits nonzero.

5. **Make query-wrapper memory coverage stateful.**
   `controllerLayouts.test.ts` currently records only the `storeDriven` boolean;
   it does not seed or inspect tab memory, and the direct-clear mutation left
   this integration test green. Use the real control or a stateful fake. Assert
   through the wrapped input method that a direct query preserves a seeded key,
   a store-driven query clears that exact key, cleanup runs independently, and
   the initial store-driven query performs the required installation.

6. **Discriminate the composite memory key.**
   The current isolation test stores only `(appid A,index 0)` and
   `(appid B,index 1)`, which passes if keyed solely by either dimension. Store
   the same appid at two indexes and two appids at the same index, clear one
   exact key, and prove all other keys survive.

7. **Test emitted probe payloads, not identifier tokens.**
   The Python contract test can pass when `selectedTab`/`urlHashes` are removed
   from returned JSON but their local identifiers remain. It also does not
   prevent serializing the existing raw `identities` array. Exercise/parse the
   phase payload serializers (or scope assertions to the actual returned object)
   and require all selected-tab/count/hash fields while proving raw URLs,
   titles, identities, and account data cannot be emitted. Mutation/removal of a
   required field and addition of raw identities must fail.

8. **Complete post-change verification on both devices.**
   Once reachable, deploy this corrected commit to both dedicated hosts. Run the
   fixed smoke with expected types, capture before/after JSON and screenshots,
   and run `run_all.sh --no-launch`. Legion must preserve the selected Community
   tab across the first direct false-filter query and expose the complete
   same-run getter/hash set; Steam Deck must remain native. Verify filter and
   original tab restoration and close both tunnels. Update the durable session
   log with actual commands, artifacts, PASS/FAIL output, final focused/mutation
   totals, quality gate, and only the plan's explicit unverified items. Do not
   mark the round complete while the log still says post-change verification is
   blocked.

STATUS: CHANGES_REQUESTED
