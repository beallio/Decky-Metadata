import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { buildBackend, resolvedTmpDir } from "./build_backend.mjs";

const PLUGIN_FOLDER_NAME = "Decky-Metadata";
const CRC_TABLE = makeCrcTable();

// Mirrors the version grammar the self-updater parses (backend discovery):
// X.Y.Z, optionally -dev.<id> (development channel) and/or +<build> metadata.
const VERSION_RE =
  /^(\d+)\.(\d+)\.(\d+)(?:-dev\.([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/;

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const packageJson = readJson(path.join(repoRoot, "package.json"));
  const pluginJson = readJson(path.join(repoRoot, "plugin.json"));
  validatePackageVersions(packageJson, pluginJson);
  if (pluginJson.backend !== "bin/backend") {
    throw new Error('plugin.json backend must be "bin/backend"');
  }
  const baseVersion = packageJson.version;

  // Explicit version stamp for CI-published releases (stable X.Y.Z or a
  // development X.Y.Z-dev.g<sha>). When absent we fall back to the base version
  // (--release/--no-hash) or a local +<hash> build marker (default).
  const releaseVersionArg = getFlagValue("--release-version");
  const releaseBuild =
    releaseVersionArg !== null ||
    process.argv.includes("--release") ||
    process.argv.includes("--no-hash");

  let version;
  if (releaseVersionArg !== null) {
    version = resolveReleaseVersion(releaseVersionArg, baseVersion);
  } else {
    const gitHash = releaseBuild ? "" : getGitShortHash(repoRoot);
    version = gitHash ? `${baseVersion}+${gitHash}` : baseVersion;
  }
  const releaseOptions = process.argv.includes("--emit-release-metadata")
    ? resolveReleaseMetadataOptions(version)
    : null;
  const bundlePath = path.join(repoRoot, "dist", "index.js");
  if (!fs.existsSync(bundlePath)) {
    throw new Error("Missing dist/index.js. Run npm run build before packaging.");
  }

  // Cargo's named artifact is validated before staging or replacing any ZIP.
  const backendPath = buildBackend(repoRoot);
  const stagingBase = resolvedTmpDir();
  const stagingRoot = fs.mkdtempSync(
    path.join(stagingBase, "decky-metadata-package-"),
  );
  const stagingPlugin = path.join(stagingRoot, PLUGIN_FOLDER_NAME);
  // Keep local packages out of the (Dropbox-synced) checkout; CI sets DECKY_PACKAGE_DIR.
  const outputDir =
    process.env.DECKY_PACKAGE_DIR?.trim() ||
    path.join(
      process.env.DECKY_TMP_ROOT?.trim() || path.join(stagingBase, "Decky-Metadata"),
      "package",
    );
  fs.mkdirSync(outputDir, { recursive: true });
  const zipPath = path.join(outputDir, "Decky-Metadata.zip");
  const zipTempPath = path.join(
    outputDir,
    `.Decky-Metadata.zip.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    fs.mkdirSync(stagingPlugin, { recursive: true });
    assertPathInside(stagingBase, stagingRoot);
    const files = [
      ["main.py", "main.py"],
      ["package.json", "package.json"],
      ["plugin.json", "plugin.json"],
      ["LICENSE", "LICENSE"],
      ["dist/index.js", "dist/index.js"],
    ];
    const optionalFiles = [
      ["NOTICE", "NOTICE"],
      ["dist/index.js.map", "dist/index.js.map"],
    ];

    for (const [sourceRelative, targetRelative] of files) {
      stageFile(repoRoot, stagingPlugin, sourceRelative, targetRelative, version);
    }

    const stagedFiles = [...files];
    for (const [sourceRelative, targetRelative] of optionalFiles) {
      if (fs.existsSync(path.join(repoRoot, sourceRelative))) {
        stageFile(repoRoot, stagingPlugin, sourceRelative, targetRelative, version);
        stagedFiles.push([sourceRelative, targetRelative]);
      }
    }

    const nativePath = path.join(stagingPlugin, "bin", "backend");
    fs.mkdirSync(path.dirname(nativePath), { recursive: true });
    fs.copyFileSync(backendPath, nativePath);
    fs.chmodSync(nativePath, 0o755);

    const entries = [
      ...stagedFiles.map(([, targetRelative]) => ({
        archiveName: `${PLUGIN_FOLDER_NAME}/${targetRelative}`.replaceAll(
          path.sep,
          "/",
        ),
        filePath: path.join(stagingPlugin, targetRelative),
        mode: 0o100644,
      })),
      {
        archiveName: `${PLUGIN_FOLDER_NAME}/bin/backend`,
        filePath: nativePath,
        mode: 0o100755,
      },
    ];

    // Build beside the destination, then atomically replace it only when the
    // complete ZIP is ready. A failed prerequisite never removes the old ZIP.
    writeZip(zipTempPath, entries);
    fs.renameSync(zipTempPath, zipPath);

    console.log(`Packaged version: ${version}`);
    console.log(zipPath);
    if (releaseOptions) {
      emitReleaseMetadata({
        outputDir,
        zipPath,
        version,
        packageJson,
        pluginJson,
        releaseOptions,
      });
    }
  } finally {
    fs.rmSync(zipTempPath, { force: true });
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

// Validate release identity before the build and ZIP replacement.
function resolveReleaseMetadataOptions(version) {
  const tag = getFlagValue("--release-tag") ?? `v${version}`;
  if (`v${version}` !== tag) {
    throw new Error(
      `--release-tag ${tag} must equal v${version} (discovery checks tag === "v" + manifest.version)`,
    );
  }

  let channel = getFlagValue("--channel");
  if (channel === null) channel = version.includes("-dev.") ? "dev" : "stable";
  if (channel !== "stable" && channel !== "dev") {
    throw new Error(`--channel must be "stable" or "dev", got: ${channel}`);
  }
  return { tag, channel };
}

// The checksum is for the complete archive, as required by Decky update discovery.
function emitReleaseMetadata({
  outputDir,
  zipPath,
  version,
  packageJson,
  pluginJson,
  releaseOptions,
}) {
  const { tag, channel } = releaseOptions;
  const assetName = path.basename(zipPath);
  const sha256 = createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");

  const manifest = {
    schemaVersion: 1,
    pluginName: pluginJson.name,
    packageName: packageJson.name,
    version,
    sourceVersion: version,
    tag,
    channel,
    assetName,
    sha256,
    generatedAt: new Date().toISOString(),
  };

  const manifestPath = path.join(outputDir, `${PLUGIN_FOLDER_NAME}-${tag}.manifest.json`);
  const shaPath = path.join(outputDir, `${PLUGIN_FOLDER_NAME}-${tag}.zip.sha256`);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  // `sha256sum -c` format: "<hash>  <filename>"; run from the zip's directory.
  fs.writeFileSync(shaPath, `${sha256}  ${assetName}\n`);

  console.log(`Release channel: ${channel}`);
  console.log(manifestPath);
  console.log(shaPath);
}

function getFlagValue(flag) {
  const argv = process.argv;
  const inline = argv.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) {
    return inline.slice(flag.length + 1);
  }
  const index = argv.indexOf(flag);
  if (index !== -1 && index + 1 < argv.length) {
    return argv[index + 1];
  }
  return null;
}

function resolveReleaseVersion(releaseVersion, baseVersion) {
  const match = VERSION_RE.exec(releaseVersion);
  if (!match) {
    throw new Error(
      `--release-version ${releaseVersion} is not a valid version (X.Y.Z[-dev.<id>][+<build>])`,
    );
  }
  const releaseBase = `${match[1]}.${match[2]}.${match[3]}`;
  if (releaseBase !== baseVersion) {
    throw new Error(
      `--release-version base ${releaseBase} does not match package.json version ${baseVersion}; ` +
        "bump the base with scripts/set_release_version.py first",
    );
  }
  return releaseVersion;
}


function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validatePackageVersions(packageJson, pluginJson) {
  if (!packageJson.version || packageJson.version !== pluginJson.version) {
    throw new Error(
      `package.json version (${packageJson.version || "<missing>"}) must match plugin.json version (${pluginJson.version || "<missing>"})`,
    );
  }
}

function getGitShortHash(repoRoot) {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: repoRoot,
      encoding: "ascii",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function stageFile(repoRoot, stagingPlugin, sourceRelative, targetRelative, version) {
  const sourcePath = path.join(repoRoot, sourceRelative);
  const targetPath = path.join(stagingPlugin, targetRelative);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (sourceRelative === "package.json" || sourceRelative === "plugin.json") {
    const data = readJson(sourcePath);
    data.version = version;
    fs.writeFileSync(targetPath, `${JSON.stringify(data, null, 2)}\n`);
  } else {
    fs.copyFileSync(sourcePath, targetPath);
  }
  fs.chmodSync(targetPath, 0o644);
}

function assertPathInside(parent, child) {
  const resolvedParent = fs.realpathSync(parent);
  const resolvedChild = fs.realpathSync(child);
  const relativePath = path.relative(resolvedParent, resolvedChild);
  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Refusing to stage outside TMPDIR: ${resolvedChild}`);
  }
}

function writeZip(zipPath, entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.archiveName, "utf8");
    const data = fs.readFileSync(entry.filePath);
    const compressedData = deflateRawSync(data);
    const crc = crc32(data);
    const { date, time } = dosDateTime(new Date());

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedData.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, compressedData);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE((3 << 8) | 20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedData.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(entry.mode * 0x10000, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressedData.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce(
    (size, part) => size + part.length,
    0,
  );
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectorySize, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.writeFileSync(zipPath, Buffer.concat([...localParts, ...centralParts, eocd]));
}

function dosDateTime(dateObject) {
  const year = Math.max(dateObject.getFullYear(), 1980);
  const month = dateObject.getMonth() + 1;
  const day = dateObject.getDate();
  const hours = dateObject.getHours();
  const minutes = dateObject.getMinutes();
  const seconds = Math.floor(dateObject.getSeconds() / 2);

  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }
  return table;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
