import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushWorkspaceState,
  flushWorkspaceStateForShutdown,
  initializeWorkspaceState,
  readWorkspaceStateValue,
  resetWorkspaceStateForTests,
  writeWorkspaceStateValue,
} from "../services/persistence/workspaceState";
import {
  clearElectronMock,
  installElectronMock,
} from "./testUtils/electronMock";

describe("workspaceState", () => {
  beforeEach(() => {
    clearElectronMock();
    resetWorkspaceStateForTests();
  });

  it("uses the dedicated desktop workspace file when the bridge is available", async () => {
    const electronApi = installElectronMock({
      readWorkspaceState: vi.fn().mockResolvedValue(
        JSON.stringify({ "mediaflow:last-route": "translator" }),
      ),
    });

    await initializeWorkspaceState();
    expect(readWorkspaceStateValue("mediaflow:last-route")).toBe("translator");

    writeWorkspaceStateValue("editor-storage", { documentId: "one" });
    await flushWorkspaceState();

    expect(electronApi.writeWorkspaceState).toHaveBeenCalledWith(
      expect.stringContaining('"editor-storage"'),
      expect.any(String),
      expect.any(Number),
    );
    expect(localStorage.getItem("mediaflow:workspace-state:v1")).toBeNull();
  });

  it("waits for an in-flight write and persists mutations made while it was pending", async () => {
    let releaseFirstWrite: (written: boolean) => void = () => undefined;
    const firstWrite = new Promise<boolean>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const electronApi = installElectronMock({
      writeWorkspaceState: vi.fn()
        .mockReturnValueOnce(firstWrite)
        .mockResolvedValue(true),
    });
    await initializeWorkspaceState();

    writeWorkspaceStateValue("editor-storage", { documentId: "first" });
    const initialFlush = flushWorkspaceState();
    await Promise.resolve();
    writeWorkspaceStateValue("editor-storage", { documentId: "latest" });

    let shutdownFinished = false;
    const shutdown = flushWorkspaceStateForShutdown().then((result) => {
      shutdownFinished = true;
      return result;
    });
    await Promise.resolve();
    expect(shutdownFinished).toBe(false);

    releaseFirstWrite(true);
    await initialFlush;
    await expect(shutdown).resolves.toBe(true);

    const writes = vi.mocked(electronApi.writeWorkspaceState).mock.calls;
    expect(writes).toHaveLength(2);
    expect(JSON.parse(writes[1][0])).toEqual({
      format: "mediaflow-workspace-patch-v1",
      operations: [{
        op: "set",
        path: ["editor-storage", "documentId"],
        value: "latest",
      }],
    });
  });

  it("serializes a close flush behind an older asynchronous write", async () => {
    let releaseFirstWrite: (written: boolean) => void = () => undefined;
    const firstWrite = new Promise<boolean>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const electronApi = installElectronMock({
      writeWorkspaceState: vi.fn().mockReturnValue(firstWrite),
    });
    await initializeWorkspaceState();

    writeWorkspaceStateValue("editor-storage", { documentId: "first" });
    const initialFlush = flushWorkspaceState();
    await Promise.resolve();
    writeWorkspaceStateValue("editor-storage", { documentId: "latest" });

    const closeFlush = flushWorkspaceStateForShutdown();
    releaseFirstWrite(true);
    await initialFlush;
    await expect(closeFlush).resolves.toBe(true);
    expect(electronApi.writeWorkspaceState).toHaveBeenCalledTimes(2);
    const finalWrite = vi.mocked(electronApi.writeWorkspaceState).mock.calls.at(-1);
    expect(finalWrite?.slice(1)).toEqual([expect.any(String), expect.any(Number)]);
    expect(JSON.parse(finalWrite?.[0] ?? "{}")).toEqual({
      format: "mediaflow-workspace-patch-v1",
      operations: [{
        op: "set",
        path: ["editor-storage", "documentId"],
        value: "latest",
      }],
    });
  });

  it("writes only the changed subtitle field after the initial snapshot", async () => {
    const electronApi = installElectronMock();
    await initializeWorkspaceState();
    const regions = Array.from({ length: 1_000 }, (_, index) => ({
      id: String(index),
      start: index,
      end: index + 0.5,
      text: `subtitle-${index}`,
    }));
    const initial = { document: { regions }, selectedIds: [] };
    writeWorkspaceStateValue("editor-storage", initial);
    await flushWorkspaceState();
    const writeWorkspaceStateMock = vi.mocked(electronApi.writeWorkspaceState);
    writeWorkspaceStateMock.mockClear();

    const updatedRegions = [...regions];
    updatedRegions[500] = { ...updatedRegions[500], text: "changed" };
    const updated = { document: { regions: updatedRegions }, selectedIds: [] };
    writeWorkspaceStateValue("editor-storage", updated);
    await flushWorkspaceState();

    const serializedPatch = writeWorkspaceStateMock.mock.calls[0][0];
    const patch = JSON.parse(serializedPatch);
    expect(patch).toEqual({
      format: "mediaflow-workspace-patch-v1",
      operations: [{
        op: "set",
        path: ["editor-storage", "document", "regions", 500, "text"],
        value: "changed",
      }],
    });
    expect(serializedPatch.length).toBeLessThan(JSON.stringify(updated).length / 10);
  });

  it("uses JSON semantics before diffing optional fields", async () => {
    const electronApi = installElectronMock();
    await initializeWorkspaceState();

    writeWorkspaceStateValue("editor-storage", {
      video: {
        path: "E:/media/demo.mp4",
        name: "demo.mp4",
        size: 42,
      },
    });
    await flushWorkspaceState();
    vi.mocked(electronApi.writeWorkspaceState).mockClear();

    writeWorkspaceStateValue("editor-storage", {
      video: {
        path: "E:/media/demo.mp4",
        name: "demo.mp4",
        size: undefined,
        type: undefined,
      },
    });
    await flushWorkspaceState();

    const serializedPatch = vi.mocked(electronApi.writeWorkspaceState).mock.calls[0][0];
    expect(JSON.parse(serializedPatch)).toEqual({
      format: "mediaflow-workspace-patch-v1",
      operations: [{
        op: "delete",
        path: ["editor-storage", "video", "size"],
      }],
    });
  });

  it("persists workspace state outside user settings", async () => {
    writeWorkspaceStateValue("editor-storage", { documentId: "one" });
    expect(readWorkspaceStateValue("editor-storage")).toEqual({
      documentId: "one",
    });

    await flushWorkspaceState();
    expect(localStorage.getItem("mediaflow:workspace-state:v1")).toContain(
      "editor-storage",
    );
  });
});
