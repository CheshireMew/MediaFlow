import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorPlaybackPersistence } from "../hooks/editor/useEditorPlaybackPersistence";

describe("useEditorPlaybackPersistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  it("restores the saved playback time from the versioned snapshot on metadata load", () => {
    const filePath = "C:\\video.mp4";
    localStorage.setItem(
      `editor_playback_snapshot_${filePath}`,
      JSON.stringify({
        schema_version: 1,
        lifecycle: {
          currentTime: "history-only",
        },
        payload: {
          currentTime: 18.4,
        },
      }),
    );

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
        currentFilePath: filePath,
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

  it("persists playback progress as a versioned snapshot", () => {
    const filePath = "C:\\video.mp4";
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
        currentFilePath: filePath,
        videoRef,
      }),
    );

    act(() => {
      vi.advanceTimersByTime(5000);
      pauseHandler?.();
    });

    expect(
      localStorage.getItem(`editor_playback_snapshot_${filePath}`),
    ).toBeTruthy();

    unmount();
    vi.useRealTimers();
  });
});
