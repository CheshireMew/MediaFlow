import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const unpackedDirectory = resolve("release-smoke", "win-unpacked");
const appArchive = resolve(unpackedDirectory, "resources", "app.asar");

if (!existsSync(appArchive) || statSync(appArchive).size === 0) {
  throw new Error(`Electron smoke package is missing a non-empty app archive: ${appArchive}`);
}

const executables = readdirSync(unpackedDirectory).filter((name) =>
  name.toLowerCase().endsWith(".exe"),
);
if (executables.length === 0) {
  throw new Error(`Electron smoke package has no Windows executable: ${unpackedDirectory}`);
}

console.log(
  `Electron smoke package verified (${executables.join(", ")}, ${statSync(appArchive).size} byte app.asar).`,
);
