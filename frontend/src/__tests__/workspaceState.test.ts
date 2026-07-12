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
