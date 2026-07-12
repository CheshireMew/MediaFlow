import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useContextMenuBuilder } from "../hooks/editor/useContextMenuBuilder";
import { seedJapaneseCudaExecutionPreferences } from "./testFixtures";
import { writeUiStateValue } from "../services/persistence/uiStateSettings";
import { ASR_EXECUTION_PREFERENCES } from "../contracts/runtimeContracts";

const {
  transcribeSegmentMock,
  translateSegmentsMock,
  toastInfoMock,
  toastSuccessMock,
  toastErrorMock,
  toastWarningMock,
  showInExplorerMock,
} = vi.hoisted(() => ({
  transcribeSegmentMock: vi.fn(),
  translateSegmentsMock: vi.fn(),
  toastInfoMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastWarningMock: vi.fn(),
  showInExplorerMock: vi.fn(),
}));

vi.mock("../services/domain", () => ({
  editorService: {
    transcribeSegment: transcribeSegmentMock,
    translateSegments: translateSegmentsMock,
  },
  isAiTranslationSetupRequiredError: () => false,
}));

vi.mock("../utils/toast", () => ({
  toast: {
    info: toastInfoMock,
    success: toastSuccessMock,
    error: toastErrorMock,
    warning: toastWarningMock,
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../services/fileService", () => ({
  fileService: {
    showInExplorer: showInExplorerMock,
  },
}));

describe("useContextMenuBuilder", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("uses shared ASR preferences for selected-region transcription", async () => {
    writeUiStateValue(
      ASR_EXECUTION_PREFERENCES.key,
      JSON.stringify({
        schema_version: ASR_EXECUTION_PREFERENCES.schema_version,
        payload: {
          engine: "cli",
          model: "small",
          device: "cuda",
        },
      }),
    );

    transcribeSegmentMock.mockResolvedValue({
      status: "completed",
      data: {
        text: "hello",
        segments: [{ start: 1, end: 2, text: "hello" }],
      },
    });

    const setContextMenu = vi.fn();
    const addSegments = vi.fn();

    const { result } = renderHook(() =>
      useContextMenuBuilder({
        regions: [],
        selectedIds: [],
        video: { path: "E:/sample.mp4", name: "sample.mp4" },
        subtitle: null,
        videoRef: { current: null },
        selectSegment: vi.fn(),
        addSegment: vi.fn(),
        addSegments,
        updateSegments: vi.fn(),
        mergeSegments: vi.fn(),
        splitSegment: vi.fn(),
        deleteSegments: vi.fn(),
        setContextMenu,
      }),
    );

    act(() => {
      result.current.handleContextMenu(
        { clientX: 16, clientY: 32 } as MouseEvent,
        "temp-region",
        { start: 1, end: 2 },
      );
    });

    const menu = setContextMenu.mock.calls[0][0];

    await act(async () => {
      await menu.items[1].onClick();
    });

    expect(transcribeSegmentMock).toHaveBeenCalledWith({
      audio_ref: expect.objectContaining({
        path: "E:/sample.mp4",
        name: "sample.mp4",
      }),
      start: 1,
      end: 2,
      engine: "cli",
      model: "small",
      device: "cuda",
    });
    expect(addSegments).toHaveBeenCalledWith([
      expect.objectContaining({
        start: 1,
        end: 2,
        text: "hello",
      }),
    ]);
  });

  it("recognizes and translates a waveform region using the shared target language", async () => {
    seedJapaneseCudaExecutionPreferences();

    transcribeSegmentMock.mockResolvedValue({
      status: "completed",
      data: {
        text: "hello",
        segments: [{ start: 1, end: 2, text: "hello" }],
      },
    });
    translateSegmentsMock.mockResolvedValue({
      status: "completed",
      segments: [{ id: "1", start: 1, end: 2, text: "こんにちは" }],
    });

    const setContextMenu = vi.fn();
    const addSegments = vi.fn();

    const { result } = renderHook(() =>
      useContextMenuBuilder({
        regions: [],
        selectedIds: [],
        video: { path: "E:/sample.mp4", name: "sample.mp4" },
        subtitle: null,
        videoRef: { current: null },
        selectSegment: vi.fn(),
        addSegment: vi.fn(),
        addSegments,
        updateSegments: vi.fn(),
        mergeSegments: vi.fn(),
        splitSegment: vi.fn(),
        deleteSegments: vi.fn(),
        setContextMenu,
      }),
    );

    act(() => {
      result.current.handleContextMenu(
        { clientX: 16, clientY: 32 } as MouseEvent,
        "temp-region",
        { start: 1, end: 2 },
      );
    });

    const menu = setContextMenu.mock.calls[0][0];

    await act(async () => {
      await menu.items[2].onClick();
    });

    expect(transcribeSegmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        start: 1,
        end: 2,
        device: "cuda",
      }),
    );
    expect(translateSegmentsMock).toHaveBeenCalledWith({
      segments: [
        expect.objectContaining({
          start: 1,
          end: 2,
          text: "hello",
        }),
      ],
      target_language: "Japanese",
      mode: "intelligent",
    });
    expect(addSegments).toHaveBeenCalledWith([
      expect.objectContaining({
        start: 1,
        end: 2,
        text: "こんにちは",
      }),
    ]);
  });

  it("opens the current subtitle file location from the segment context menu", async () => {
    const setContextMenu = vi.fn();

    const { result } = renderHook(() =>
      useContextMenuBuilder({
        regions: [{ id: "1", start: 1, end: 2, text: "hello" }],
        selectedIds: ["1"],
        video: { path: "E:/video/sample.mp4", name: "sample.mp4" },
        subtitle: { path: "E:/subtitles/sample.srt", name: "sample.srt" },
        videoRef: { current: null },
        selectSegment: vi.fn(),
        addSegment: vi.fn(),
        addSegments: vi.fn(),
        updateSegments: vi.fn(),
        mergeSegments: vi.fn(),
        splitSegment: vi.fn(),
        deleteSegments: vi.fn(),
        setContextMenu,
      }),
    );

    act(() => {
      result.current.handleContextMenu(
        { clientX: 16, clientY: 32 } as MouseEvent,
        "1",
      );
    });

    const menu = setContextMenu.mock.calls[0][0];
    const openFolderItem = menu.items.find(
      (item: { label: string }) => item.label === "contextMenu.openSubtitleFolder",
    );

    expect(openFolderItem).toBeDefined();
    expect(openFolderItem.disabled).toBe(false);

    await act(async () => {
      await openFolderItem.onClick();
    });

    expect(showInExplorerMock).toHaveBeenCalledWith("E:/subtitles/sample.srt");
    expect(showInExplorerMock).not.toHaveBeenCalledWith("E:/video/sample.mp4");
  });
});
