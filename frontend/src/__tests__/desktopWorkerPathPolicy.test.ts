import { describe, expect, it } from "vitest";

import {
  resolveDesktopWorkerPayloadPathIntent,
  visitDesktopWorkerPayloadPaths,
} from "../contracts/desktopWorkerPathPolicy";

describe("desktop worker path policy", () => {
  it("classifies worker output targets as write paths", () => {
    expect(resolveDesktopWorkerPayloadPathIntent("output_path")).toBe("write");
    expect(resolveDesktopWorkerPayloadPathIntent("output_dir")).toBe("write");
    expect(resolveDesktopWorkerPayloadPathIntent("default_download_path")).toBe("write");
  });

  it("keeps input and generic payload paths as read paths", () => {
    expect(resolveDesktopWorkerPayloadPathIntent("video_path")).toBe("read");
    expect(resolveDesktopWorkerPayloadPathIntent("srt_path")).toBe("read");
    expect(resolveDesktopWorkerPayloadPathIntent("watermark_path")).toBe("read");
    expect(resolveDesktopWorkerPayloadPathIntent("path")).toBe("read");
  });

  it("visits nested payload paths with their access intent", () => {
    const paths: Array<{ key: string; path: string; intent: string }> = [];

    visitDesktopWorkerPayloadPaths(
      {
        video_ref: { path: "D:/workspace/source.mp4" },
        output_path: "C:/Users/Lenovo/Downloads/out.mp4",
        options: { subtitle: { fontName: "Arial" } },
      },
      (entry) => paths.push(entry),
    );

    expect(paths).toEqual([
      { key: "path", path: "D:/workspace/source.mp4", intent: "read" },
      { key: "output_path", path: "C:/Users/Lenovo/Downloads/out.mp4", intent: "write" },
    ]);
  });
});
