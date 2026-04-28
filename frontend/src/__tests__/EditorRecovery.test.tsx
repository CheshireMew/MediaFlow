/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { useEditorIO } from "../hooks/editor/useEditorIO";
import { useEditorStore } from "../stores/editorStore";
import { writePendingMediaNavigation } from "../services/ui/pendingMediaNavigation";
import { installElectronMock } from "./testUtils/electronMock";

describe("Editor recovery", () => {
  const expectEditorMediaState = (expected: {
    videoRef: { path: string; name: string };
    subtitleRef: { path: string; name: string };
    videoPath?: string;
    subtitlePath?: string;
  }) => {
    const state = useEditorStore.getState();
    expect(state.currentFileRef).toEqual(expected.videoRef);
    expect(state.currentSubtitleRef).toEqual(expected.subtitleRef);
    expect(state.currentFilePath).toBe(expected.videoPath ?? expected.videoRef.path);
    expect(state.currentSubtitlePath).toBe(expected.subtitlePath ?? expected.subtitleRef.path);
    expect(state.mediaUrl).toContain(expected.videoPath ?? expected.videoRef.path);
  };

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
      currentFileRef: null,
      currentSubtitleRef: null,
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
      currentFileRef: { path: "E:/old-video.mp4", name: "old-video.mp4" },
      currentSubtitleRef: { path: "E:/old-video.srt", name: "old-video.srt" },
      activeSegmentId: "old-1",
      selectedIds: ["old-1"],
      past: [],
      future: [],
    });

    installElectronMock({
      readFile: vi.fn().mockResolvedValue(
        "1\n00:00:00,000 --> 00:00:01,000\nNew subtitle\n",
      ),
    });
  });

  it("prefers explicit pending navigation payload over persisted editor store state", async () => {
    writePendingMediaNavigation({
      target: "editor",
      video_ref: {
        path: "E:/canonical/new-video.mp4",
        name: "canonical-video.mp4",
      },
      subtitle_ref: {
        path: "E:/canonical/new-video_CN.srt",
        name: "canonical-new-video_CN.srt",
      },
    });

    renderHook(() => useEditorIO());

    await waitFor(() => {
      expectEditorMediaState({
        videoRef: {
          path: "E:/canonical/new-video.mp4",
          name: "canonical-video.mp4",
        },
        subtitleRef: {
          path: "E:/canonical/new-video_CN.srt",
          name: "canonical-new-video_CN.srt",
        },
      });
      expect(useEditorStore.getState().regions).toEqual([
        { id: "1", start: 0, end: 1, text: "New subtitle" },
      ]);
    });
    expect(sessionStorage.getItem("mediaflow:pending_file")).toBeNull();
  });
});
