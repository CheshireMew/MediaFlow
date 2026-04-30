import { describe, expect, it } from "vitest";
import { resolveDownloadStepParams } from "../services/domain/executionService";
import type { PipelineRequest } from "../types/api";

describe("download submission", () => {
  const pipeline: PipelineRequest = {
    pipeline_id: "downloader_tool",
    task_name: "Sample Video",
    steps: [
      {
        step_name: "download",
        params: {
          url: "https://example.com/video",
          filename: "Sample Video",
          resolution: "1080p",
        },
      },
    ],
  };

  it("resolves download step params from the explicit download step", () => {
    expect(resolveDownloadStepParams(pipeline)).toEqual({
      url: "https://example.com/video",
      filename: "Sample Video",
      resolution: "1080p",
    });
  });
});
