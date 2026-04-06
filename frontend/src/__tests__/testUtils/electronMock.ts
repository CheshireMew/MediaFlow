import { vi } from "vitest";
import type { ElectronAPI } from "../../types/electron-api";
import { createMockUserSettings } from "./mockUserSettings";

type MockFn = ReturnType<typeof vi.fn>;

export type MockedElectronAPI = {
  [K in keyof ElectronAPI]: ElectronAPI[K] extends (...args: never[]) => never
    ? MockFn
    : ElectronAPI[K];
};

function createBaseElectronMock(): MockedElectronAPI {
  return {
    sendMessage: vi.fn(),
    openFile: vi.fn(),
    openSubtitleFile: vi.fn(),
    readFile: vi.fn(),
    showSaveDialog: vi.fn(),
    selectDirectory: vi.fn(),
    showInExplorer: vi.fn(),
    fetchCookies: vi.fn(),
    extractDouyinData: vi.fn(),
    getPathForFile: vi.fn((file: File & { path?: string }) => file.path ?? ""),
    writeFile: vi.fn(),
    readBinaryFile: vi.fn(),
    writeBinaryFile: vi.fn(),
    getFileSize: vi.fn(),
    resolveExistingPath: vi.fn(async (filePath: string) => filePath),
    saveFile: vi.fn(),
    getDesktopRuntimeInfo: vi.fn().mockResolvedValue({
      status: "pong",
      contract_version: 1,
      bridge_version: "test-bridge",
      task_owner_mode: "desktop",
      capabilities: [
        "getDesktopRuntimeInfo",
        "desktopPing",
        "listDesktopTasks",
        "desktopTranscribe",
        "onDesktopTaskEvent",
      ],
      worker: {
        protocol_version: 1,
        app_version: "test-worker",
      },
    }),
    desktopPing: vi.fn().mockResolvedValue({ status: "pong" }),
    listDesktopTasks: vi.fn().mockResolvedValue([]),
    desktopTranscribe: vi.fn(),
    desktopTranslate: vi.fn(),
    desktopSynthesize: vi.fn(),
    getDesktopSettings: vi.fn().mockResolvedValue(createMockUserSettings()),
    updateDesktopSettings: vi.fn(),
    setDesktopActiveProvider: vi.fn(),
    testDesktopProvider: vi.fn(),
    listDesktopGlossary: vi.fn(),
    addDesktopGlossaryTerm: vi.fn(),
    deleteDesktopGlossaryTerm: vi.fn(),
    updateDesktopYtDlp: vi.fn(),
    analyzeDesktopUrl: vi.fn(),
    saveDesktopCookies: vi.fn(),
    desktopDownload: vi.fn(),
    desktopExtract: vi.fn(),
    getDesktopOcrResults: vi.fn(),
    desktopTranscribeSegment: vi.fn(),
    desktopTranslateSegment: vi.fn(),
    uploadDesktopWatermark: vi.fn(),
    getDesktopLatestWatermark: vi.fn(),
    desktopEnhance: vi.fn(),
    desktopClean: vi.fn(),
    pauseDesktopTask: vi.fn(),
    resumeDesktopTask: vi.fn(),
    cancelDesktopTask: vi.fn(),
    onDesktopTaskEvent: vi.fn(() => vi.fn()),
    onDesktopTranscribeProgress: vi.fn(() => vi.fn()),
    onDesktopTranslateProgress: vi.fn(() => vi.fn()),
    onDesktopSynthesizeProgress: vi.fn(() => vi.fn()),
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
