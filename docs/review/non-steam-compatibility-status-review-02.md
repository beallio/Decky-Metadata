# Review — non-steam-compatibility-status (round 02)

Branch: `feat/non-steam-compatibility-status`
Reviewed against: `docs/plans/2026-08-28_non-steam-compatibility-status.md`

## Verdict

Round 01's code findings are resolved. Exact native App-ID lookup now prevents
matched-ID alias leakage, the selector waits for authoritative metadata, and
the refresh path has focused local coverage without an unused event. The branch
remains unready only because the plan's required Steam Deck verification cannot
run while the configured Deck is offline.

## Gate status

- Reviewed commit: `e7e5f3a010e1117c70f0f9d3e5c64ab763ae8fbb`.
- `./run.sh scripts/orchestration/run-quality-gates` passed during round-02
  review: 23 frontend files and 317 frontend tests passed, the complete backend
  pytest suite passed, and build/typecheck passed.
- The working tree was clean and no review note was deleted.
- `./run.sh scripts/decky doctor --deck` still reports
  `deck-reachability: Optional Deck is offline`. The implementer also recorded
  `ssh: connect to host 10.168.168.20 port 22: No route to host` when the device
  dispatcher reached deployment.

## Required changes

1. When the configured Steam Deck is reachable, run:

   ```bash
   ./run.sh scripts/decky doctor --deck
   ./run.sh scripts/decky verify-change dev --device --explain
   ```

   Do not add `--allow-launch`.

2. Complete every live acceptance check from the plan with the actual matched
   non-Steam shortcut: non-duplicated context-menu entries, alternating App-ID
   isolation, official-game exclusion, modal initial focus and D-pad order,
   Automatic plus all four explicit statuses on the poster and Game Info,
   immediate mounted-Game-Info refresh, retained enriched details,
   Automatic/removal/dismount restoration, and applicable no-launch smokes.

3. Store screenshots and focused JSON evidence below `/tmp/Decky-Metadata` and
   append exact commands, results, and evidence paths to the session log. If a
   live check exposes a defect, fix it with a regression test and rerun the full
   quality gate. Do not mark the round complete until the live checks pass.

STATUS: CHANGES_REQUESTED
