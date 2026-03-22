import { describe, expect, it } from "vitest";
import {
  createDesktopDownloadSubmissionPayload,
  resolveDownloadStepParams,
} from "../services/domain/executionService";
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

  it("builds the desktop submission payload from the normalized download step", () => {
    expect(
      createDesktopDownloadSubmissionPayload(pipeline, {
        default_download_path: "E:/downloads",
        auto_execute_flow: true,
        transcription_model: "base",
        translation_target_language: "Chinese",
      }),
    ).toEqual({
      url: "https://example.com/video",
      filename: "Sample Video",
      resolution: "1080p",
      output_dir: "E:/downloads",
      auto_execute_flow: true,
      transcription_model: "base",
      target_language: "Chinese",
      device: "cpu",
    });
  });
});
