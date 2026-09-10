# Review — compatibility-status-defaults (round 10)

Branch: `feat/compatibility-status-defaults`
Reviewed against: `docs/plans/2026-09-07_compatibility-status-defaults.md`

## Verdict

One diagnosed renderer-discovery failure remains on the organized candidate
`1de5af06c1484e339d63f24a2bf4a06d9ddc9410`, installed as the FULL ZIP
`0.3.14+1de5af0`. The native filter correction passes its actual cached
collection check. The mounted Game Info refresh never reaches the actual
observed renderer because its discovery assumptions do not match Steam.

## Gate status

- Main installed the full organized ZIP through Decky's GUI. Capture
  `/tmp/Decky-Metadata/diagnostics/20260908T185041Z/doctor.json` confirms its
  version and the installed bundle hash matches the checkout.
- Evidence directory:
  `/tmp/Decky-Metadata/compat-final-20260908-uj5zn3hd/`.
- Cached Great on Deck stayed mounted and passed `34 -> 46 -> 34`; native
  Verified shortcuts passed `4 -> 16 -> 4`. See `native-filter-pass.json`.
- A fresh matched Game Info view displayed rich content and PLAYABLE.
  Global Verified changed it to the non-Steam placeholder again. See
  `game-info-automatic-before.json` and `game-info-verified-mounted.json`.
- Main restored Automatic and verified the original packed status values
  before this handoff. No fixtures or per-game choices were changed.

## Required changes

### R1 — Discover and refresh the actual observed native Game Info class

Direct runtime inspection established these facts; do not repeat the old
assumption that a plain exported render method is available:

1. The actual Game Info class is currently named `k` (do NOT hardcode this
   minified name). Its complete class source contains both
   `BIsModOrShortcut` and `GetDescriptions`.
2. Its `prototype.render` is a MobX wrapper:

   ```text
   function(){return Object.defineProperty(this,"render",{configurable:!1,writable:!1,value:(0,i.Pe)()?n:b.call(this,n)}),this.render()}
   ```

   Therefore `String(candidate.prototype.render)` does not contain the
   current fingerprint. Checking the complete class source as a supported
   fallback recognizes the real class in the DOM fiber.
3. A live `DFL.findModuleChild` search returned no candidate with either
   the old predicate or the corrected class-source predicate, including
   a search that handled direct function exports and namespace properties.
   Do not gate revision subscription or DOM capture on finding this class
   through module exports. The native class is accessible from the actual
   mounted Game Info fiber.
4. Both componentDidMount and componentWillUnmount exist on the real class;
   they are observer wrappers. It is at fiber depth 9 above the compatibility
   heading in the rich view and depth 2 above the fallback paragraph in the
   placeholder view. Its props.overview.appid is the native shortcut ID.

The actual native renderer sources are recorded in
`/tmp/Decky-Metadata/resumed-native-gameinfo-renderers.json`.
Read this evidence before changing discovery.

Correct discovery/registration so:

- The real wrapped class is accepted without broadening to unrelated native
  components. Retain the React-class and semantic-source checks.
- Revision subscription and mounted-instance capture work even when the
  class is not exposed by the module finder.
- Discovery can occur after startup and can recover a currently mounted
  placeholder; do not require a compatibility heading that is absent in
  the failed state. Reuse the shared real Big Picture document bridge.
- Any DOM/fiber inspection remains bounded and traverses only explicit React
  fiber links / DOM nodes, never arbitrary props or MobX app stores. Avoid
  repeated source-string work by caching classification if a broader
  bounded capture is needed.
- Install/uninstall native instance lifecycle tracking as appropriate once
  the real class is discovered, and clean up callbacks and captured instances.
- Preserve the existing scoped render protection, native filter publication,
  64-bit launch truth, and already-verified controller focus behavior.

Do not change the category policy, add another timing workaround, restore
the old module-only gate, or assume a test class's plain prototype.render
matches the live observer-wrapped implementation.

### Verification and handoff

Add a behavioral regression where the renderer is not returned by the
module finder, its prototype.render is observer-wrapped, and an already
mounted real-document fixture must update through the normal compatibility
revision path. Assert the changed rendered category/content, not merely
that a callback or predicate was called.

Run the local gate and prepare the full ZIP. Main retains device ownership
and will repeat the actual mounted Game Info, unchanged exception,
pre-mounted reload, and native collection checks on that candidate. Do not
make concurrent device calls or merge the branch.

Commit this focused correction, record local evidence and package version,
mark the local round complete, and exit. Main will fold this correction
back into the organized implementation commit after validation; do not
rewrite history yourself. No push, release, or main promotion is authorized.

STATUS: CHANGES_REQUESTED
