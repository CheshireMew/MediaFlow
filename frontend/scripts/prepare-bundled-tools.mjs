import { constants, createReadStream, createWriteStream, existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const contract = JSON.parse(
  readFileSync(join(repositoryRoot, "contracts", "bundled-tools.json"), "utf8"),
);

function defaultCacheDirectory() {
  if (process.env.MEDIAFLOW_BUILD_CACHE_DIR) {
    return resolve(process.env.MEDIAFLOW_BUILD_CACHE_DIR);
  }
  if (process.platform === "win32" && existsSync("D:\\Tools")) {
    return "D:\\Tools\\MediaFlow\\build-cache";
  }
  return join(repositoryRoot, ".tmp", "build-cache");
}

async function sha256(filePath) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
}

async function downloadPinnedArchive(url, destination, expectedDigest) {
  if (existsSync(destination)) {
    const cachedDigest = await sha256(destination);
    if (cachedDigest !== expectedDigest) {
      throw new Error(`Cached bundled-tool archive has an unexpected SHA-256: ${destination}`);
    }
    return;
  }

  const temporary = `${destination}.partial-${process.pid}-${Date.now()}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "MediaFlow desktop build" },
    redirect: "follow",
  });
  if (!response.ok || !response.body) {
    throw new Error(`Bundled-tool download failed with HTTP ${response.status}: ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: "wx" }));
  const downloadedDigest = await sha256(temporary);
  if (downloadedDigest !== expectedDigest) {
    throw new Error(`Downloaded bundled-tool archive SHA-256 mismatch: ${downloadedDigest}`);
  }
  await rename(temporary, destination);
}

async function prepareFfmpeg(tool, cacheDirectory) {
  const targets = tool.binaries.map((binary) => resolve(repositoryRoot, binary.path));
  const presentCount = targets.filter(existsSync).length;
  if (presentCount === targets.length) {
    console.log(`${tool.id} binaries already exist; verification will run next.`);
    return;
  }
  if (presentCount !== 0) {
    throw new Error(`${tool.id} is only partially present. Restore both pinned binaries before building.`);
  }

  await mkdir(cacheDirectory, { recursive: true });
  const archivePath = join(cacheDirectory, basename(new URL(tool.distribution.downloadUrl).pathname));
  await downloadPinnedArchive(
    tool.distribution.downloadUrl,
    archivePath,
    tool.distribution.archiveSha256,
  );

  const extractionDirectory = join(
    cacheDirectory,
    `${tool.id}-${tool.distribution.archiveSha256.slice(0, 12)}`,
  );
  await mkdir(extractionDirectory, { recursive: true });
  const extraction = spawnSync("tar.exe", ["-xf", archivePath, "-C", extractionDirectory], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (extraction.error || extraction.status !== 0) {
    throw new Error(`Could not extract ${archivePath}: ${extraction.error?.message ?? extraction.stderr}`);
  }

  const sourceDirectory = join(extractionDirectory, "ffmpeg-8.1-essentials_build", "bin");
  await mkdir(join(repositoryRoot, "bin"), { recursive: true });
  for (const target of targets) {
    const source = join(sourceDirectory, basename(target));
    if (!existsSync(source)) {
      throw new Error(`Pinned archive did not contain ${basename(target)} at the documented path.`);
    }
    await copyFile(source, target, constants.COPYFILE_EXCL);
  }
  console.log(`${tool.id} was materialized from the pinned official archive.`);
}

async function main() {
  if (process.platform !== "win32") {
    throw new Error("MediaFlow currently prepares and validates bundled desktop tools on Windows only.");
  }
  if (contract.contractVersion !== 1 || !Array.isArray(contract.tools)) {
    throw new Error("Unsupported bundled-tool contract");
  }
  const cacheDirectory = defaultCacheDirectory();
  for (const tool of contract.tools) {
    if (tool.id === "ffmpeg-gyan-8.1-essentials") {
      await prepareFfmpeg(tool, cacheDirectory);
      continue;
    }
    throw new Error(`No materializer is registered for bundled tool ${tool.id}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
