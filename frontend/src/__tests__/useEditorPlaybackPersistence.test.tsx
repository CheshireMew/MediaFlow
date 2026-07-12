import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorPlaybackPersistence } from "../hooks/editor/useEditorPlaybackPersistence";
import {
  readWorkspaceStateValue,
  resetWorkspaceStateForTests,
  writeWorkspaceStateValue,
} from "../services/persistence/workspaceState";

describe("useEditorPlaybackPersistence", () => {
  beforeEach(() => {
    localStorage.clear();
    resetWorkspaceStateForTests();
    vi.useFakeTimers();
  });

  it("restores the saved playback time from the versioned snapshot on metadata load", () => {
    const filePath = "C:\\video.mp4";
    const video = { path: filePath, name: "video.mp4" };
    writeWorkspaceStateValue("editor-playback-history", {
      [filePath]: { currentTime: 18.4, updatedAt: 1 },
    });

    const videoElement = {
      currentTime: 0,
      duration: 120,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement;
    const videoRef = {
      current: videoElement,
    } as React.RefObject<HTMLVideoElement | null>;

    const { result, unmount } = renderHook(() =>
      useEditorPlaybackPersistence({
        video,
        videoRef,
      }),
    );

    act(() => {
      result.current.handleLoadedMetadata();
    });

    expect(videoElement.currentTime).toBe(18.4);

    unmount();
    vi.useRealTimers();
  });

  it("persists playback progress in the bounded workspace history", () => {
    const filePath = "C:\\video.mp4";
    const video = { path: filePath, name: "video.mp4" };
    let pauseHandler: (() => void) | null = null;
    const videoElement = {
      currentTime: 24.6,
      duration: 120,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "pause") {
          pauseHandler = handler;
        }
      }),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement;
    const videoRef = {
      current: videoElement,
    } as React.RefObject<HTMLVideoElement | null>;

    const { unmount } = renderHook(() =>
      useEditorPlaybackPersistence({
        video,
        videoRef,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(5000);
      pauseHandler?.();
    });

    expect(
      readWorkspaceStateValue<Record<string, unknown>>("editor-playback-history")?.[
        filePath
      ],
    ).toBeTruthy();

    unmount();
    vi.useRealTimers();
  });

  it("binds playback rate persistence when the video element appears after the hook mounts", () => {
    const filePath = "C:\\late-video.mp4";
    const video = { path: filePath, name: "late-video.mp4" };
    let rateChangeHandler: (() => void) | null = null;
    const videoElement = {
      currentTime: 0,
      duration: 120,
      playbackRate: 1,
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "ratechange") {
          rateChangeHandler = handler;
        }
      }),
      removeEventListener: vi.fn(),
    } as unknown as HTMLVideoElement;
    const videoRef = {
      current: null,
    } as React.RefObject<HTMLVideoElement | null>;

    const { result, unmount } = renderHook(() =>
      useEditorPlaybackPersistence({
        video,
        videoRef,
      }),
    );

    videoRef.current = videoElement;

    act(() => {
      result.current.handleLoadedMetadata();
      videoElement.playbackRate = 2.5;
      rateChangeHandler?.();
    });

    expect(readWorkspaceStateValue<string>("editor_playback_rate")).toContain(
      "\"playbackRate\":2.5",
    );

    unmount();
    vi.useRealTimers();
  });
});
