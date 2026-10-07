import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { nativeReleaseDate } from "./releaseDate";

const dates = ["2024-03-10", "2024-03-11", "2024-11-03", "2024-11-04"];

describe("native calendar projection", () => {
  for (const zone of ["UTC", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Etc/GMT+12", "Pacific/Kiritimati"]) {
    it(`represents the exact calendar day at local midnight in ${zone}`, () => {
      const probe = spawnSync(process.execPath, ["-e", `
        const ts = require("typescript");
        const fs = require("fs");
        require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
        const { nativeReleaseDate } = require(require("path").resolve("src/steam/releaseDate.ts"));
        process.stdout.write(JSON.stringify(${JSON.stringify(dates)}.map(value => {
          const epoch = nativeReleaseDate(value);
          const day = new Date(epoch * 1000);
          return [typeof epoch, day.getFullYear(), day.getMonth() + 1, day.getDate(), day.getHours()];
        })));
      `], { cwd: fileURLToPath(new URL("../..", import.meta.url)), env: { ...process.env, TZ: zone }, encoding: "utf8" });
      expect(probe.status, probe.stderr).toBe(0);
      expect(JSON.parse(probe.stdout)).toEqual([
        ["number", 2024, 3, 10, 0], ["number", 2024, 3, 11, 0],
        ["number", 2024, 11, 3, 0], ["number", 2024, 11, 4, 0],
      ]);
    });
  }
  it("keeps explicit absence distinct from native fallback and rejects invalid dates", () => {
    expect(nativeReleaseDate(null)).toBe(0);
    expect(nativeReleaseDate(undefined)).toBeUndefined();
    for (const value of ["", "2024", "2024-02-30", "2023-02-29", "0000-01-01", "2024-03-10T00:00:00Z"]) {
      expect(nativeReleaseDate(value)).toBeUndefined();
    }
  });
});
