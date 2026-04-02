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

  it("builds the desktop submission payload from the shared execution preferences", async () => {
    localStorage.setItem(
      "asr_execution_preferences",
      JSON.stringify({
        schema_version: 1,
        payload: {
          engine: "builtin",
          model: "large-v3",
          device: "cuda",
        },
      }),
    );
    localStorage.setItem(
      "translation_preferences",
      JSON.stringify({
        schema_version: 2,
        payload: {
          targetLanguage: "Japanese",
          mode: "intelligent",
        },
      }),
    );
    localStorage.setItem(
      "synthesis_execution_preferences",
      JSON.stringify({
        schema_version: 1,
        payload: {
          subtitleEnabled: true,
          watermarkEnabled: false,
          quality: "high",
          useGpu: false,
          lastOutputDir: "E:/renders",
          subtitleStyle: {
            fontSize: 24,
            fontColor: "#FFFFFF",
            fontName: "Arial",
            isBold: false,
            isItalic: false,
            outlineSize: 2,
            shadowSize: 0,
            outlineColor: "#000000",
            bgEnabled: false,
            bgColor: "#000000",
            bgOpacity: 0.5,
            bgPadding: 5,
            alignment: 2,
            multilineAlign: "center",
            subPos: { x: 0.5, y: 0.9 },
            customPresets: [],
          },
          watermark: {
            wmScale: 0.2,
            wmOpacity: 0.8,
            wmPos: { x: 0.5, y: 0.5 },
          },
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
