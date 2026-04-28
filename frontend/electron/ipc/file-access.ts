import { app } from "electron";
import fs from "fs";
import path from "path";

import { resolvePathFromDirectoryEntries } from "../../src/services/filesystem/pathRepair";
import { visitDesktopWorkerPayloadPaths } from "../../src/contracts/desktopWorkerPathPolicy";
import {
  resolveDesktopManagedBinDir,
  resolveDesktopRuntimeDataRoot,
  resolveDesktopWorkspaceDir,
} from "../desktopRuntime";

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
  private readonly rendererReadDirectories = new Set<string>();
  private readonly rendererReadFiles = new Set<string>();
  private readonly rendererWriteDirectories = new Set<string>();
  private readonly rendererWriteFiles = new Set<string>();
  private readonly workerManagedReadDirectories = new Set<string>();
  private readonly workerManagedWriteDirectories = new Set<string>();
  private hasLoadedPersistedWriteDirectories = false;

  constructor() {
    const workspaceDir = resolveDesktopWorkspaceDir();
    const runtimeDataRoot = resolveDesktopRuntimeDataRoot();
    this.grantRendererReadDirectory(workspaceDir);
    this.grantRendererWriteDirectory(workspaceDir, { persist: false });
    this.workerManagedReadDirectories.add(normalizeForCompare(workspaceDir));
    this.workerManagedReadDirectories.add(normalizeForCompare(runtimeDataRoot));
    this.workerManagedReadDirectories.add(normalizeForCompare(resolveDesktopManagedBinDir()));
    this.workerManagedWriteDirectories.add(normalizeForCompare(workspaceDir));
    this.workerManagedWriteDirectories.add(normalizeForCompare(runtimeDataRoot));
  }

  private getWriteAuthorizationStorePath() {
    return path.join(app.getPath("userData"), "authorized-write-roots.json");
  }

  private loadPersistedWriteDirectories() {
    if (this.hasLoadedPersistedWriteDirectories) {
      return;
    }
    this.hasLoadedPersistedWriteDirectories = true;

    try {
      const storePath = this.getWriteAuthorizationStorePath();
      if (!fs.existsSync(storePath)) {
        return;
      }

      const data = JSON.parse(fs.readFileSync(storePath, "utf-8")) as {
        version?: number;
        directories?: unknown;
      };
      if (!Array.isArray(data.directories)) {
        return;
      }

      for (const directoryPath of data.directories) {
        if (typeof directoryPath !== "string" || !directoryPath) {
          continue;
        }
        const normalized = normalizePath(directoryPath);
        if (fs.existsSync(normalized) && fs.statSync(normalized).isDirectory()) {
          this.rendererWriteDirectories.add(normalizeForCompare(normalized));
          this.rendererReadDirectories.add(normalizeForCompare(normalized));
        }
      }
    } catch (error) {
      console.error("[DesktopFileAccess] Failed to load write authorizations:", error);
    }
  }

  private persistWriteDirectories() {
    try {
      const directories = [...this.rendererWriteDirectories].sort();
      fs.writeFileSync(
        this.getWriteAuthorizationStorePath(),
        JSON.stringify({ version: 1, directories }, null, 2),
      );
    } catch (error) {
      console.error("[DesktopFileAccess] Failed to persist write authorizations:", error);
    }
  }

  grantRendererReadFile(filePath: string) {
    const normalized = normalizeForCompare(filePath);
    this.rendererReadFiles.add(normalized);
    this.grantRendererReadDirectory(path.dirname(filePath));
  }

  grantRendererWriteFile(filePath: string) {
    const normalized = normalizeForCompare(filePath);
    this.rendererWriteFiles.add(normalized);
    this.rendererReadFiles.add(normalized);
  }

  rememberRendererSelectedFile(filePath: string) {
    if (!filePath || typeof filePath !== "string") {
      throw new Error("Selected file registration requires a file path");
    }

    const normalized = normalizePath(filePath);
    if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) {
      throw new Error(`Selected file does not exist: ${filePath}`);
    }

    this.grantRendererReadFile(normalized);
  }

  grantRendererReadDirectory(directoryPath: string) {
    this.rendererReadDirectories.add(normalizeForCompare(directoryPath));
  }

  grantRendererWriteDirectory(directoryPath: string, options: { persist: boolean }) {
    const normalized = normalizePath(directoryPath);
    this.rendererWriteDirectories.add(normalizeForCompare(normalized));
    this.rendererReadDirectories.add(normalizeForCompare(normalized));
    if (options.persist) {
      this.loadPersistedWriteDirectories();
      this.persistWriteDirectories();
    }
  }

  assertRendererReadAccess(filePath: string, operation: string) {
    if (!filePath || typeof filePath !== "string") {
      throw new Error(`${operation} requires a file path`);
    }

    const normalized = normalizeForCompare(filePath);
    if (this.rendererReadFiles.has(normalized)) {
      return;
    }

    for (const directory of this.rendererReadDirectories) {
      if (isPathInside(normalized, directory)) {
        return;
      }
    }

    throw new Error(`${operation} denied for unauthorized path: ${filePath}`);
  }

  assertRendererWriteAccess(filePath: string, operation: string) {
    if (!filePath || typeof filePath !== "string") {
      throw new Error(`${operation} requires a file path`);
    }

    this.loadPersistedWriteDirectories();

    const normalized = normalizeForCompare(filePath);
    if (this.rendererWriteFiles.has(normalized)) {
      return;
    }

    for (const directory of this.rendererWriteDirectories) {
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

      const normalized = normalizeForCompare(filePath);
      const workerManagedDirectories =
        intent === "write" ? this.workerManagedWriteDirectories : this.workerManagedReadDirectories;
      for (const directory of workerManagedDirectories) {
        if (isPathInside(normalized, directory)) {
          return;
        }
      }

      if (intent === "write") {
        this.assertRendererWriteAccess(filePath, "Desktop worker payload");
        return;
      }

      this.assertRendererReadAccess(filePath, "Desktop worker payload");
    });
  }

  resolveExistingPath(filePath: string, fallbackName?: string, expectedSize?: number) {
    this.assertRendererReadAccess(filePath, "Resolve path");

    const candidateDir = path.dirname(filePath);
    if (!fs.existsSync(candidateDir)) {
      return fs.existsSync(filePath) ? filePath : null;
    }

    const directoryEntries = fs.readdirSync(candidateDir);
    const resolved = resolvePathFromDirectoryEntries(filePath, directoryEntries, fallbackName);
    if (resolved && fs.existsSync(resolved)) {
      this.grantRendererReadFile(resolved);
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
        this.grantRendererReadFile(repairedPath);
        return repairedPath;
      }
    }

    return fs.existsSync(filePath) ? filePath : null;
  }
}

export const desktopFileAccess = new DesktopFileAccessRegistry();
