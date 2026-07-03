# 2026-07-03 - Decky Toast Styling

## Task

Implemented `docs/plans/2026-07-03_decky-toast-styling.md` to replace flat Decky
Metadata toast calls with SDH-Ludusavi-style presentation metadata.

## Problem

`src/components.tsx` used 16 direct `toaster.toast` calls with the same
`Decky Metadata` title, no icon, and no duration. This made success, warning,
and error paths visually indistinct.

## Design

Added `src/toast.tsx` as a small local helper that mirrors the SDH-Ludusavi toast
shape: `title`, `body`, `duration`, and `logo`. The helper keeps `Decky Metadata`
as the brand prefix and adds an event-specific heading.

Toast mapping:

- success: `FaCheckCircle` with `colors.success`
- warning: `FaExclamationTriangle` with `colors.warning`
- error: `FaExclamationTriangle` with `colors.error`

All 16 call sites in `src/components.tsx` now use `toastSuccess`,
`toastWarn`, or `toastError`. The activity completion toast preserves the
dynamic `activityCompleteMessage(progress)` body.

## Validation

The frontend has no TypeScript test runner in this repo, so validation is by
type-check, rollup build, the project orchestration quality gate, and grep scope
checks from the plan.
