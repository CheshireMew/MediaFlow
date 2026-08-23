import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushWorkspaceState,
  flushWorkspaceStateSynchronously,
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

  it("synchronously commits the latest dirty snapshot before renderer unload", async () => {
    const electronApi = installElectronMock();
    await initializeWorkspaceState();

    writeWorkspaceStateValue("editor-storage", { documentId: "latest" });

    expect(flushWorkspaceStateSynchronously()).toBe(true);
    expect(electronApi.writeWorkspaceStateSync).toHaveBeenCalledWith(
      expect.stringContaining('"documentId":"latest"'),
      expect.any(String),
      expect.any(Number),
    );
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
