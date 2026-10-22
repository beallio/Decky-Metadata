import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BINARY_NAME = "decky-metadata-backend";
const TARGET_TRIPLE = "x86_64-unknown-linux-musl";
const MUSL_CC_ENV = "CC_x86_64_unknown_linux_musl";

export function resolvedTmpDir() {
  const configured = process.env.TMPDIR?.trim();
  const fallback = !configured;
  const candidate = path.resolve(configured || "/var/tmp/omp-1000");
  let exists = true;
  try {
    if (fallback && fs.lstatSync(candidate).isSymbolicLink()) {
      throw new Error(`TMPDIR fallback must not be a symlink: ${candidate}`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    exists = false;
  }
  if (!exists) {
    fs.mkdirSync(candidate, { recursive: true, mode: fallback ? 0o700 : 0o777 });
  }
  if (!fs.statSync(candidate).isDirectory()) {
    throw new Error(`TMPDIR is not a directory: ${candidate}`);
  }
  if (fallback) fs.chmodSync(candidate, 0o700);
  return fs.realpathSync(candidate);
}

function cargoEnvironment(tmpDir) {
  const env = { ...process.env, TMPDIR: tmpDir };
  env.CARGO_HOME ||= path.join(tmpDir, "cargo-home");
  env.CARGO_TARGET_DIR ||= path.join(tmpDir, "cargo-target", "Decky-Metadata");
  env[MUSL_CC_ENV] ||= "musl-gcc";
  fs.mkdirSync(env.CARGO_HOME, { recursive: true });
  fs.mkdirSync(env.CARGO_TARGET_DIR, { recursive: true });
  return env;
}

export function buildBackend(repoRoot) {
  const root = path.resolve(repoRoot);
  const tmpDir = resolvedTmpDir();
  const env = cargoEnvironment(tmpDir);
  const result = spawnSync(
    process.env.CARGO || "cargo",
    [
      "build",
      "--locked",
      "--release",
      "--target",
      TARGET_TRIPLE,
      "--manifest-path",
      path.join(root, "backend-rust", "Cargo.toml"),
      "--bin",
      BINARY_NAME,
      "--message-format=json-render-diagnostics",
    ],
    { cwd: root, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error) throw new Error(`Could not run Cargo: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `Cargo static backend build failed${result.status === null ? "" : ` (exit ${result.status})`}:\n${result.stderr || result.stdout}`,
    );
  }

  const targetDirectory = path.resolve(root, env.CARGO_TARGET_DIR);
  const targetArtifact = path.join(
    targetDirectory,
    TARGET_TRIPLE,
    "release",
    BINARY_NAME,
  );
  const artifacts = [];
  let buildFinished = false;
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (!message || typeof message !== "object") continue;
    if (message.reason === "build-finished") buildFinished = message.success === true;
    if (
      message.reason !== "compiler-artifact" ||
      message.target?.name !== BINARY_NAME ||
      !Array.isArray(message.target.kind) ||
      !message.target.kind.includes("bin") ||
      typeof message.executable !== "string" ||
      !message.executable
    ) {
      continue;
    }
    if (!Array.isArray(message.target.crate_types) || !message.target.crate_types.includes("bin")) {
      throw new Error(`Cargo reported ${BINARY_NAME} without binary crate-type proof`);
    }
    if (message.profile?.test !== false) {
      throw new Error(`Cargo reported ${BINARY_NAME} outside a non-test release build`);
    }
    const artifact = path.resolve(root, message.executable);
    if (artifact !== targetArtifact) {
      throw new Error(
        `Cargo reported ${BINARY_NAME} outside ${TARGET_TRIPLE}/release: ${artifact}`,
      );
    }
    if (
      !Array.isArray(message.filenames) ||
      !message.filenames.some((filename) => path.resolve(root, filename) === artifact)
    ) {
      throw new Error(`Cargo omitted ${BINARY_NAME} from compiler-artifact filenames`);
    }
    artifacts.push(artifact);
  }
  if (!buildFinished) throw new Error("Cargo did not report a successful build completion");
  if (artifacts.length !== 1) {
    throw new Error(
      `Cargo did not report exactly one executable artifact for ${BINARY_NAME} (${TARGET_TRIPLE})`,
    );
  }
  assertStaticX64Executable(artifacts[0]);
  return artifacts[0];
}

export function assertStaticX64Executable(filePath) {
  let stat;
  let bytes;
  try {
    stat = fs.lstatSync(filePath);
    if (!stat.isFile()) throw new Error("artifact is not a regular file");
    if ((stat.mode & 0o111) === 0) throw new Error("artifact is not executable");
    bytes = fs.readFileSync(filePath);
  } catch (error) {
    throw new Error(`Invalid Cargo executable artifact ${filePath}: ${error.message}`);
  }

  if (
    bytes.length < 64 ||
    bytes[0] !== 0x7f ||
    bytes.toString("ascii", 1, 4) !== "ELF" ||
    bytes[4] !== 2 ||
    bytes[5] !== 1 ||
    bytes[6] !== 1 ||
    bytes.readUInt16LE(18) !== 62 ||
    ![2, 3].includes(bytes.readUInt16LE(16)) ||
    bytes.readBigUInt64LE(24) === 0n
  ) {
    throw new Error(`Invalid Cargo executable artifact ${filePath}: expected little-endian x86_64 ELF executable`);
  }

  const programOffset = bytes.readBigUInt64LE(32);
  const programEntrySize = bytes.readUInt16LE(54);
  const programCount = bytes.readUInt16LE(56);
  if (programCount > 0 && programEntrySize < 56) {
    throw new Error(`Invalid Cargo executable artifact ${filePath}: malformed ELF program headers`);
  }
  if (programOffset + BigInt(programEntrySize) * BigInt(programCount) > BigInt(bytes.length)) {
    throw new Error(`Invalid Cargo executable artifact ${filePath}: truncated ELF program headers`);
  }

  for (let index = 0; index < programCount; index += 1) {
    const header = Number(programOffset) + index * programEntrySize;
    const type = bytes.readUInt32LE(header);
    if (type === 3) {
      throw new Error(`Invalid Cargo executable artifact ${filePath}: dynamic interpreter is forbidden`);
    }
    if (type !== 2) continue;

    const dynamicOffset = bytes.readBigUInt64LE(header + 8);
    const dynamicSize = bytes.readBigUInt64LE(header + 32);
    if (dynamicOffset + dynamicSize > BigInt(bytes.length) || dynamicSize % 16n !== 0n) {
      throw new Error(`Invalid Cargo executable artifact ${filePath}: malformed ELF dynamic table`);
    }
    for (let entry = 0n; entry < dynamicSize; entry += 16n) {
      if (bytes.readBigInt64LE(Number(dynamicOffset + entry)) === 1n) {
        throw new Error(`Invalid Cargo executable artifact ${filePath}: dynamic library dependency is forbidden`);
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    console.log(buildBackend(repoRoot));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
