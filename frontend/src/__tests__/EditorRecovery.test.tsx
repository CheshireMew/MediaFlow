/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { useEditorIO } from "../hooks/editor/useEditorIO";
import { useEditorStore } from "../stores/editorStore";
import { apiClient } from "../api/client";
import { writePendingMediaNavigation } from "../services/ui/pendingMediaNavigation";

describe("Editor recovery", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    useEditorStore.setState({
      regions: [],
      mediaUrl: null,
      currentFilePath: null,
      currentSubtitlePath: null,
      activeSegmentId: null,
      selectedIds: [],
      past: [],
      future: [],
    });
  });

  beforeEach(() => {
    useEditorStore.setState({
      regions: [
        { id: "old-1", start: 0, end: 1, text: "Old subtitle" },
      ],
      mediaUrl: "file:///E:/old-video.mp4",
      currentFilePath: "E:/old-video.mp4",
      currentSubtitlePath: "E:/old-video.srt",
      activeSegmentId: "old-1",
      selectedIds: ["old-1"],
      past: [],
      future: [],
    });

    window.electronAPI = {
      ...window.electronAPI,
      readFile: vi.fn().mockResolvedValue(
        "1\n00:00:00,000 --> 00:00:01,000\nNew subtitle\n",
      ),
    };
  });

  it("prefers explicit pending navigation payload over persisted editor store state", async () => {
    const setPeaks = vi.fn();
    vi.spyOn(apiClient, "getPeaks").mockResolvedValue(new ArrayBuffer(8));

    writePendingMediaNavigation({
      target: "editor",
      video_path: "E:/new-video.mp4",
      subtitle_path: "E:/new-video_CN.srt",
    });

    renderHook(() => useEditorIO(setPeaks));

    await waitFor(() => {
      const state = useEditorStore.getState();
      expect(state.currentFilePath).toBe("E:/new-video.mp4");
      expect(state.currentSubtitlePath).toBe("E:/new-video_CN.srt");
      expect(state.regions).toEqual([
        { id: "1", start: 0, end: 1, text: "New subtitle" },
      ]);
    });

    expect(useEditorStore.getState().mediaUrl).toContain("E:/new-video.mp4");
    expect(setPeaks).toHaveBeenCalled();
    expect(sessionStorage.getItem("mediaflow:pending_file")).toBeNull();
  });
});
