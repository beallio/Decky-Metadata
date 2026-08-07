# Review — controller-search-isolation (round 02)

Branch: `feat/controller-search-isolation`
Reviewed against: `docs/plans/2026-08-07_controller-search-isolation.md`

## Verdict

Round 01 findings 2 and 3 are resolved well. `setDisplayedContext` sets both
`m_appId` and `m_lastValidAppId` inside `query()` with the comment explaining why
`QueryConfigsForApp` does not, the whole sequence is wrapped in `try/finally` that
restores the captured originals, every snapshot reports its `activeStoreAppid`, and
the smoke asserts each phase's context appid against the phase it claims to measure.
The session log now states the transport failure with a timestamp and names Tasks 1
and 6 as unmet instead of hand-waving them.

Finding 1 was fixed at the two lines it named — and the same defect was reintroduced
three lines away, which now makes the smoke unrunnable. One blocking change.

## Gate status

Re-run by the orchestrator on `80f990c`:

- `scripts/orchestration/run-quality-gates` → `quality-gates: OK` (201 tests).
- `bash -n`, `node --check`, and byte-compile of the embedded Python all pass —
  which is exactly why none of them caught the defect below.
- Deck still unreachable from an unsandboxed shell as of 12:05 PDT:
  `ssh: connect to host 10.168.168.20 port 22: No route to host`. Tasks 1 and 6
  remain correctly open.

## Required changes

### 1. `second["displayed_appid"]` / `third["displayed_appid"]` do not exist

The probe returns those phases as:

```js
second: { displayedAppid: secondDisplayedAppid, ... },
third:  { displayedAppid: thirdDisplayedAppid,  ... },
```

camelCase, matching every other key it emits. The three new context assertions read
`displayed_appid`:

```python
if after_second["activeStoreAppid"] != second["displayed_appid"]:
if after_third["activeStoreAppid"]  != third["displayed_appid"]:
if after_return["activeStoreAppid"] != second["displayed_appid"]:
```

Unlike the round-01 defect these are not short-circuited, so they raise
unconditionally. The smoke cannot pass on any input.

Measured, not inferred. I extracted the assertion block to a scratch file and fed it
a fixture built from the probe's real `JSON.stringify({...})` shape, with every count
set to a passing value:

```text
EXIT: 1
STDOUT: OK: listed Community shortcut=3 source=3; ...
        OK: delisted Community shortcut=3 source=3; ...
        OK: never-on-Steam native query only; ...
LAST_STDERR: KeyError: 'displayed_appid'
```

Same fixture, same block, with only `["displayed_appid"]` → `["displayedAppid"]`:

```text
EXIT: 0
LAST_STDERR: (none)
```

Change the three occurrences to `displayedAppid`, then re-run that check and record
both the failing and passing output.

Note why this got through: the scratch fixture recorded in the session log was
written as `{"second":{"displayed_appid":123}}` — built to match the assertion rather
than the producer, so it validated the typo instead of catching it. When a check
consumes another component's output, build the fixture from that component's actual
output shape.

### 2. Make a missing key fail loudly instead of raising

Every assertion in this block indexes dicts directly, so any future key drift
produces a traceback rather than one of the `FAIL:` lines the smoke is built around,
and the operator cannot tell a regression from a broken probe. Add a small helper
used by the new assertions, e.g.

```python
def field(obj, key, label):
    if key not in obj:
        raise SystemExit(f"FAIL: probe payload missing {label}.{key}")
    return obj[key]
```

and route the `isolation` / phase lookups through it. Prove it: run the block against
a fixture with `activeStoreAppid` removed and confirm it prints the `FAIL:` line and
exits non-zero rather than raising `KeyError`.

### 3. Tasks 1 and 6 stay open

Unchanged from round 01 — the Deck is still off the network. Do not attempt the
device run; leave the session log's statement of the gap as it is, appending only the
new scratch-check output from changes 1 and 2. The orchestrator runs the device
sequence when the Deck returns.

After 1–3: `scripts/orchestration/run-quality-gates`, commit, commit this review note,
re-mark the round complete.

STATUS: CHANGES_REQUESTED
