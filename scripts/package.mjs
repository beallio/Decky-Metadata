import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const PLUGIN_FOLDER_NAME = "Playhub Metadata";
const CRC_TABLE = makeCrcTable();

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const packageJsonPath = path.join(repoRoot, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const version = packageJson.version;
  const bundlePath = path.join(repoRoot, "dist", "index.js");

  if (!fs.existsSync(bundlePath)) {
    throw new Error("Missing dist/index.js. Run npm run build before packaging.");
  }

  const stagingRoot = path.join(repoRoot, "build-package");
  const stagingPlugin = path.join(stagingRoot, PLUGIN_FOLDER_NAME);
  assertPathInside(repoRoot, stagingRoot);

  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(stagingPlugin, "dist"), { recursive: true });

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
    copyIntoStaging(repoRoot, stagingPlugin, sourceRelative, targetRelative);
  }

  for (const [sourceRelative, targetRelative] of optionalFiles) {
    if (fs.existsSync(path.join(repoRoot, sourceRelative))) {
      copyIntoStaging(repoRoot, stagingPlugin, sourceRelative, targetRelative);
    }
  }

  const entries = [...files, ...optionalFiles]
    .filter(([sourceRelative]) => fs.existsSync(path.join(repoRoot, sourceRelative)))
    .map(([, targetRelative]) => ({
      archiveName: `${PLUGIN_FOLDER_NAME}/${targetRelative}`.replaceAll(path.sep, "/"),
      filePath: path.join(stagingPlugin, targetRelative),
    }));

  const zipPath = path.join(repoRoot, `Playhub-Metadata_${version}_Installer.zip`);
  fs.rmSync(zipPath, { force: true });
  writeZip(zipPath, entries);
  fs.rmSync(stagingRoot, { recursive: true, force: true });

  console.log(zipPath);
}

function copyIntoStaging(repoRoot, stagingPlugin, sourceRelative, targetRelative) {
  const sourcePath = path.join(repoRoot, sourceRelative);
  const targetPath = path.join(stagingPlugin, targetRelative);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
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
