import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useTranslatorFileLoader } from "../hooks/translator/useTranslatorFileLoader";
import { useTranslatorStore } from "../stores/translatorStore";

declare global {
  interface Window {
    electronAPI?: {
      readFile: ReturnType<typeof vi.fn>;
    };
  }
}

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

    window.electronAPI = {
      readFile: vi.fn(),
    };
  });

  test("does not restore stale translated subtitles when reloading the same path with changed content", async () => {
    const sourcePath = "E:/subs/demo.srt";
    const translatedPath = "E:/subs/demo_CN.srt";

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

    window.electronAPI.readFile.mockImplementation(async (path: string) => {
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
    expect(useTranslatorStore.getState().resultMode).toBeNull();
    expect(window.electronAPI.readFile).toHaveBeenCalledTimes(1);
  });

  test("keeps autoload behavior when reloading the same path with unchanged content", async () => {
    const sourcePath = "E:/subs/demo.srt";
    const translatedPath = "E:/subs/demo_CN.srt";

    useTranslatorStore.setState({
      sourceFilePath: sourcePath,
      sourceSegments: [
        { id: "1", start: 0, end: 1, text: "same line" },
      ],
      targetSegments: [],
    });

    window.electronAPI.readFile.mockImplementation(async (path: string) => {
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

    expect(window.electronAPI.readFile).toHaveBeenCalledWith(translatedPath);
  });
});
