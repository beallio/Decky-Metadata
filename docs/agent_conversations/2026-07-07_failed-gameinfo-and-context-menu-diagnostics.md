# Session Log: Failed GameInfo and Context Menu Diagnostics

## Evidence from Failed Build
- **Installed failing build version:** `0.1.0+d055c61`
- `"reentry shield armed"` appeared for `3015223078` on the return path.
- `"bypass truth window hit"` did **not** appear for the failing return.
- **Conclusion:** The prior quick-link shield hypothesis is therefore falsified as written.

## HLTB Comparison (Context Menu)
- **HLTB approach:** Relies on owner `pendingProps.overview.appid`.
- **Our previous approach:** Our broader child-tree fallback could erroneously make a submenu eligible.

## Planned Actions
- Add focused diagnostics at actual Steam render and metadata decision boundaries for the GameInfo issue.
- Tighten context-menu eligibility to require a positive owner app id from `_owner.pendingProps.overview.appid` to prevent submenus like Manage from becoming eligible, while keeping existing cleanup.
