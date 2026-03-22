import { apiClient } from "../../api/client";
import type { PipelineRequest } from "../../types/api";
import type { SubtitleSegment } from "../../types/task";
import { isDesktopRuntime, requireDesktopApiMethod } from "../desktop/bridge";
import type { TranscribeResult } from "../../types/transcriber";
import type { MediaReference } from "../ui/mediaReference";
import {
  createDesktopTaskSubmissionReceipt,
  createDirectExecutionResult,
  createTaskExecutionSubmissionReceipt,
  type DirectExecutionResult,
  type TaskExecutionSubmission,
} from "./taskSubmission";
import {
  getExecutionMediaDisplayName,
  normalizeExecutionPayload,
} from "./executionPayload";

export { isDesktopRuntime } from "../desktop/bridge";

type DownloadExecutionSettings = {
  default_download_path: string | null;
  auto_execute_flow: boolean;
  transcription_model: string;
  translation_target_language: string;
};

type DownloadStepParams = {
  url?: string;
  [key: string]: unknown;
};

export function resolveDownloadStepParams(pipeline: PipelineRequest) {
  const downloadStep = pipeline.steps.find((step) => step.step_name === "download");
  if (!downloadStep || !downloadStep.params || typeof downloadStep.params !== "object") {
    throw new Error("Download pipeline is missing a download step");
  }

  const params = downloadStep.params as DownloadStepParams;
  if (typeof params.url !== "string" || !params.url.trim()) {
    throw new Error("Download pipeline is missing a download url");
  }

  return params;
}

export function createDesktopDownloadSubmissionPayload(
  pipeline: PipelineRequest,
  settings?: DownloadExecutionSettings,
) {
  return {
    ...resolveDownloadStepParams(pipeline),
    output_dir: settings?.default_download_path || undefined,
    auto_execute_flow: settings?.auto_execute_flow,
    transcription_model: settings?.transcription_model,
    target_language: settings?.translation_target_language,
    device: "cpu",
  };
}

export const executionService = {
  async transcribe(payload: {
    audio_path?: string | null;
    audio_ref?: MediaReference | null;
    model: string;
    device: string;
    language?: string | null;
    initial_prompt?: string | null;
  }): Promise<TaskExecutionSubmission | DirectExecutionResult<TranscribeResult>> {
    const normalizedPayload = normalizeExecutionPayload(payload, [
      {
        pathKey: "audio_path",
        refKey: "audio_ref",
        label: "Transcription audio",
        required: true,
      },
    ]);

    if (isDesktopRuntime()) {
      const result = await requireDesktopApiMethod(
        "desktopTranscribe",
        "Desktop transcription worker is unavailable.",
      )(normalizedPayload);
      return createDirectExecutionResult(result);
    }

    const pipelineReq: PipelineRequest = {
      pipeline_id: "transcriber_tool",
      task_name: `Transcribe ${getExecutionMediaDisplayName({
        reference: normalizedPayload.audio_ref ?? null,
        path: normalizedPayload.audio_path ?? null,
        fallbackName: "media",
      })}`,
      steps: [
        {
          step_name: "transcribe",
          params: {
            audio_path: normalizedPayload.audio_path,
            audio_ref: normalizedPayload.audio_ref ?? null,
            model: normalizedPayload.model,
            device: normalizedPayload.device,
            vad_filter: true,
            language: normalizedPayload.language,
            initial_prompt: normalizedPayload.initial_prompt,
          },
        },
      ],
    };

    return createTaskExecutionSubmissionReceipt(
      await apiClient.runPipeline(pipelineReq),
      "backend",
    );
  },

  async translate(payload: {
    segments: SubtitleSegment[];
    target_language: string;
    mode: "standard" | "intelligent" | "proofread";
    context_path?: string | null;
    context_ref?: MediaReference | null;
  }): Promise<TaskExecutionSubmission | DirectExecutionResult<import("../../types/api").TranslateResponse>> {
    const normalizedPayload = normalizeExecutionPayload(payload, [
      {
        pathKey: "context_path",
        refKey: "context_ref",
        label: "Translation context",
      },
    ]);

    if (isDesktopRuntime()) {
      const result = await requireDesktopApiMethod(
        "desktopTranslate",
        "Desktop translation worker is unavailable.",
      )(normalizedPayload);
      return createDirectExecutionResult(result);
    }

    const { translationService } = await import("./translationService");
    const response = await translationService.startTranslation(normalizedPayload);
    return createTaskExecutionSubmissionReceipt(
      {
        task_id: response.task_id,
        status: response.status ?? "pending",
        message: undefined,
      },
      "backend",
    );
  },

  async synthesize(payload: {
    video_path?: string | null;
    video_ref?: MediaReference | null;
    srt_path?: string | null;
    srt_ref?: MediaReference | null;
    watermark_path?: string | null;
    output_path?: string | null;
    options: Record<string, unknown>;
  }): Promise<TaskExecutionSubmission> {
    const normalizedPayload = normalizeExecutionPayload(payload, [
      {
        pathKey: "video_path",
        refKey: "video_ref",
        label: "Synthesis video",
        required: true,
      },
      {
        pathKey: "srt_path",
        refKey: "srt_ref",
        label: "Synthesis subtitle",
        required: true,
      },
    ]);

    if (isDesktopRuntime()) {
      const taskId = `desktop-synthesize-${Date.now()}`;
      void requireDesktopApiMethod(
        "desktopSynthesize",
        "Desktop synthesis worker is unavailable.",
      )({
        task_id: taskId,
        ...normalizedPayload,
      }).catch((error) => {
        console.error("Desktop synthesis failed", error);
      });
      return createDesktopTaskSubmissionReceipt(taskId, "Synthesis started");
    }

    return createTaskExecutionSubmissionReceipt(
      await apiClient.synthesizeVideo({
        video_path: normalizedPayload.video_path,
        video_ref: normalizedPayload.video_ref,
        srt_path: normalizedPayload.srt_path,
        srt_ref: normalizedPayload.srt_ref,
        watermark_path: normalizedPayload.watermark_path || null,
        output_path: normalizedPayload.output_path,
        options: normalizedPayload.options,
      }),
      "backend",
    );
  },

  async download(
    pipeline: PipelineRequest,
    settings?: DownloadExecutionSettings,
  ): Promise<TaskExecutionSubmission> {
    if (isDesktopRuntime()) {
      const taskId = `desktop-download-${Date.now()}`;
      void requireDesktopApiMethod(
        "desktopDownload",
        "Desktop download worker is unavailable.",
      )({
        task_id: taskId,
        ...createDesktopDownloadSubmissionPayload(pipeline, settings),
      }).catch((error) => {
        console.error("Desktop download failed", error);
      });

      return createDesktopTaskSubmissionReceipt(taskId, "Download task started");
    }

    return createTaskExecutionSubmissionReceipt(
      await apiClient.runPipeline(pipeline),
      "backend",
    );
  },
};
