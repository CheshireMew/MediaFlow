import { describe, expect, it } from "vitest";
import {
  createDesktopDownloadSubmissionPayload,
  resolveDownloadStepParams,
} from "../services/domain/executionService";
import { DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES } from "../services/persistence/synthesisExecutionPreferences";
import type { PipelineRequest } from "../types/api";
import { seedJapaneseCudaExecutionPreferences } from "./testFixtures";

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

  it("builds the desktop submission payload from the shared execution preferences", async () => {
    seedJapaneseCudaExecutionPreferences({ model: "large-v3" });
    localStorage.setItem(
      "synthesis_execution_preferences",
      JSON.stringify({
        schema_version: 1,
        payload: {
          ...DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES,
          subtitleEnabled: true,
          watermarkEnabled: false,
          quality: "high",
          useGpu: false,
          lastOutputDir: "E:/renders",
        },
      }),
    );

    expect(
      await createDesktopDownloadSubmissionPayload(pipeline, {
        default_download_path: "E:/downloads",
        auto_execute_flow: true,
      }),
    ).toEqual({
      url: "https://example.com/video",
      filename: "Sample Video",
      resolution: "1080p",
      output_dir: "E:/downloads",
      auto_execute_flow: true,
      transcription_engine: "builtin",
      transcription_model: "large-v3",
      translation_mode: "intelligent",
      target_language: "Japanese",
      device: "cuda",
      synthesis_options: expect.objectContaining({
        crf: 17,
        preset: "slow",
        use_gpu: false,
        target_resolution: "original",
        subtitle_position_y: 0.9,
      }),
      watermark_path: null,
    });
  });
});
