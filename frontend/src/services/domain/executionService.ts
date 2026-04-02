import type { PipelineRequest } from "../../types/api";
import type { SubtitleSegment } from "../../types/task";
import type { TranscribeResult } from "../../types/transcriber";
import type { MediaReference } from "../ui/mediaReference";
import type { ExecutionOutcome } from "./taskSubmission";
import {
  getExecutionMediaDisplayName,
  prepareExecutionPayload,
} from "./executionPayload";
import {
  ensureAiTranslationConfigured,
  ensureCliTranscriptionConfigured,
} from "./executionAccess";
import {
  executeDesktopDirectResult,
  executeDesktopTaskSubmission,
} from "./executionExecutor";

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
    engine?: "builtin" | "cli";
    model: string;
    device: string;
    language?: string | null;
    initial_prompt?: string | null;
  }): Promise<ExecutionOutcome<TranscribeResult>> {
    await ensureCliTranscriptionConfigured(payload.engine);

    return await executeDesktopDirectResult({
      payload,
      normalizePayload: (nextPayload) =>
        prepareExecutionPayload({
          payload: nextPayload,
          specs: [
            {
              pathKey: "audio_path",
              refKey: "audio_ref",
              label: "Transcription audio",
              required: true,
            },
          ],
        }),
      desktopMethod: "desktopTranscribe",
      desktopUnavailableMessage: "Desktop transcription worker is unavailable.",
      backendSubmit: async (normalizedPayload) => {
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
                engine: normalizedPayload.engine ?? "builtin",
                model: normalizedPayload.model,
                device: normalizedPayload.device,
                vad_filter: true,
                language: normalizedPayload.language,
                initial_prompt: normalizedPayload.initial_prompt,
              },
            },
          ],
        };

        return await import("../../api/client").then(({ apiClient }) =>
          apiClient.runPipeline(pipelineReq),
        );
      },
    });
  },

  async translate(payload: {
    segments: SubtitleSegment[];
    target_language: string;
    mode: "standard" | "intelligent" | "proofread";
    context_path?: string | null;
    context_ref?: MediaReference | null;
  }): Promise<ExecutionOutcome<import("../../types/api").TranslateResponse>> {
    await ensureAiTranslationConfigured();

    return await executeDesktopDirectResult({
      payload,
      normalizePayload: (nextPayload) =>
        prepareExecutionPayload({
          payload: nextPayload,
          specs: [
            {
              pathKey: "context_path",
              refKey: "context_ref",
              label: "Translation context",
            },
          ],
        }),
      desktopMethod: "desktopTranslate",
      desktopUnavailableMessage: "Desktop translation worker is unavailable.",
      backendSubmit: async (normalizedPayload) => {
        const { translationService } = await import("./translationService");
        const response = await translationService.startTranslation(normalizedPayload);
        return {
          task_id: response.task_id,
          status: response.status ?? "pending",
          message: undefined,
        };
      },
    });
  },

  async synthesize(payload: {
    video_path?: string | null;
    video_ref?: MediaReference | null;
    srt_path?: string | null;
    srt_ref?: MediaReference | null;
    watermark_path?: string | null;
    output_path?: string | null;
    options: Record<string, unknown>;
  }): Promise<ExecutionOutcome<never>> {
    return await executeDesktopTaskSubmission({
      payload,
      normalizePayload: (nextPayload) =>
        prepareExecutionPayload({
          payload: nextPayload,
          specs: [
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
          ],
        }),
      desktopMethod: "desktopSynthesize",
      desktopUnavailableMessage: "Desktop synthesis worker is unavailable.",
      desktopTaskIdPrefix: "desktop-synthesize",
      desktopSubmissionMessage: "Synthesis started",
      desktopFailureLogLabel: "Desktop synthesis failed",
      backendSubmit: (normalizedPayload) =>
        import("../../api/client").then(({ apiClient }) =>
          apiClient.synthesizeVideo({
            video_path: normalizedPayload.video_path,
            video_ref: normalizedPayload.video_ref,
            srt_path: normalizedPayload.srt_path,
            srt_ref: normalizedPayload.srt_ref,
            watermark_path: normalizedPayload.watermark_path || null,
            output_path: normalizedPayload.output_path,
            options: normalizedPayload.options,
          }),
        ),
    });
  },

  async download(
    pipeline: PipelineRequest,
    settings?: DownloadExecutionSettings,
  ): Promise<ExecutionOutcome<never>> {
    return await executeDesktopTaskSubmission({
      payload: {
        pipeline,
        desktopPayload: createDesktopDownloadSubmissionPayload(pipeline, settings),
      },
      normalizePayload: ({ pipeline: nextPipeline, desktopPayload }) => ({
        pipeline: nextPipeline,
        desktopPayload,
        task_id: null,
      }),
      desktopMethod: "desktopDownload",
      desktopUnavailableMessage: "Desktop download worker is unavailable.",
      desktopTaskIdPrefix: "desktop-download",
      desktopSubmissionMessage: "Download task started",
      desktopFailureLogLabel: "Desktop download failed",
      mapDesktopArgs: (normalizedPayload, taskId) =>
        [{ task_id: taskId, ...normalizedPayload.desktopPayload }],
      backendSubmit: ({ pipeline: nextPipeline }) =>
        import("../../api/client").then(({ apiClient }) => apiClient.runPipeline(nextPipeline)),
    });
  },
};
