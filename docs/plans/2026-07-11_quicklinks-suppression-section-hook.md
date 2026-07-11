# Plan: Reland Quick-Links Suppression via Section-Wrapper Hook (quicklinks-suppression-section-hook)

## Context

**Problem.** `hide-quicklinks-row-nonsteam` (d63263f, merged 2026-07-10) never
worked on-device. Its session log deferred exactly this check: "confirm that
the links section is reachable at the current outer game-detail `renderFunc`
insertion point. If it is not, the plan's nested-`renderFunc` fallback remains
required before approval." On-device verification (2026-07-11, CDP) confirmed
the row is **not** reachable there: never-on-Steam games (Mario Kart 8 Deluxe
`3462906031` et al.) still show the dead Store Page / Community Hub /
Discussions / Guides / Support row.

**Why the outer insertion point can never work.** The mounted content chain is
`pageHost(E) → … → AppDetailsContent(ct) → sectionWrapper(ue) → infoSection(lt)
→ linksRow(N)`. Steam's page host mounts the Game Info content behind several
function-component boundaries whose children are created during *their* render,
so the links element never exists in the route `renderFunc`'s returned tree.
Patching the sections container (`GetSections` class) render doesn't help
either — its output tree (tab structure) is a parallel path, not the mounted
content. Also confirmed: the links row renders **because of** the plugin's
`BIsModOrShortcut` spoof (`N` builds links only `if (!overview.BIsModOrShortcut())`),
so it cannot be data-starved without breaking the rich page.

**Working insertion point (proven live over CDP).** The *section wrapper* class
— the component registering Game Info sections via
`this.props.parent.RegisterSection(this.props.name, el)` — is a **class**
directly above the info-section content in the mounted tree, and its render
output holds the info-section content element (`lt`, props `{overview,
details}`) via `props.children`. Findable by module fingerprint:
class + `prototype.render` source containing `"RegisterSection"`.

## Fix

`src/steam/routerPatches.ts`:

- Remove the dead `suppressNeverOnSteamQuickLinks` tree helper and its call.
- `installNeverOnSteamQuickLinksSuppression(unpatchers)`: afterPatch the
  section wrapper's `prototype.render`; when `props.name === "info"`, find the
  content boundary element (function type, `{overview, details}` props) whose
  appid is never-on-Steam, and swap its `type` for a cached wrapper that calls
  the original and nulls the links element (props signature `{overview,
  details, workshopVisible, marketPresence}`) in its output.
- Traversal walks React elements/arrays through children chains only — it must
  never iterate MobX class instances (overview/details); doing so inside an
  observer render subscribes it to everything and can wedge the renderer
  (observed live during prototyping).
- Wrapper identity is cached per original type so React does not remount the
  subtree on re-renders; suppression is decided per-render from
  `metadataCache` (`isNeverOnSteam`).
- Graceful failure: if the fingerprint or shapes stop matching, nothing is
  suppressed and the native tree is untouched.

`src/steam/install.ts`: install via `safeInstallStep`.

## Validation

1. `./scripts/orchestration-hooks/quality-gates`.
2. On-device: MK8 (never-on-Steam) Game Info shows no quick-links row while
   HLTB/description/developer data stays; Devastation (matched, steam appid
   338930) keeps the full row; launch fix (`nonsteam-launch-incall-truth`)
   still passes its during-shield launch check after the bundle swap.
