import { describe, expect, it, vi } from "vitest";

import { stopVideoAtClipEnd } from "../utils/clipPlayback";

function videoAt(currentTime: number, duration = 10) {
  return {
    currentTime,
    duration,
    pause: vi.fn(),
  } as unknown as HTMLVideoElement;
}

describe("stopVideoAtClipEnd", () => {
  it("keeps playback running before the selected clip ends", () => {
    const video = videoAt(3.5);

    expect(stopVideoAtClipEnd(video, 4)).toBe(false);
    expect(video.pause).not.toHaveBeenCalled();
  });

  it("pauses and seeks back to the exact clip boundary after an overshoot", () => {
    const video = videoAt(4.2);

    expect(stopVideoAtClipEnd(video, 4)).toBe(true);
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.currentTime).toBe(4);
  });
});
