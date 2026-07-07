from __future__ import annotations

import subprocess
import textwrap


def test_activity_refresh_gate_debounces_attempts_in_flight_and_fresh_news() -> None:
    script = textwrap.dedent(
        """
        import assert from "node:assert/strict";
        import {
          ACTIVITY_REFRESH_INTERVAL_MS,
          createActivityRefreshGate,
        } from "./src/steam/activityRefreshGate.ts";

        const gate = createActivityRefreshGate(1000);

        assert.equal(ACTIVITY_REFRESH_INTERVAL_MS, 15 * 60 * 1000);
        assert.equal(gate.shouldAttempt(101, 5000), true);

        gate.markAttempt(101, 5000);
        assert.equal(gate.shouldAttempt(101, 5500), false);
        gate.markSettled(101);
        assert.equal(gate.shouldAttempt(101, 5500), false);
        assert.equal(gate.shouldAttempt(101, 6000), true);

        gate.markAttempt(101, 6000);
        assert.equal(gate.shouldAttempt(101, 8000), false);
        gate.markSettled(101);
        assert.equal(gate.shouldAttempt(101, 8000), true);

        assert.equal(gate.shouldAttempt(202, 10_000, 10), false);
        assert.equal(gate.shouldAttempt(203, 10_000, 0), true);
        assert.equal(gate.shouldAttempt(204, 10_000), true);
        assert.equal(gate.shouldAttempt(205, 10_000, 8), true);
        assert.equal(gate.shouldAttempt(0, 10_000), false);
        """
    )

    subprocess.run(["node", "--input-type=module", "-e", script], check=True)
