import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dateToEpoch, epochToDate } from "./metadataForm";

const dates = ["2024-03-10", "2024-03-11", "2024-11-03", "2024-11-04"];
const zones: Record<string, number[]> = {
  UTC: [1710028800, 1710115200, 1730592000, 1730678400],
  "America/New_York": [1710046800, 1710129600, 1730606400, 1730696400],
  "America/Los_Angeles": [1710057600, 1710140400, 1730617200, 1730707200],
  "Asia/Tokyo": [1709996400, 1710082800, 1730559600, 1730646000],
};

describe("local calendar dates", () => {
  for (const [zone, epochs] of Object.entries(zones)) {
    it(`round-trips independent calendar days in ${zone}`, () => {
      const probe = spawnSync(process.execPath, ["-e", `
        const ts = require("typescript");
        const fs = require("fs");
        require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
        const helpers = require(require("path").resolve("src/metadataForm.ts"));
        const epochs = ${JSON.stringify(epochs)};
        const inputs = ${JSON.stringify(dates)};
        process.stdout.write(JSON.stringify({ epochs: inputs.map(helpers.dateToEpoch), dates: epochs.map(helpers.epochToDate), components: inputs.map(value => { const d = new Date(helpers.dateToEpoch(value) * 1000); return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours()]; }) }));
      `], { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, TZ: zone }, encoding: "utf8" });
      expect(probe.status, probe.stderr).toBe(0);
      expect(JSON.parse(probe.stdout)).toEqual({ epochs, dates, components: [[2024, 3, 10, 0], [2024, 3, 11, 0], [2024, 11, 3, 0], [2024, 11, 4, 0]] });
    });
  }
  it("rejects incomplete and rollover input and supports clearing", () => {
    for (const input of ["", "2024-02-30", "2023-02-29", "2024-13-01", "2024-03", "soon"]) expect(dateToEpoch(input)).toBeNull();
    expect(epochToDate(null)).toBe("");
  });
});
