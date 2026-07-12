# Review — restore-community-fallback-pipeline (round 02)

Branch: `feat/restore-community-fallback-pipeline`
Reviewed against: `docs/plans/2026-07-11_restore-community-fallback-pipeline.md`
Reviewed commit: `2110fe9` (impl) — on-device verification now performed.

## Verdict

**CHANGES_REQUESTED** — on-device verification ran (Deck restored) and the
synthetic-ID published-file shield **fails on-device**. Two distinct defects,
one blocking. Everything else verified green on-device (deploy, quality gates,
quick-links smoke, re-render smoke: 0 cache writes).

## Defect 1 (BLOCKING) — the synthetic-detail shield does not install at load

Evidence:
- Deployed bundle md5 matches the local build and contains the shield code
  (`synthetic detail shields`, `community detail shields skipped`, the
  `published.?file` regex all present in
  `/home/deck/homebrew/plugins/Decky-Metadata/dist/index.js`).
- After the hard reload at 09:51:16 the device log shows the pre-existing
  `[decky:community] feed patch install httpClientFound='True'` line but **no**
  `synthetic detail shields` line. That `frontendLog` is unconditional at the
  end of the shield `try`, so its absence proves the block threw at init.
- `src/log.ts` `warn()` is `console.warn` only (no device-log routing), so the
  `catch (error) { log.warn("patch", "community detail shields skipped", …) }`
  path leaves **no device-log trace** — exactly what we observe.

Net effect: synthetic `90909…` cards are **not** shielded. Opening one can fire
real published-file detail/comment/reaction lookups (the failure class already
seen historically in these logs: `Cannot destructure property 'retrycount'`,
404s).

Why it threw at init but not later: running the *exact* shipped predicate live
via `DFL.findModuleChild` **now** does not throw and matches methods
(`unguardedThrew:false`, `throwingAccesses:0`, `matchCount:15`). So this is an
init-time robustness/timing failure (partial/hostile module state, or
lazily-loaded modules absent at init), not an impossible heuristic.

## Defect 2 (correctness) — discovery is imprecise; likely binds the wrong target

`findModuleChild` returns the **first** child whose predicate matches. On-device
the predicate matches **15 heterogeneous** children, e.g.:
- protobuf `Message` classes: `TA`/`NZ`/`WJ`/`LZ` (`published_file_ids`,
  `publishedfileids`) — NOT fetchers;
- news-event classes: `UV` (videos), `hO` (screenshots);
- React-Query hook fns: `CD`, `EH`, `Kp` — these `Init(…TA)` a published-file
  protobuf and run a `queryFn` (the actual detail/comment/reaction fetchers).

So even when it installs, first-match likely patches a protobuf class or an
unrelated function rather than the real fetch boundary. (Full probe output was
captured by the orchestrator via `DFL.findModuleChild` on-device.)

## Required changes

1. **Make discovery non-throwing.** Inside the `findModuleChild` predicate wrap
   every `module[key]` access and `Function.prototype.toString.call(...)` in
   try/catch so a single hostile child/getter cannot abort the scan (the guarded
   version scanned cleanly on-device).
2. **Always log the outcome via `frontendLog`, not console-only.** On both
   success and failure, `frontendLog("community", …)` the discovered method
   names + owning module id (and the caught error text on failure). On-device
   verification depends on this line existing; today it is invisible.
3. **Narrow the target.** Do not shield the first arbitrary match. Restrict to
   the query-hook fetchers (functions whose source `Init`s a published-file
   protobuf AND references detail/comment/reaction), and exclude protobuf
   `Message`/news-event classes. Confirm the bound names on-device via the new
   log line.
4. **Handle init timing.** Modules for published-file details load lazily.
   Either install the shield idempotently on first community-fallback render as
   well as at init, or retry discovery, so a load-time miss self-heals.
5. **Add a targeted regression** asserting the discovery predicate excludes
   protobuf `Message` classes and selects only fetcher-shaped functions, so
   first-match imprecision is caught statically.

## Re-verification (orchestrator, next round)

After the fix I will redeploy and confirm on-device that: (a) the shield log
line reports non-empty, correctly-scoped bound method names; (b) opening a
synthetic Wolverine (`3156562597`) card triggers no failing published-file
lookup; (c) the fallback images (ignimgs.com) render and page 2 is empty for the
≤20-shot record. No game launch will be attempted without explicit authorization.

STATUS: CHANGES_REQUESTED
