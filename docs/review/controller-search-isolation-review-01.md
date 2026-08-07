# Review — controller-search-isolation (round 01)

Branch: `feat/controller-search-isolation`
Reviewed against: `docs/plans/2026-08-07_controller-search-isolation.md`

## Verdict

The source change is correct and matches the plan. `filterControllerSearchConfigs`
takes a `ControllerSearchContext` and branches on page type; the shortcut branch is
an allowlist of `displayedAppid` + `matchedSourceAppid`; the native/unknown branch
strips shortcut-namespace records and injected sources other than the displayed
app; the early return is gone; `resolveControllerLayoutContext` now requires a
shortcut-namespace appid; `activeDisplayedShortcutAppid` / `activeMatchedSourceAppid`
and the relinquish-on-native-visit deletion are removed; the `GetAllConfigs` wrapper
resolves identity from the call-time store, preferring `this`. `src/types.ts` carries
the two new boundary fields without making them install-time requirements. Round 2's
`resolveStoreForContext` and the indentation repair both landed as asked.

Two blocking defects, both in the on-device verification path — the half of the plan
that has never executed. Neither can be caught by the static gates, and both would
make the device gate report the wrong thing, so they must be fixed before Task 6 is
attempted.

## Gate status

Re-run by the orchestrator on `7921222`, not taken from the session log:

- `scripts/orchestration/run-quality-gates` → `quality-gates: OK`
  (17 frontend test files, 201 tests, backend compile + pytest, drift guard).
- `./run.sh npm run build` leaves the tree clean, so the committed `dist/index.js`
  is the fixed bundle — the `git show dev:dist/index.js` copy used for the aborted
  baseline attempt did not get committed.
- `bash -n scripts/deck/verify/smoke_controller_layouts.sh` → OK.
- `node --check scripts/deck/js/check_controller_layouts.js` → OK.
- The smoke's embedded Python block byte-compiles.

Mutation evidence in the session log is accepted: 10 named tests go red with the
shortcut branch neutered, green after restoring.

**Device verification: not performed.** Round 1 failed on the sandbox's SSH
(`Bad owner or permissions on /etc/ssh/ssh_config.d/20-systemd-ssh-proxy.conf`);
round 2 failed on `ssh: connect to host 10.168.168.20 port 22: No route to host`.
The second one is real — the orchestrator gets the identical error from an
unsandboxed shell, so the Deck is off the network, not blocked by tooling. That is
not a defect in this work, and the note below does not ask you to fix it.

## Required changes

### 1. `smoke_controller_layouts.sh` reads `hasResults` flags off the wrong object

The probe puts `secondDisplayedHasResults` / `secondSourceHasResults` on
`isolation.afterSecond`, and only `thirdDisplayedHasResults` on `afterThird`. The
new assertions read them from `after_third`:

```python
if after_return["secondDisplayedCount"] <= 0 and after_third["secondDisplayedHasResults"]:
if after_return["secondSourceCount"] <= 0 and after_third["secondSourceHasResults"]:
```

Python's `and` short-circuits, so this only evaluates the missing key when the count
is `0` — i.e. exactly in the regression case these lines exist to report. Instead of
`FAIL: active second displayed shortcut is missing from controller Search`, a real
regression would surface as `KeyError: 'secondDisplayedHasResults'`.

Read both flags from `after_second`. Then prove the corrected line can fire: with the
smoke's Python block extracted to a scratch file under `/tmp/Decky-Metadata`, feed it
a JSON fixture whose `afterReturn.secondDisplayedCount` is `0` and whose
`afterSecond.secondDisplayedHasResults` is `true`, and confirm it prints the intended
`FAIL:` line rather than a traceback. Record that output.

### 2. The probe never establishes the store appid the new filter reads

This is the important one. `GetAllConfigs` now derives its identity from
`store.m_appId` / `m_lastValidAppId`. The probe never sets either: it drives the
store directly through

```js
controllerConfiguratorStore.QueryConfigsForApp(appid, controllerIndex)
```

and Steam's own implementation is

```js
QueryConfigsForApp(e,t){this.m_bConfigQueryInFlight=!0,this.m_mapAppConfigs.set(e,[]),SteamClient.Input.QueryControllerConfigsForApp(e,t,this.m_bFilterOtherControllerTypes)}
```

— no `m_appId` assignment. `m_appId` is set by the configurator UI when it opens,
which the probe never does. Under the old code this did not matter, because the
`read(appid)` getter calls set the shared active state as a side effect; that side
effect is precisely what this change removed.

So every `searchSnapshot()` in the probe is filtered against whatever app the UI last
opened (or `undefined`). `afterNative` and `afterReturn` would be measuring the wrong
page, and the smoke could pass or fail for reasons unrelated to the fix.

Make each phase set the store's appid before its snapshot, emulating what the
configurator does on open — capture `m_appId` and `m_lastValidAppId` at probe start,
assign both for each phase (first shortcut, second shortcut, third shortcut, native,
return-to-second), and restore the captured values before returning. Comment why the
assignment is there, referencing that `QueryConfigsForApp` does not set it.

Then make the phase identity observable: report the `m_appId` in effect for each
snapshot in the returned JSON, and have the smoke assert it equals the appid that
phase is supposed to be showing. A phase whose reported appid does not match its
target must fail, so a future refactor that moves identity elsewhere cannot silently
neuter this gate.

### 3. Do not claim the device gate

Leave Task 6 open. In the session log, replace the "could not be completed in this
environment" wording with the specific transport failure and its timestamp, and state
plainly that the plan's Verification steps 1 and 5 — the pre-change baseline failure
and the post-fix negative control — are still unmet. The orchestrator will schedule
the device run when the Deck is back on the network; the branch is not merging to
`dev` before then, per AGENTS.md §6.

After 1–3: run `scripts/orchestration/run-quality-gates`, commit, commit this review
note, and re-mark the round complete.

STATUS: CHANGES_REQUESTED
