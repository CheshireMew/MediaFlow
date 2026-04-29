import { describe, expect, it } from "vitest";

import {
  resolveDesktopWorkerPayloadPathIntent,
  visitDesktopWorkerPayloadPaths,
} from "../contracts/desktopWorkerPathPolicy";

describe("desktop worker path policy", () => {
  it("classifies worker output targets as write paths", () => {
    expect(resolveDesktopWorkerPayloadPathIntent("output_dir")).toBe("write");
    expect(resolveDesktopWorkerPayloadPathIntent("default_download_path")).toBe("write");
  });

  it("keeps utility file payload paths as read paths", () => {
    expect(resolveDesktopWorkerPayloadPathIntent("file_path")).toBe("read");
    expect(resolveDesktopWorkerPayloadPathIntent("faster_whisper_cli_path")).toBe("read");
  });

  it("visits nested payload paths with their access intent", () => {
    const paths: Array<{ key: string; path: string; intent: string }> = [];

    visitDesktopWorkerPayloadPaths(
      {
        video_ref: { path: "D:/workspace/source.mp4" },
        output_ref: {
          path: "C:/Users/Lenovo/Downloads/out.mp4",
          role: "output",
        },
        options: { subtitle: { fontName: "Arial" } },
      },
      (entry) => paths.push(entry),
    );

    expect(paths).toEqual([
      { key: "media_ref.path", path: "D:/workspace/source.mp4", intent: "read" },
      { key: "media_ref.path", path: "C:/Users/Lenovo/Downloads/out.mp4", intent: "write" },
    ]);
  });
});
