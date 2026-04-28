import fs from "fs";
import path from "path";

import { resolvePathFromDirectoryEntries } from "../../src/services/filesystem/pathRepair";
import { visitDesktopWorkerPayloadPaths } from "../../src/contracts/desktopWorkerPathPolicy";
import { resolveDesktopRuntimeDataRoot, resolveDesktopWorkspaceDir } from "../desktopRuntime";

function normalizePath(candidate: string) {
  return path.resolve(candidate);
}

function normalizeForCompare(candidate: string) {
  const normalized = normalizePath(candidate);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isPathInside(candidate: string, directory: string) {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

class DesktopFileAccessRegistry {
  private readonly rendererDirectories = new Set<string>();
  private readonly rendererFiles = new Set<string>();
  private readonly workerManagedDirectories = new Set<string>();

  constructor() {
    this.grantRendererDirectory(resolveDesktopWorkspaceDir());
    this.workerManagedDirectories.add(normalizeForCompare(resolveDesktopRuntimeDataRoot()));
  }

  grantRendererFile(filePath: string) {
    const normalized = normalizeForCompare(filePath);
    this.rendererFiles.add(normalized);
    this.grantRendererDirectory(path.dirname(filePath));
  }

  rememberRendererSelectedFile(filePath: string) {
    if (!filePath || typeof filePath !== "string") {
      throw new Error("Selected file registration requires a file path");
    }

    const normalized = normalizePath(filePath);
    if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) {
      throw new Error(`Selected file does not exist: ${filePath}`);
    }

    this.grantRendererFile(normalized);
  }

  grantRendererDirectory(directoryPath: string) {
    this.rendererDirectories.add(normalizeForCompare(directoryPath));
  }

  assertRendererFileSystemAccess(filePath: string, operation: string) {
    if (!filePath || typeof filePath !== "string") {
      throw new Error(`${operation} requires a file path`);
    }

    const normalized = normalizeForCompare(filePath);
    if (this.rendererFiles.has(normalized)) {
      return;
    }

    for (const directory of this.rendererDirectories) {
      if (isPathInside(normalized, directory)) {
        return;
      }
    }

    throw new Error(`${operation} denied for unauthorized path: ${filePath}`);
  }

  assertWorkerPayloadAccess(payload: unknown) {
    visitDesktopWorkerPayloadPaths(payload, ({ path: filePath, intent }) => {
      if (!filePath) {
        return;
      }
      if (intent === "write") {
        return;
      }

      const normalized = normalizeForCompare(filePath);
      for (const directory of this.workerManagedDirectories) {
        if (isPathInside(normalized, directory)) {
          return;
        }
      }

      this.assertRendererFileSystemAccess(filePath, "Desktop worker payload");
    });
  }

  resolveExistingPath(filePath: string, fallbackName?: string, expectedSize?: number) {
    this.assertRendererFileSystemAccess(filePath, "Resolve path");

    const candidateDir = path.dirname(filePath);
    if (!fs.existsSync(candidateDir)) {
      return fs.existsSync(filePath) ? filePath : null;
    }

    const directoryEntries = fs.readdirSync(candidateDir);
    const resolved = resolvePathFromDirectoryEntries(filePath, directoryEntries, fallbackName);
    if (resolved && fs.existsSync(resolved)) {
      this.grantRendererFile(resolved);
      return resolved;
    }

    if (typeof expectedSize === "number" && expectedSize >= 0) {
      const extension = path.extname(filePath).toLowerCase();
      const sizeMatches = directoryEntries.filter((entry) => {
        const candidatePath = path.join(candidateDir, entry);
        if (!fs.existsSync(candidatePath) || !fs.statSync(candidatePath).isFile()) {
          return false;
        }
        if (extension && path.extname(entry).toLowerCase() !== extension) {
          return false;
        }
        return fs.statSync(candidatePath).size === expectedSize;
      });

      if (sizeMatches.length === 1) {
        const repairedPath = path.join(candidateDir, sizeMatches[0]);
        this.grantRendererFile(repairedPath);
        return repairedPath;
      }
    }

    return fs.existsSync(filePath) ? filePath : null;
  }
}

export const desktopFileAccess = new DesktopFileAccessRegistry();
