import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const PLUGIN_FOLDER_NAME = "Decky-Metadata";
const CRC_TABLE = makeCrcTable();

// Mirrors the version grammar the self-updater parses (backend discovery):
// X.Y.Z, optionally -dev.<id> (development channel) and/or +<build> metadata.
const VERSION_RE =
  /^(\d+)\.(\d+)\.(\d+)(?:-dev\.([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/;

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const packageJsonPath = path.join(repoRoot, "package.json");
  const pluginJsonPath = path.join(repoRoot, "plugin.json");
  const packageJson = readJson(packageJsonPath);
  const pluginJson = readJson(pluginJsonPath);
  validatePackageVersions(packageJson, pluginJson);
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
  const bundlePath = path.join(repoRoot, "dist", "index.js");

  if (!fs.existsSync(bundlePath)) {
    throw new Error("Missing dist/index.js. Run npm run build before packaging.");
  }

  const stagingBase = "/tmp/Decky-Metadata";
  const stagingRoot = path.join(stagingBase, "build-package");
  const stagingPlugin = path.join(stagingRoot, PLUGIN_FOLDER_NAME);
  assertPathInside(stagingBase, stagingRoot);

  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(stagingPlugin, "dist"), { recursive: true });

  const files = [
    ["main.py", "main.py"],
    ["package.json", "package.json"],
    ["plugin.json", "plugin.json"],
    ["LICENSE", "LICENSE"],
    ["dist/index.js", "dist/index.js"],
    ...findPythonModules(repoRoot, "backend").map((relative) => [relative, relative]),
  ];
  const optionalFiles = [
    ["NOTICE", "NOTICE"],
    ["dist/index.js.map", "dist/index.js.map"],
  ];

  for (const [sourceRelative, targetRelative] of files) {
    stageFile(repoRoot, stagingPlugin, sourceRelative, targetRelative, version);
  }

  for (const [sourceRelative, targetRelative] of optionalFiles) {
    if (fs.existsSync(path.join(repoRoot, sourceRelative))) {
      stageFile(repoRoot, stagingPlugin, sourceRelative, targetRelative, version);
    }
  }

  const entries = [...files, ...optionalFiles]
    .filter(([sourceRelative]) => fs.existsSync(path.join(repoRoot, sourceRelative)))
    .map(([, targetRelative]) => ({
      archiveName: `${PLUGIN_FOLDER_NAME}/${targetRelative}`.replaceAll(path.sep, "/"),
      filePath: path.join(stagingPlugin, targetRelative),
    }));

  // Fixed output filename; the version+hash lives inside plugin.json/package.json.
  const zipPath = path.join(repoRoot, "Decky-Metadata.zip");
  fs.rmSync(zipPath, { force: true });
  writeZip(zipPath, entries);
  fs.rmSync(stagingRoot, { recursive: true, force: true });

  console.log(`Packaged version: ${version}`);
  console.log(zipPath);

  if (process.argv.includes("--emit-release-metadata")) {
    emitReleaseMetadata({ repoRoot, zipPath, version, packageJson, pluginJson });
  }
}

// Writes the release manifest + checksum sidecar the self-updater trusts. The
// manifest's sha256 is the digest of the whole zip (exactly what Decky Loader
// re-verifies before installing), and its fields are what backend discovery
// validates: pluginName/packageName identity, tag==v+version, and channel.
function emitReleaseMetadata({ repoRoot, zipPath, version, packageJson, pluginJson }) {
  const tag = getFlagValue("--release-tag") ?? `v${version}`;
  if (`v${version}` !== tag) {
    throw new Error(
      `--release-tag ${tag} must equal v${version} (discovery checks tag === "v" + manifest.version)`,
    );
  }

  let channel = getFlagValue("--channel");
  if (channel === null) {
    channel = version.includes("-dev.") ? "dev" : "stable";
  }
  if (channel !== "stable" && channel !== "dev") {
    throw new Error(`--channel must be "stable" or "dev", got: ${channel}`);
  }

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

  const manifestPath = path.join(repoRoot, `${PLUGIN_FOLDER_NAME}-${tag}.manifest.json`);
  const shaPath = path.join(repoRoot, `${PLUGIN_FOLDER_NAME}-${tag}.zip.sha256`);
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

function findPythonModules(repoRoot, dirRelative) {
  const results = [];
  const walk = (currentRelative) => {
    const currentAbsolute = path.join(repoRoot, currentRelative);
    for (const entry of fs.readdirSync(currentAbsolute, { withFileTypes: true })) {
      const entryRelative = path.join(currentRelative, entry.name);
      if (entry.isDirectory()) {
        walk(entryRelative);
      } else if (entry.isFile() && entry.name.endsWith(".py")) {
        results.push(entryRelative);
      }
    }
  };
  walk(dirRelative);
  return results.sort();
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
    return;
  }
  fs.copyFileSync(sourcePath, targetPath);
}

function assertPathInside(parent, child) {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  const parentForCompare =
    process.platform === "win32" ? resolvedParent.toLowerCase() : resolvedParent;
  const childForCompare =
    process.platform === "win32" ? resolvedChild.toLowerCase() : resolvedChild;

  if (
    childForCompare !== parentForCompare &&
    !childForCompare.startsWith(`${parentForCompare}${path.sep}`)
  ) {
    throw new Error(`Refusing to remove staging outside project: ${resolvedChild}`);
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
    centralHeader.writeUInt16LE(20, 4);
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
    centralHeader.writeUInt32LE(0, 38);
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
