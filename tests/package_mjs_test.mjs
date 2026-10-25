import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = [];
const binaryName = "decky-metadata-backend";
const targetTriple = "x86_64-unknown-linux-musl";

const fakeCargo = `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const targetIndex = args.indexOf("--target");
if (
  !args.includes("--locked") ||
  !args.includes("--release") ||
  targetIndex < 0 || args[targetIndex + 1] !== "${targetTriple}" ||
  !args.includes("--bin") || args[args.indexOf("--bin") + 1] !== "${binaryName}" ||
  !args.includes("--message-format=json-render-diagnostics")
) {
  console.error("unexpected locked Cargo build arguments");
  process.exit(31);
}
const mode = process.env.FAKE_CARGO_MODE || "valid";
if (mode === "cargo-failure") {
  console.error("fake compiler failure");
  process.exit(23);
}
if (mode !== "missing-artifact") {
  const targetDirectory = path.join(
    process.env.CARGO_TARGET_DIR,
    mode === "wrong-target-path" ? "release" : "${targetTriple}/release",
  );
  const artifact = path.join(targetDirectory, "${binaryName}");
  fs.mkdirSync(path.dirname(artifact), { recursive: true });
  let bytes = Buffer.from(process.env.FAKE_ELF_VALID, "base64");
  if (mode === "not-elf") bytes = Buffer.from("not an ELF executable");
  if (mode === "wrong-host") bytes = Buffer.from(process.env.FAKE_ELF_WRONG_HOST, "base64");
  if (mode === "interpreter") bytes = Buffer.from(process.env.FAKE_ELF_INTERPRETER, "base64");
  if (mode === "dynamic-needed") bytes = Buffer.from(process.env.FAKE_ELF_NEEDED, "base64");
  if (mode === "no-entrypoint") bytes = Buffer.from(process.env.FAKE_ELF_NO_ENTRY, "base64");
  fs.writeFileSync(artifact, bytes);
  fs.chmodSync(artifact, mode === "not-executable" ? 0o644 : 0o755);
  const name = mode === "wrong-name" ? "other-binary" : "${binaryName}";
  const kind = mode === "wrong-kind" ? ["example"] : ["bin"];
  const crateTypes = mode === "wrong-crate-type" ? ["example"] : ["bin"];
  const filenames = mode === "missing-filename" ? [] : [artifact];
  console.log(JSON.stringify({
    reason: "compiler-artifact",
    target: { name, kind, crate_types: crateTypes },
    profile: { test: mode === "test-profile" },
    filenames,
    executable: artifact,
  }));
}
console.log(JSON.stringify({
  reason: "build-finished",
  success: mode !== "unsuccessful-build",
}));
`;

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("packages the native allowlist with Unix modes and whole-ZIP identity", () => {
  const fixture = makeFixture();
  const oldZip = Buffer.from("previous usable package\n");
  fs.writeFileSync(fixture.zipPath, oldZip);

  const result = packageFixture(fixture, [
    "--release",
    "--emit-release-metadata",
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const zipBytes = fs.readFileSync(fixture.zipPath);
  assert.notDeepEqual(zipBytes, oldZip);
  const entries = readZip(fixture.zipPath);
  const expected = [
    "Decky-Metadata/main.py",
    "Decky-Metadata/package.json",
    "Decky-Metadata/plugin.json",
    "Decky-Metadata/LICENSE",
    "Decky-Metadata/dist/index.js",
    "Decky-Metadata/bin/backend",
    ...(fs.existsSync(path.join(fixture.repoRoot, "NOTICE"))
      ? ["Decky-Metadata/NOTICE"]
      : []),
    ...(fs.existsSync(path.join(fixture.repoRoot, "dist/index.js.map"))
      ? ["Decky-Metadata/dist/index.js.map"]
      : []),
  ].sort();
  assert.deepEqual([...entries.keys()].sort(), expected);

  const backend = entries.get("Decky-Metadata/bin/backend");
  assert.deepEqual(backend.bytes, validElf);
  assert.equal(backend.mode, 0o100755);
  assert.equal(backend.creatorSystem, 3);
  assert.equal(
    createHash("sha256").update(backend.bytes).digest("hex"),
    createHash("sha256").update(validElf).digest("hex"),
  );
  for (const [name, entry] of entries) {
    assert.equal(entry.creatorSystem, 3, `${name} must be marked as a Unix entry`);
    assert.equal(
      entry.mode,
      name === "Decky-Metadata/bin/backend" ? 0o100755 : 0o100644,
      `${name} has the packaged Unix file mode`,
    );
  }
  assert.deepEqual(
    entries.get("Decky-Metadata/main.py").bytes,
    fs.readFileSync(path.join(sourceRoot, "main.py")),
  );
  assert.deepEqual(
    entries.get("Decky-Metadata/dist/index.js").bytes,
    fs.readFileSync(path.join(fixture.repoRoot, "dist/index.js")),
  );
  assert.equal(
    JSON.parse(entries.get("Decky-Metadata/plugin.json").bytes.toString("utf8")).backend,
    "bin/backend",
  );

  const version = JSON.parse(
    entries.get("Decky-Metadata/package.json").bytes.toString("utf8"),
  ).version;
  assert.equal(
    version,
    JSON.parse(
      fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"),
    ).version,
  );
  const manifestPath = path.join(
    fixture.repoRoot,
    `Decky-Metadata-v${version}.manifest.json`,
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const digest = createHash("sha256").update(zipBytes).digest("hex");
  assert.equal(manifest.pluginName, "Decky Metadata");
  assert.equal(manifest.packageName, "decky-metadata");
  assert.equal(manifest.assetName, "Decky-Metadata.zip");
  assert.equal(manifest.sha256, digest);
  assert.equal(
    fs.readFileSync(
      path.join(fixture.repoRoot, `Decky-Metadata-v${version}.zip.sha256`),
      "utf8",
    ),
    `${digest}  Decky-Metadata.zip\n`,
  );
  assert.equal(
    fs.readdirSync(fixture.cacheRoot).some((name) =>
      name.startsWith("decky-metadata-package-"),
    ),
    false,
    "package staging is removed after writing the archive",
  );
});


test("invalid release version leaves the usable ZIP unchanged", () => {
  const fixture = makeFixture();
  const packaged = packageFixture(fixture);
  assert.equal(packaged.status, 0, packaged.stderr || packaged.stdout);
  const oldZip = fs.readFileSync(fixture.zipPath);

  const result = packageFixture(fixture, [
    "--release",
    "--release-version",
    "0.9.0",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match package\.json version/);
  assert.deepEqual(fs.readFileSync(fixture.zipPath), oldZip);
});

test("missing frontend input fails without replacing the usable ZIP", () => {
  const fixture = makeFixture();
  const packaged = packageFixture(fixture);
  assert.equal(packaged.status, 0, packaged.stderr || packaged.stdout);
  const oldZip = fs.readFileSync(fixture.zipPath);
  fs.rmSync(path.join(fixture.repoRoot, "dist/index.js"));

  const result = packageFixture(fixture);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing dist\/index\.js/);
  assert.deepEqual(fs.readFileSync(fixture.zipPath), oldZip);
});

test("Cargo artifact trust failures preserve a usable ZIP", () => {
  const fixture = makeFixture();
  const packaged = packageFixture(fixture);
  assert.equal(packaged.status, 0, packaged.stderr || packaged.stdout);
  const oldZip = fs.readFileSync(fixture.zipPath);

  for (const mode of [
    "cargo-failure",
    "missing-artifact",
    "wrong-name",
    "wrong-kind",
    "wrong-crate-type",
    "missing-filename",
    "test-profile",
    "wrong-target-path",
    "interpreter",
    "wrong-host",
    "dynamic-needed",
    "not-elf",
    "not-executable",
    "unsuccessful-build",
    "no-entrypoint",
  ]) {
    fixture.env.FAKE_CARGO_MODE = mode;
    const result = packageFixture(fixture);

    assert.notEqual(result.status, 0, `${mode} must reject the Cargo artifact`);
    assert.deepEqual(
      fs.readFileSync(fixture.zipPath),
      oldZip,
      `${mode} must not replace the usable ZIP`,
    );
  }
});

function makeFixture({ cargoMode = "valid" } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "decky-metadata-package-test-"));
  fixtures.push(root);
  const repoRoot = path.join(root, "repo");
  const scripts = path.join(repoRoot, "scripts");
  const cacheRoot = path.join(root, "cache");
  const cargoHome = path.join(cacheRoot, "cargo-home");
  const targetDir = path.join(cacheRoot, "cargo-target");
  const fakeBin = path.join(root, "bin");
  fs.mkdirSync(scripts, { recursive: true });
  fs.mkdirSync(path.join(repoRoot, "dist"), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, "backend-rust"), { recursive: true });
  fs.mkdirSync(cacheRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "backend-rust", "Cargo.toml"), "[package]\n");

  for (const name of ["package.mjs", "build_backend.mjs"]) {
    fs.copyFileSync(
      path.join(sourceRoot, "scripts", name),
      path.join(scripts, name),
    );
  }
  for (const name of ["main.py", "package.json", "plugin.json", "LICENSE"]) {
    fs.copyFileSync(path.join(sourceRoot, name), path.join(repoRoot, name));
  }
  for (const name of ["NOTICE"]) {
    const source = path.join(sourceRoot, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(repoRoot, name));
  }
  fs.copyFileSync(
    path.join(sourceRoot, "dist", "index.js"),
    path.join(repoRoot, "dist", "index.js"),
  );
  const map = path.join(sourceRoot, "dist", "index.js.map");
  if (fs.existsSync(map)) fs.copyFileSync(map, path.join(repoRoot, "dist", "index.js.map"));

  const cargoPath = path.join(fakeBin, "cargo");
  fs.writeFileSync(cargoPath, fakeCargo);
  fs.chmodSync(cargoPath, 0o755);
  const env = {
    ...process.env,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`,
    TMPDIR: cacheRoot,
    CARGO_HOME: cargoHome,
    CARGO_TARGET_DIR: targetDir,
    FAKE_CARGO_MODE: cargoMode,
    FAKE_ELF_VALID: validElf.toString("base64"),
    FAKE_ELF_WRONG_HOST: wrongHostElf.toString("base64"),
    FAKE_ELF_INTERPRETER: interpreterElf.toString("base64"),
    FAKE_ELF_NEEDED: neededElf.toString("base64"),
    FAKE_ELF_NO_ENTRY: noEntryElf.toString("base64"),
  };
  return {
    repoRoot,
    cacheRoot,
    zipPath: path.join(repoRoot, "Decky-Metadata.zip"),
    env,
  };
}

function packageFixture(fixture, args = ["--release"]) {
  return spawnSync(
    process.execPath,
    ["scripts/package.mjs", ...args],
    { cwd: fixture.repoRoot, env: fixture.env, encoding: "utf8" },
  );
}

function readZip(zipPath) {
  const buffer = fs.readFileSync(zipPath);
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  let offset = directoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
    const creatorSystem = buffer.readUInt16LE(offset + 4) >>> 8;
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const mode = buffer.readUInt32LE(offset + 38) >>> 16;
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const name = buffer.toString("utf8", nameStart, nameStart + nameLength);
    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const bytes = compression === 8 ? inflateRawSync(compressed) : Buffer.from(compressed);
    assert.equal(bytes.length, uncompressedSize);
    entries.set(name, { bytes, mode, creatorSystem });
    offset = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("ZIP end of central directory not found");
}

function elf64({
  machine = 62,
  elfType = 3,
  entry = 0x400000n,
  interpreter = false,
  dynamicNeeded = false,
} = {}) {
  const interpreterBytes = interpreter
    ? Buffer.from("/lib64/ld-linux-x86-64.so.2\0")
    : Buffer.alloc(0);
  const hasProgramHeader = interpreter || dynamicNeeded;
  const dynamicBytes = dynamicNeeded ? 32 : 0;
  const header = Buffer.alloc(
    64 + (hasProgramHeader ? 56 : 0) + interpreterBytes.length + dynamicBytes,
  );
  header.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1], 0);
  header.writeUInt16LE(elfType, 16);
  header.writeUInt16LE(machine, 18);
  header.writeUInt32LE(1, 20);
  header.writeBigUInt64LE(64n, 32);
  header.writeBigUInt64LE(BigInt(entry), 24);
  header.writeUInt16LE(64, 52);
  header.writeUInt16LE(56, 54);
  header.writeUInt16LE(hasProgramHeader ? 1 : 0, 56);
  if (interpreter) {
    const offset = 64 + 56;
    header.writeUInt32LE(3, 64);
    header.writeBigUInt64LE(BigInt(offset), 72);
    header.writeBigUInt64LE(BigInt(interpreterBytes.length), 96);
    interpreterBytes.copy(header, offset);
  } else if (dynamicNeeded) {
    header.writeUInt32LE(2, 64);
    header.writeBigUInt64LE(120n, 72);
    header.writeBigUInt64LE(32n, 96);
    header.writeBigInt64LE(1n, 120);
  }
  return header;
}

const validElf = elf64();
const wrongHostElf = elf64({ machine: 183 });
const interpreterElf = elf64({ interpreter: true });
const neededElf = elf64({ dynamicNeeded: true });
const noEntryElf = elf64({ entry: 0n });

