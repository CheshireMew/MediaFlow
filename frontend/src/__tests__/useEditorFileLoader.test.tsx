import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useEditorFileLoader } from "../hooks/editor/useEditorFileLoader";
import { useEditorStore } from "../stores/editorStore";
import type { ElectronAPI } from "../types/electron-api";
import { installElectronMock } from "./testUtils/electronMock";

describe("useEditorFileLoader", () => {
  beforeEach(() => {
    useEditorStore.setState({
      regions: [],
      mediaUrl: null,
      currentFilePath: null,
      currentSubtitlePath: null,
      currentFileRef: null,
      currentSubtitleRef: null,
      activeSegmentId: null,
      selectedIds: [],
      past: [],
      future: [],
    });

    installElectronMock({
      readFile: vi.fn(),
      getDesktopPeaks: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      getFileSize: vi.fn().mockResolvedValue(1024),
    });
  });

  test("stores media refs when loading a subtitle with a related video", async () => {
    const subtitlePath = "E:/subs/demo.srt";
    const videoPath = "E:/subs/demo.mp4";
    const electronAPI = (window as unknown as Window & { electronAPI: ElectronAPI }).electronAPI;

    vi.mocked(electronAPI.readFile).mockImplementation(async (path: string) => {
      if (path === subtitlePath) {
        return "1\n00:00:00,000 --> 00:00:01,000\nhello\n";
      }
      return "";
    });

    const { result } = renderHook(() =>
      useEditorFileLoader({
        setPeaks: vi.fn(),
        tryLoadPeaks: vi.fn().mockResolvedValue([new Float32Array([0, 1])]),
      }),
    );

    await act(async () => {
      await result.current.loadSubtitleFromPath(subtitlePath);
    });

    await waitFor(() => {
      expect(useEditorStore.getState().currentFilePath).toBe(videoPath);
    });

    expect(useEditorStore.getState().currentFileRef).toEqual({
      path: videoPath,
      name: "demo.mp4",
    });
    expect(useEditorStore.getState().currentSubtitleRef).toEqual({
      path: subtitlePath,
      name: "demo.srt",
    });
  });
});
