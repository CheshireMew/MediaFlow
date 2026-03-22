import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useTranslatorFileLoader } from "../hooks/translator/useTranslatorFileLoader";
import { useTranslatorStore } from "../stores/translatorStore";
import type { ElectronAPI } from "../types/electron-api";
import { installElectronMock } from "./testUtils/electronMock";

describe("useTranslatorFileLoader", () => {
  beforeEach(() => {
    useTranslatorStore.setState({
      sourceSegments: [],
      targetSegments: [],
      glossary: [],
      sourceFilePath: null,
      targetLang: "Chinese",
      mode: "standard",
      activeMode: null,
      resultMode: null,
      taskId: null,
      taskStatus: "",
      progress: 0,
    });

    installElectronMock({
      readFile: vi.fn(),
    });
  });

  test("does not restore stale translated subtitles when reloading the same path with changed content", async () => {
    const sourcePath = "E:/subs/demo.srt";
    const translatedPath = "E:/subs/demo_CN.srt";
    const electronAPI = (window as unknown as Window & { electronAPI: ElectronAPI }).electronAPI;

    useTranslatorStore.setState({
      sourceFilePath: sourcePath,
      sourceSegments: [
        { id: "1", start: 0, end: 1, text: "old line" },
      ],
      targetSegments: [
        { id: "1", start: 0, end: 1, text: "旧翻译" },
      ],
      resultMode: "standard",
    });

    vi.mocked(electronAPI.readFile).mockImplementation(async (path: string) => {
      if (path === sourcePath) {
        return "1\n00:00:00,000 --> 00:00:01,000\nnew line\n";
      }
      if (path === translatedPath) {
        return "1\n00:00:00,000 --> 00:00:01,000\nstale translation\n";
      }
      return "";
    });

    const { result } = renderHook(() => useTranslatorFileLoader());

    await act(async () => {
      await result.current.handleFileUpload(sourcePath);
    });

    await waitFor(() => {
      expect(useTranslatorStore.getState().sourceSegments[0]?.text).toBe("new line");
    });

    expect(useTranslatorStore.getState().targetSegments[0]?.text).toBe("");
    expect(useTranslatorStore.getState().sourceFileRef).toEqual({
      path: sourcePath,
      name: "demo.srt",
    });
    expect(useTranslatorStore.getState().targetSubtitleRef).toBeNull();
    expect(useTranslatorStore.getState().resultMode).toBeNull();
    expect(electronAPI.readFile).toHaveBeenCalledTimes(1);
  });

  test("keeps autoload behavior when reloading the same path with unchanged content", async () => {
    const sourcePath = "E:/subs/demo.srt";
    const translatedPath = "E:/subs/demo_CN.srt";
    const electronAPI = (window as unknown as Window & { electronAPI: ElectronAPI }).electronAPI;

    useTranslatorStore.setState({
      sourceFilePath: sourcePath,
      sourceSegments: [
        { id: "1", start: 0, end: 1, text: "same line" },
      ],
      targetSegments: [],
    });

    vi.mocked(electronAPI.readFile).mockImplementation(async (path: string) => {
      if (path === sourcePath) {
        return "1\n00:00:00,000 --> 00:00:01,000\nsame line\n";
      }
      if (path === translatedPath) {
        return "1\n00:00:00,000 --> 00:00:01,000\nloaded translation\n";
      }
      return "";
    });

    const { result } = renderHook(() => useTranslatorFileLoader());

    await act(async () => {
      await result.current.handleFileUpload(sourcePath);
    });

    await waitFor(() => {
      expect(useTranslatorStore.getState().targetSegments[0]?.text).toBe("loaded translation");
    });

    expect(useTranslatorStore.getState().sourceFileRef).toEqual({
      path: sourcePath,
      name: "demo.srt",
    });
    expect(useTranslatorStore.getState().targetSubtitleRef).toEqual({
      path: translatedPath,
      name: "demo_CN.srt",
    });
    expect(electronAPI.readFile).toHaveBeenCalledWith(translatedPath);
  });
});
