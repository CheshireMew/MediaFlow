import { vi } from "vitest";
import type { ElectronAPI } from "../../types/electron-api";

type MockFn = ReturnType<typeof vi.fn>;

export type MockedElectronAPI = {
  [K in keyof ElectronAPI]: ElectronAPI[K] extends (...args: never[]) => never
    ? MockFn
    : ElectronAPI[K];
};

function createBaseElectronMock(): MockedElectronAPI {
  return {
    openFile: vi.fn(),
    readFile: vi.fn(),
    showSaveDialog: vi.fn(),
    selectDirectory: vi.fn(),
    showInExplorer: vi.fn(),
    fetchCookies: vi.fn(),
    getPathForFile: vi.fn((file: File & { path?: string }) => file.path ?? ""),
    writeFile: vi.fn(),
    getFileSize: vi.fn(),
    readWorkspaceState: vi.fn().mockResolvedValue(null),
    writeWorkspaceState: vi.fn().mockResolvedValue(true),
    writeWorkspaceStateSync: vi.fn().mockReturnValue(true),
    getDesktopRuntimeInfo: vi.fn().mockResolvedValue({
      status: "pong",
      contract_version: 4,
      bridge_version: "test-bridge",
      capabilities: [
        "getDesktopRuntimeInfo",
        "readWorkspaceState",
        "writeWorkspaceState",
        "writeWorkspaceStateSync",
      ],
      backend: {
        status: "external",
        host: "127.0.0.1",
        port: 8800,
        api_base_url: "http://127.0.0.1:8800/api/v1",
        ws_base_url: "ws://127.0.0.1:8800/api/v1",
        health_url: "http://127.0.0.1:8800/health",
      },
    }),
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    notifyRendererReady: vi.fn(),
  };
}

export function installElectronMock(
  overrides: Partial<MockedElectronAPI> = {},
): MockedElectronAPI {
  const mock = {
    ...createBaseElectronMock(),
    ...overrides,
  };
  const target = window as Window & { electronAPI?: ElectronAPI };
  target.electronAPI = mock as unknown as ElectronAPI;
  return mock;
}

export function clearElectronMock() {
  const target = window as Window & { electronAPI?: ElectronAPI };
  target.electronAPI = undefined;
}
