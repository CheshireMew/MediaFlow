import { fireEvent, render, screen } from "@testing-library/react";
import type { RefObject } from "react";
import { describe, expect, it, vi } from "vitest";
import { VideoControlBar } from "../components/preprocessing/VideoControlBar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("VideoControlBar", () => {
  it("exposes keyboard-operable seek and volume controls", () => {
    const video = document.createElement("video");
    const videoRef = { current: video } as RefObject<HTMLVideoElement>;

    render(
      <VideoControlBar
        videoRef={videoRef}
        currentTime={25}
        duration={100}
      />,
    );

    const seek = screen.getByRole("slider", { name: "player.seek" });
    fireEvent.change(seek, { target: { value: "50" } });

    expect(video.currentTime).toBe(50);
    expect(screen.getByRole("slider", { name: "player.volume" })).toBeVisible();
    expect(screen.getByRole("button", { name: "player.play" })).toBeVisible();
    expect(screen.getByRole("button", { name: "player.mute" })).toBeVisible();
  });
});
