# Compatibility Badge Cache Refresh

## Problem Definition

Non-Steam compatibility badges can be absent after plugin startup even when saved metadata contains a positive compatibility category. The Library card patch reads `metadataCache` during Steam's card render. If that render happens before the asynchronous cache load completes, the patch inserts no badge element. Cache loading updates the overview but does not make the cached card render again. Selecting the game causes Steam to render that card again, which makes the badge appear.

## Objective

Make Home carousel and Library grid compatibility badges react to metadata changes without MobX store walks or user navigation.

## Scope

In scope:

- A compatibility revision notification after cache and compatibility mutations.
- A small subscribed badge component for eligible native non-Steam cards.
- Home and Library grid regression coverage for empty-cache-first rendering.
- Static, unit, build, and live Steam Deck verification.

Out of scope:

- Compatibility metadata discovery or Valve API behavior.
- Official Steam-game badges.
- Changes to Game Info metadata presentation.
- New dependencies.

## Architecture Overview

1. Add a compatibility revision publisher and subscriber set beside `metadataState` in `src/steam/core.ts`.
2. Publish one revision after a complete metadata cache refresh, after asynchronous per-app metadata writes, and from the existing manual compatibility surface refresh.
3. In `libraryCompatibilityIndicators.tsx`, always mount an owned subscribed badge slot for an exact native non-Steam shortcut. The slot renders Steam's native indicator only when the current cache resolves to category 1, 2, or 3.
4. Use a React state/effect subscription so only mounted badge slots render when the revision changes while remaining compatible with Steam's React runtime.
5. Let each badge slot remove its own revision listener during normal React effect cleanup.

The exact rendered App ID, native shortcut identity, and positive-category checks remain fail-closed.

## Public Interfaces and Data Shapes

Internal exports from `src/steam/core.ts`:

- `compatibilityRevisionSnapshot(): number`
- `subscribeCompatibilityRevision(listener: () => void): () => void`
- `notifyCompatibilityRevision(): number`

No backend RPC, persisted metadata, manifest, or user-facing interface changes.

## Dependency Requirements

No new package is required. The implementation uses the existing React runtime and TypeScript toolchain.

## Validation Strategy

### Automated

- Add a Home regression that renders an eligible card with an empty metadata cache, confirms the owned slot exists but renders no icon, then supplies metadata and confirms the same slot renders Steam's native icon.
- Add the equivalent Library grid regression.
- Confirm official games, mismatched App IDs, explicit Unknown, and unresolved Automatic remain unbadged.
- Confirm cache refresh emits one revision after all metadata is applied and unmounted slots remove their listeners.
- Run the project quality gate: TypeScript, Rollup build, Vitest, Python byte-compile, and pytest.

### Steam Deck

- Deploy through `scripts/deck/deploy.sh`.
- Start from a freshly loaded plugin/library surface so cards can render before metadata cache completion.
- Confirm every non-Steam game with a positive defined compatibility category displays its badge without selecting each game.
- Confirm Home and Library grid surfaces, route changes, and plugin reload retain correct badges.
- Run `scripts/deck/verify/run_all.sh` and `scripts/decky verify-change dev --explain`.

## Git Strategy

Work on `fix/compatibility-badge-cache-refresh` from the current `dev` state. Commit the tested fix, regenerated `dist/index.js`, plan, and session record with a Conventional Commit message.
