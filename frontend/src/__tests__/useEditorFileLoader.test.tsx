import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useEditorFileLoader } from "../hooks/editor/useEditorFileLoader";
import { editorService } from "../services/domain";
import { useEditorStore } from "../stores/editorStore";
import type { ElectronAPI } from "../types/electron-api";
import { resetEditorStoreForTests } from "./testFixtures";
import { installElectronMock } from "./testUtils/electronMock";

describe("useEditorFileLoader", () => {
  beforeEach(() => {
    resetEditorStoreForTests();

    installElectronMock({
      readFile: vi.fn(),
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

    const { result } = renderHook(() => useEditorFileLoader());

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

  test("loads a transport stream video when the subtitle keeps the media suffix", async () => {
    const subtitlePath = "E:/subs/demo.ts.srt";
    const videoPath = "E:/subs/demo.ts";
    const electronAPI = (window as unknown as Window & { electronAPI: ElectronAPI }).electronAPI;

    vi.mocked(electronAPI.readFile).mockImplementation(async (path: string) => {
      if (path === subtitlePath) {
        return "1\n00:00:00,000 --> 00:00:01,000\nhello\n";
      }
      return "";
    });
    vi.mocked(electronAPI.getFileSize).mockImplementation(async (path: string) => {
      if (path === videoPath) {
        return 1024;
      }
      throw new Error(`Missing file: ${path}`);
    });
    vi.spyOn(editorService, "resolvePreviewMediaSource").mockResolvedValue({
      source_ref: { path: videoPath, name: "demo.ts" },
      media_ref: { path: "E:/preview/demo.mp4", name: "demo.mp4" },
      remuxed: true,
    });

    const { result } = renderHook(() => useEditorFileLoader());

    await act(async () => {
      await result.current.loadSubtitleFromPath(subtitlePath);
    });

    await waitFor(() => {
      expect(useEditorStore.getState().currentFilePath).toBe(videoPath);
    });

    expect(useEditorStore.getState().currentFileRef).toEqual({
      path: videoPath,
      name: "demo.ts",
    });
    expect(useEditorStore.getState().mediaUrl).toContain("demo.mp4");
  });
});
