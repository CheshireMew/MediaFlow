/* @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPreview } from "../components/editor/VideoPreview";

describe("VideoPreview playback rate menu", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets editor video playback to 2.5x and 3x", () => {
    const videoRef = React.createRef<HTMLVideoElement>();

    render(
      <VideoPreview
        mediaUrl="file:///D:/video.mp4"
        videoRef={videoRef}
        regions={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "播放速度" }));
    fireEvent.click(
      within(screen.getByRole("menu", { name: "播放速度" })).getByRole(
        "menuitemradio",
        { name: "2.5" },
      ),
    );

    expect(videoRef.current?.playbackRate).toBe(2.5);

    fireEvent.click(screen.getByRole("button", { name: "播放速度" }));
    fireEvent.click(
      within(screen.getByRole("menu", { name: "播放速度" })).getByRole(
        "menuitemradio",
        { name: "3" },
      ),
    );
    expect(videoRef.current?.playbackRate).toBe(3);
  });
});
