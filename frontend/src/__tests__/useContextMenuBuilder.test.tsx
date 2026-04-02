import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useContextMenuBuilder } from "../hooks/editor/useContextMenuBuilder";

const {
  transcribeSegmentMock,
  translateSegmentsMock,
  toastInfoMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  transcribeSegmentMock: vi.fn(),
  translateSegmentsMock: vi.fn(),
  toastInfoMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("../services/domain", () => ({
  editorService: {
    transcribeSegment: transcribeSegmentMock,
    translateSegments: translateSegmentsMock,
  },
}));

vi.mock("../services/domain/executionAccess", () => ({
  isAiTranslationSetupRequiredError: () => false,
}));

vi.mock("../utils/toast", () => ({
  toast: {
    info: toastInfoMock,
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

describe("useContextMenuBuilder", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("uses shared ASR preferences for selected-region transcription", async () => {
    localStorage.setItem(
      "asr_execution_preferences",
      JSON.stringify({
        schema_version: 1,
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
        currentFilePath: "E:/sample.mp4",
        currentFileRef: null,
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
      audio_path: "E:/sample.mp4",
      audio_ref: null,
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
    localStorage.setItem(
      "asr_execution_preferences",
      JSON.stringify({
        schema_version: 1,
        payload: {
          engine: "builtin",
          model: "base",
          device: "cuda",
        },
      }),
    );
    localStorage.setItem(
      "translation_preferences",
      JSON.stringify({
        schema_version: 2,
        payload: {
          targetLanguage: "Japanese",
          mode: "intelligent",
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
        currentFilePath: "E:/sample.mp4",
        currentFileRef: null,
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
});
