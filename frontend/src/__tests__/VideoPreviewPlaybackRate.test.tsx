/* @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPreview } from "../components/editor/VideoPreview";

describe("VideoPreview playback rate menu", () => {
  let requestFullscreen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    requestFullscreen = vi.fn(() => Promise.resolve());
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets editor video playback to 2.5x and 3x", () => {
    const videoRef = React.createRef<HTMLVideoElement>();

    const { container } = render(
      <VideoPreview
        mediaUrl="file:///D:/video.mp4"
        videoRef={videoRef}
        regions={[]}
      />,
    );

    expect(container.querySelector("video")?.controls).toBe(false);
    expect(screen.getByRole("slider", { name: "播放进度" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "音量" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "全屏" })).toBeTruthy();

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

  it("toggles playback from the video frame and fullscreens the subtitle panel", () => {
    const videoRef = React.createRef<HTMLVideoElement>();

    const { container } = render(
      <VideoPreview
        mediaUrl="file:///D:/video.mp4"
        videoRef={videoRef}
        regions={[{ id: "1", start: 0, end: 10, text: "全屏字幕" }]}
      />,
    );

    const video = container.querySelector("video");
    expect(video).not.toBeNull();

    const play = vi.fn(() => Promise.resolve());
    Object.defineProperty(video, "paused", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(video, "play", {
      configurable: true,
      value: play,
    });
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      value: 1,
    });

    fireEvent.timeUpdate(video as HTMLVideoElement);
    expect(screen.getByText("全屏字幕")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "播放视频画面" }));
    expect(play).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "全屏" }));
    const panel = screen.getByTestId("editor-video-preview-panel");
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(requestFullscreen.mock.contexts[0]).toBe(panel);
    expect(panel).toContainElement(screen.getByText("全屏字幕"));
    expect(screen.getByTestId("editor-preview-subtitle")).toHaveClass("text-3xl");
  });
});
