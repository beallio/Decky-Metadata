# Review — steamgriddb-artwork-compatibility (round 08)

Branch: `feat/steamgriddb-artwork-compatibility`
Reviewed against: `docs/plans/2026-08-27_steamgriddb-artwork-compatibility.md`

## Verdict

Desktop Library Home is now open and the user-visible icon remains fixed, but
the new Desktop probe assumes exactly one matching DOM row. Steam virtualizes
and duplicates the same app across Library grids, so the correct hashed label
currently maps to multiple nested containers and the smoke falsely reports the
row missing.

## Gate status

- Reviewed commit: `7fba55e9719590e4354a8e24ab808dfed8bab641`.
- Desktop Home is authoritative and selected; label hash `7836ed13` matches the
  affected shortcut without storing its title.
- Live bounded DOM census found 21 matching nested elements collapsing to four
  distinct visible grid cells: two complete `600x900` capsule images and two
  complete `32x32` sidebar icon images.
- The existing exact-one reduction reports `rowCount=5`, `rowFound=false`,
  despite the visible, complete custom sidebar icon. This is a verifier
  structural false negative, not a production regression.

## Required changes

1. Build candidates from the nearest visible `[role=gridcell]` ancestor of each
   hashed-label match and deduplicate by element identity. Do not require an
   exact total grid-cell count.
2. Classify and require at least one complete, positive-size, custom/data
   **icon-like square** candidate from those cells (bounded sidebar dimensions,
   distinct from the portrait capsules). Keep larger capsule candidates as
   diagnostics. Return only counts, booleans, dimensions, and hashes—never
   labels, URLs, paths, or image data.
3. Add executable fixtures where nested/duplicate labels with two sidebar clones
   pass; only large portrait capsules fail; missing/blank/noncustom icon-like
   images fail; wrong hashes and noncurrent Home still fail. Mutating back to
   exact-one must fail the duplicate fixture.
4. Rerun the standalone smoke on the currently open Desktop Library Home,
   require passed identity/file/sidebar evidence, close the tunnel, and update
   the session record. Run focused tests, syntax/mutation checks, and full gates;
   no production deployment or launch is required.

STATUS: CHANGES_REQUESTED
