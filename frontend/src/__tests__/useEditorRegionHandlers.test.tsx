/* @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEditorRegionHandlers } from "../hooks/editor/useEditorRegionHandlers";

const regions = [
  { id: "1", start: 1.25, end: 2.5, text: "hello" },
  { id: "2", start: 3, end: 4.5, text: "world" },
];

describe("useEditorRegionHandlers", () => {
  it("seeks the video when requested and selects the target segment", () => {
    const selectSegment = vi.fn();
    const updateRegion = vi.fn();
    const updateRegionText = vi.fn();
    const snapshot = vi.fn();
    const videoRef = {
      current: { currentTime: 0 } as HTMLVideoElement,
    };

    const { result } = renderHook(() =>
      useEditorRegionHandlers({
        regions,
        activeSegmentId: "1",
        selectSegment,
        updateRegion,
        updateRegionText,
        snapshot,
        videoRef,
      }),
    );

    act(() => {
      result.current.handleRegionClick("2", {
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
        seek: true,
      });
    });

    expect(selectSegment).toHaveBeenCalledWith("2", true, true);
    expect(videoRef.current.currentTime).toBe(3);
  });

  it("updates text without creating an undo snapshot, but snapshots numeric edits", () => {
    const selectSegment = vi.fn();
    const updateRegion = vi.fn();
    const updateRegionText = vi.fn();
    const snapshot = vi.fn();
    const videoRef = {
      current: null,
    };

    const { result } = renderHook(() =>
      useEditorRegionHandlers({
        regions,
        activeSegmentId: "1",
        selectSegment,
        updateRegion,
        updateRegionText,
        snapshot,
        videoRef,
      }),
    );

    act(() => {
      result.current.handleDetailUpdate("text", "updated");
    });

    expect(updateRegionText).toHaveBeenCalledWith("1", "updated");
    expect(snapshot).not.toHaveBeenCalled();

    act(() => {
      result.current.handleDetailUpdate("start", 0.5);
    });

    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(updateRegion).toHaveBeenCalledWith("1", { start: 0.5 });
  });
});
