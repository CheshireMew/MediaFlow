import { app } from "electron";
import fs from "fs";
import path from "path";

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

}

export const desktopFileAccess = new DesktopFileAccessRegistry();
