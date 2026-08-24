import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..", "..");
const contractPath = path.join(repositoryRoot, "contracts", "bundled-tools.json");

function resolveRepositoryPath(relativePath) {
  const resolved = path.resolve(repositoryRoot, relativePath);
  const relative = path.relative(repositoryRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Bundled-tool path escapes the repository: ${relativePath}`);
  }
  return resolved;
}

async function sha256(filePath) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    digest.update(chunk);
  }
  return digest.digest("hex");
}

async function main() {
  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  if (contract.contractVersion !== 1 || !Array.isArray(contract.tools) || contract.tools.length === 0) {
    throw new Error("contracts/bundled-tools.json is not a supported, non-empty contract");
  }

  const verifyLegalResources = (ownerId, license) => {
    for (const legalPath of Object.values(license ?? {}).filter((value) => typeof value === "string" && value.includes("/"))) {
      const resolvedLegalPath = resolveRepositoryPath(legalPath);
      if (!existsSync(resolvedLegalPath)) {
        throw new Error(`${ownerId} legal resource is missing: ${legalPath}`);
      }
    }
  };

  let verifiedBinaryCount = 0;
  for (const tool of contract.tools) {
    verifyLegalResources(tool.id, tool.license);

    if (!Array.isArray(tool.binaries) || tool.binaries.length === 0) {
      throw new Error(`${tool.id} has no binary entries`);
    }
    for (const binary of tool.binaries) {
      const binaryPath = resolveRepositoryPath(binary.path);
      if (!existsSync(binaryPath)) {
        throw new Error(`${tool.id} binary is missing: ${binary.path}`);
      }

      const actualDigest = await sha256(binaryPath);
      if (actualDigest !== binary.sha256) {
        throw new Error(`${binary.path} SHA-256 mismatch: ${actualDigest} != ${binary.sha256}`);
      }

      const version = spawnSync(binaryPath, ["-version"], {
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      });
      if (version.error || version.status !== 0) {
        throw new Error(`${binary.path} did not return a successful version result: ${version.error?.message ?? version.stderr}`);
      }
      const versionOutput = `${version.stdout}\n${version.stderr}`;
      if (!versionOutput.includes(binary.versionContains)) {
        throw new Error(`${binary.path} version output does not contain ${JSON.stringify(binary.versionContains)}`);
      }
      verifiedBinaryCount += 1;
    }
  }

  let verifiedResourceCount = 0;
  for (const resource of contract.resources ?? []) {
    verifyLegalResources(resource.id, resource.license);
    const resourcePath = resolveRepositoryPath(resource.file.path);
    if (!existsSync(resourcePath)) {
      throw new Error(`${resource.id} file is missing: ${resource.file.path}`);
    }
    const actualDigest = await sha256(resourcePath);
    if (actualDigest !== resource.file.sha256) {
      throw new Error(`${resource.file.path} SHA-256 mismatch: ${actualDigest} != ${resource.file.sha256}`);
    }
    const { size } = statSync(resourcePath);
    if (size !== resource.file.size) {
      throw new Error(`${resource.file.path} size mismatch: ${size} != ${resource.file.size}`);
    }
    verifiedResourceCount += 1;
  }

  console.log(
    `Verified ${verifiedBinaryCount} bundled binaries and ${verifiedResourceCount} bundled resources against contracts/bundled-tools.json.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
