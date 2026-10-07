import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeReleaseDate } from "./metadataForm";

const dates = ["2024-03-10", "2024-03-11", "2024-11-03", "2024-11-04"];
const zones = ["UTC", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Etc/GMT+12", "Pacific/Kiritimati"];

describe("date-only metadata", () => {
  for (const zone of zones) {
    it(`preserves calendar strings in ${zone}`, () => {
      const probe = spawnSync(process.execPath, ["-e", `
        const ts = require("typescript");
        const fs = require("fs");
        require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
        const helpers = require(require("path").resolve("src/metadataForm.ts"));
        process.stdout.write(JSON.stringify(${JSON.stringify(dates)}.map(helpers.normalizeReleaseDate)));
      `], { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, TZ: zone }, encoding: "utf8" });
      expect(probe.status, probe.stderr).toBe(0);
      expect(JSON.parse(probe.stdout)).toEqual(dates);
    });
  }
  it("rejects incomplete and rollover input and supports clearing", () => {
    for (const input of ["", "2024-02-30", "2023-02-29", "2024-13-01", "2024-03", "soon", "0000-01-01"]) {
      expect(normalizeReleaseDate(input)).toBeNull();
    }
    expect(normalizeReleaseDate("2024-02-29")).toBe("2024-02-29");
    expect(normalizeReleaseDate(" 2024-03-10 ")).toBe("2024-03-10");
    expect(normalizeReleaseDate("0001-01-01")).toBe("0001-01-01");
  });
});

