/* @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditorShortcuts } from "../hooks/editor/useEditorShortcuts";

describe("useEditorShortcuts", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("skips playback shortcuts while an editor textarea is focused", () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    const videoRef = {
      current: {
        paused: true,
        play,
        pause,
      } as unknown as HTMLVideoElement,
    };

    renderHook(() =>
      useEditorShortcuts({
        videoRef,
        selectedIds: [],
        activeSegmentId: "1",
        undo: vi.fn(),
        redo: vi.fn(),
        deleteSegments: vi.fn(),
        splitSegment: vi.fn(),
      }),
    );

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: " ",
        code: "Space",
        bubbles: true,
      }),
    );

    expect(play).not.toHaveBeenCalled();
    textarea.remove();
  });

  it("skips global shortcuts while IME composition is active", () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    const videoRef = {
      current: {
        paused: true,
        play,
        pause,
      } as unknown as HTMLVideoElement,
    };

    renderHook(() =>
      useEditorShortcuts({
        videoRef,
        selectedIds: [],
        activeSegmentId: "1",
        undo: vi.fn(),
        redo: vi.fn(),
        deleteSegments: vi.fn(),
        splitSegment: vi.fn(),
      }),
    );

    const event = new KeyboardEvent("keydown", {
      key: "Process",
      code: "Space",
      bubbles: true,
    });
    Object.defineProperty(event, "isComposing", {
      value: true,
      configurable: true,
    });

    window.dispatchEvent(event);

    expect(play).not.toHaveBeenCalled();
  });
});
