# Review — non-steam-compatibility-status (round 08)

Branch: `feat/non-steam-compatibility-status`
Reviewed against: `docs/plans/2026-08-28_non-steam-compatibility-status.md`

## Verdict

The user-visible defects are corrected on the current live frontend: the stale
menu item is gone and selected shortcuts show Playable/Verified indicators in
Home and the grid. Independent review found a no-ship lifecycle defect in the
Home wrapper and a false-green Home test, plus incomplete fail-closed target
validation. These must be fixed before packaging.

## Gate status

- Reviewed implementation commits: `fe51539` and `92d7b53`.
- Implementer quality gates passed with 330 frontend tests and the full backend
  suite.
- Live screenshots prove one metadata menu item, no compatibility menu item,
  Playable/Verified Home and grid indicators for shortcut `2155012430`, and an
  unchanged official Verified indicator.
- Saving Verified changed packed category `10 -> 15`; Automatic restored `10`.
- Two independent read-only reviews agree that renderer insertion is safer than
  broadening `BIsModOrShortcut`, but both identify the Home tree-patcher
  lifecycle/test problem below.

## Required changes

1. **Make the Home wrapper teardown-safe and reinstall-safe.**
   `cardTreePatcher()` uses Decky's `createReactTreePatcher`. That utility
   installs an inner `afterPatch(node, "type", ...)` wrapper and discards its
   patch handle. The registered cleanup removes only `Xd.render` and `TK.type`;
   an already-created/cached GameCapsule wrapper can keep calling the old
   `decorateForApp` closure after dismount and can stack on reinstall. Replace
   this with a locally owned wrapper/controller or another design that becomes
   inert on cleanup and cannot stack through install -> dismount -> install.
   Add an explicit cleanup handle before any wrapper can escape.

2. **Replace the false-green Home patch test with a faithful two-phase test.**
   The current mock `createReactTreePatcher: (_steps, handler) => handler`
   incorrectly passes `fnItemRenderer` arguments to the final decorator. The
   real utility first receives a React tree, finds the GameCapsule element,
   patches its type, and calls the decorator only when that patched component
   later renders with its own props. Use the real utility where practical or a
   faithful two-phase double: return a nested GameCapsule element, capture the
   patched type, invoke it with current props, and assert decoration. Prove two
   recycled App IDs do not bleed, repeat renders do not duplicate, cleanup
   disables decoration, and reinstall produces exactly one indicator.

3. **Make target resolution and partial installation fail closed.**
   `resolveTargets()` checks writable descriptors but not that `Xd.render` and
   `TK.type` are callable. Require callable, writable target methods and the
   exact expected indicator/component shapes before patching. Add negative
   tests for missing, renamed, swapped, non-function, and ambiguous exports. If
   Home installs and grid installation then fails, immediately unwind Home;
   do not leave a partial patch outside `unpatchers`.

4. Add stable React keys to inserted array siblings and test idempotence when a
   native/plugin indicator already exists. Preserve unrelated children,
   false/null slots, fragments, and icon rows. Do not weaken exact App-ID,
   native-shortcut, positive-category, or official pass-through guards.

5. Extend live validation after the lifecycle fix: Home and grid
   Playable/Verified/Unsupported, Unknown/no badge, official pass-through,
   rapid shortcut-to-official-to-Unknown selection, dismount/rerender with no
   plugin badge, then reinstall/rerender with exactly one badge. Capture
   machine-readable App ID, app type, packed/effective category, resolved target
   fingerprints, badge count/classes/labels, and screenshots. Check logs for
   React key warnings and render exceptions.

6. Update the session log with these review findings and red-to-green evidence,
   rerun the full quality gate, build/deliver a new full package, close the
   tunnel, and stop for human installation when required. Do not mark complete
   from the current visual screenshots alone.

STATUS: CHANGES_REQUESTED
