import { describe, expect, it } from "vitest";
import {
  formatMediaPlaybackTime,
  formatOptionalMediaPlaybackTime,
} from "../utils/mediaTime";

describe("mediaTime", () => {
  it("formats playback time as minutes and seconds", () => {
    expect(formatMediaPlaybackTime(0)).toBe("0:00");
    expect(formatMediaPlaybackTime(9.8)).toBe("0:09");
    expect(formatMediaPlaybackTime(124.8)).toBe("2:04");
    expect(formatMediaPlaybackTime(3661.2)).toBe("61:01");
  });

  it("formats missing optional playback time as a placeholder", () => {
    expect(formatOptionalMediaPlaybackTime(0)).toBe("--:--");
    expect(formatOptionalMediaPlaybackTime(Number.NaN)).toBe("--:--");
    expect(formatOptionalMediaPlaybackTime(75.5)).toBe("1:15");
  });
});
