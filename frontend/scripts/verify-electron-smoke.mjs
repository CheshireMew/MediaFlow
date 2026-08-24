import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const unpackedDirectory = resolve("release", "win-unpacked");
const appArchive = resolve(unpackedDirectory, "resources", "app.asar");
const backendExecutable = resolve(
  unpackedDirectory,
  "resources",
  "backend",
  "mediaflow-backend.exe",
);
const ffmpegExecutable = resolve(unpackedDirectory, "resources", "bin", "ffmpeg.exe");
const ffprobeExecutable = resolve(unpackedDirectory, "resources", "bin", "ffprobe.exe");
const lxgwFont = resolve(
  unpackedDirectory,
  "resources",
  "fonts",
  "LXGWWenKai-Regular.ttf",
);
const thirdPartyNotices = resolve(
  unpackedDirectory,
  "resources",
  "legal",
  "THIRD_PARTY_NOTICES.md",
);
const projectLicense = resolve(unpackedDirectory, "resources", "legal", "LICENSE");
const projectLicenseNotice = resolve(
  unpackedDirectory,
  "resources",
  "legal",
  "LICENSE-NOTICE.md",
);
const projectLicensingScope = resolve(
  unpackedDirectory,
  "resources",
  "legal",
  "LICENSING.md",
);
const electronLicense = resolve(unpackedDirectory, "LICENSE.electron.txt");
const chromiumLicenses = resolve(unpackedDirectory, "LICENSES.chromium.html");

if (!existsSync(appArchive) || statSync(appArchive).size === 0) {
  throw new Error(`Electron smoke package is missing a non-empty app archive: ${appArchive}`);
}

const executables = readdirSync(unpackedDirectory).filter((name) =>
  name.toLowerCase().endsWith(".exe"),
);
if (executables.length === 0) {
  throw new Error(`Electron smoke package has no Windows executable: ${unpackedDirectory}`);
}

if (!existsSync(backendExecutable) || statSync(backendExecutable).size === 0) {
  throw new Error(
    `Electron smoke package is missing its production backend executable: ${backendExecutable}`,
  );
}

for (const requiredResource of [
  ffmpegExecutable,
  ffprobeExecutable,
  lxgwFont,
  thirdPartyNotices,
  projectLicense,
  projectLicenseNotice,
  projectLicensingScope,
  electronLicense,
  chromiumLicenses,
]) {
  if (!existsSync(requiredResource) || statSync(requiredResource).size === 0) {
    throw new Error(`Electron smoke package is missing a required production resource: ${requiredResource}`);
  }
}

console.log(
  `Electron smoke package verified (${executables.join(", ")}, ${statSync(appArchive).size} byte app.asar, backend, pinned FFmpeg tools, and legal notices present).`,
);
