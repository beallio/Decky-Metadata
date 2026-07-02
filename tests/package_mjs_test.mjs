import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
);
const zipPath = path.join(
  repoRoot,
  `Decky-Metadata_${packageJson.version}_Installer.zip`,
);
const stagingRoot = path.join(repoRoot, "build-package");

afterEach(() => {
  fs.rmSync(zipPath, { force: true });
  fs.rmSync(stagingRoot, { recursive: true, force: true });
});

test("package script creates a Decky installer zip with the expected payload", () => {
  fs.rmSync(zipPath, { force: true });
  fs.rmSync(stagingRoot, { recursive: true, force: true });

  const result = spawnSync(process.execPath, ["scripts/package.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Decky-Metadata_.*_Installer\.zip/);
  assert.ok(fs.existsSync(zipPath), "installer zip should exist");

  const entries = zipEntries(zipPath);
  assert.deepEqual(
    [
      "Decky Metadata/main.py",
      "Decky Metadata/package.json",
      "Decky Metadata/plugin.json",
      "Decky Metadata/LICENSE",
      "Decky Metadata/NOTICE",
      "Decky Metadata/dist/index.js",
    ].filter((entry) => !entries.has(entry)),
    [],
  );
  assert.equal(
    [...entries].some((entry) => entry.includes("\\")),
    false,
    "archive paths should use forward slashes",
  );
});

test("package script exits clearly when the frontend bundle is missing", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "decky-package-test-"));
  try {
    fs.mkdirSync(path.join(tempRoot, "scripts"));
    fs.copyFileSync(
      path.join(repoRoot, "scripts", "package.mjs"),
      path.join(tempRoot, "scripts", "package.mjs"),
    );

    for (const name of ["main.py", "package.json", "plugin.json", "LICENSE"]) {
      fs.copyFileSync(path.join(repoRoot, name), path.join(tempRoot, name));
    }

    const result = spawnSync(process.execPath, ["scripts/package.mjs"], {
      cwd: tempRoot,
      encoding: "utf8",
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /npm run build/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

function zipEntries(archivePath) {
  const buffer = fs.readFileSync(archivePath);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Set();

  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const fileNameStart = offset + 46;
    entries.add(
      buffer.toString("utf8", fileNameStart, fileNameStart + fileNameLength),
    );
    offset = fileNameStart + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("ZIP end of central directory not found");
}
