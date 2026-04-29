import { describe, expect, it } from "vitest";
import { resolveMediaInputPath } from "../services/domain/mediaInput";

describe("resolveMediaInputPath", () => {
  it("uses canonical media refs before execution paths", () => {
    expect(
      resolveMediaInputPath(
        {
          path: "E:/workspace/demo.srt",
          ref: {
            path: "E:/canonical/demo.srt",
            name: "demo.srt",
          },
        },
        "Translation context",
      ),
    ).toBe("E:/canonical/demo.srt");
  });

  it("uses the execution path when no ref is available", () => {
    expect(
      resolveMediaInputPath(
        {
          path: "E:/workspace/demo.mp4",
        },
        "Preprocessing video",
      ),
    ).toBe("E:/workspace/demo.mp4");
  });

  it("accepts ref-only inputs without requiring an execution path", () => {
    expect(
      resolveMediaInputPath(
        {
          ref: {
            path: "E:/canonical/ref-only.mp4",
            name: "ref-only.mp4",
          },
        },
        "Synthesis video",
      ),
    ).toBe("E:/canonical/ref-only.mp4");
  });
});
