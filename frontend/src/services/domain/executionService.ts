import type { PipelineRequest } from "../../types/api";
import type { SubtitleSegment } from "../../types/task";
import type { MediaReference } from "../ui/mediaReference";
import type { ExecutionOutcome } from "./taskSubmission";
import {
  getExecutionMediaDisplayName,
  requireExecutionMediaReference,
} from "./executionPayload";
import {
  ensureAiTranslationConfigured,
  ensureCliTranscriptionConfigured,
} from "./executionAccess";
import { settingsService } from "./settingsService";
import {
  executeDesktopTaskSubmission,
} from "./executionExecutor";
import { restoreStoredAsrExecutionPreferences } from "../persistence/asrExecutionPreferences";
import { restoreStoredTranslationPreferences } from "../persistence/translationPreferences";
import {
  restoreStoredSynthesisExecutionPreferences,
} from "../persistence/synthesisExecutionPreferences";
import {
  buildSynthesisOptionsFromPreferences,
  resolveSynthesisWatermarkPath,
} from "./synthesisExecution";

export { isDesktopRuntime } from "../desktop";

type DownloadExecutionSettings = {
  default_download_path: string | null;
  auto_execute_flow: boolean;
};

type DownloadStepParams = {
  url?: string;
  [key: string]: unknown;
};

function omitUndefinedFields<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as T;
}

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

function appendAutoExecutionSteps(
  pipeline: PipelineRequest,
  stepFactory: () => Array<PipelineRequest["steps"][number]>,
) {
  if (pipeline.steps.length !== 1) {
    return pipeline;
  }

  return {
    ...pipeline,
    steps: [...pipeline.steps, ...stepFactory()],
  };
}

async function buildSharedSynthesisExecutionPayload() {
  const synthesisPreferences = restoreStoredSynthesisExecutionPreferences();
  return {
    options: buildSynthesisOptionsFromPreferences(synthesisPreferences),
    watermarkPath: await resolveSynthesisWatermarkPath(synthesisPreferences),
  };
}

async function buildSharedAutoExecutionSteps(includeTranscription: boolean) {
  const asrPreferences = restoreStoredAsrExecutionPreferences();
  const translationPreferences = restoreStoredTranslationPreferences();
  const synthesisPayload = await buildSharedSynthesisExecutionPayload();
  const steps: Array<PipelineRequest["steps"][number]> = [];

  if (includeTranscription) {
    steps.push({
      step_name: "transcribe",
      params: {
        engine: asrPreferences.engine,
        model: asrPreferences.model,
        device: asrPreferences.device,
        vad_filter: true,
      },
    });
  }

  steps.push({
    step_name: "translate",
    params: {
      target_language: translationPreferences.targetLanguage,
      mode: translationPreferences.mode,
    },
  });
  steps.push({
    step_name: "synthesize",
    params: {
      options: synthesisPayload.options,
      watermark_path: synthesisPayload.watermarkPath,
    },
  });

  return {
    asrPreferences,
    translationPreferences,
    synthesisPayload,
    steps,
  };
}

export async function createDesktopDownloadSubmissionPayload(
  pipeline: PipelineRequest,
  settings?: DownloadExecutionSettings,
) {
  const autoExecution = settings?.auto_execute_flow
    ? await buildSharedAutoExecutionSteps(false)
    : null;
  return omitUndefinedFields({
    ...resolveDownloadStepParams(pipeline),
    output_dir: settings?.default_download_path || undefined,
    auto_execute_flow: settings?.auto_execute_flow,
    transcription_engine: autoExecution?.asrPreferences.engine,
    transcription_model: autoExecution?.asrPreferences.model,
    translation_mode: autoExecution?.translationPreferences.mode,
    target_language: autoExecution?.translationPreferences.targetLanguage,
    device: autoExecution?.asrPreferences.device,
    synthesis_options: autoExecution?.synthesisPayload.options,
    watermark_path: autoExecution?.synthesisPayload.watermarkPath,
  });
}

export const executionService = {
  async transcribe(payload: {
    audio_ref: MediaReference;
    engine?: "builtin" | "cli";
    model: string;
    device: string;
    language?: string | null;
    initial_prompt?: string | null;
  }): Promise<ExecutionOutcome> {
    await ensureCliTranscriptionConfigured(payload.engine);

    return await executeDesktopTaskSubmission({
      payload,
      normalizePayload: (nextPayload) => ({
        ...nextPayload,
        audio_ref: requireExecutionMediaReference(nextPayload.audio_ref, "Transcription audio"),
      }),
      desktopMethod: "desktopTranscribe",
      desktopUnavailableMessage: "Desktop transcription worker is unavailable.",
      desktopTaskIdPrefix: "desktop-transcribe",
      backendSubmit: async (normalizedPayload) => {
        const settings = await settingsService.getSettings();
        const autoExecution = settings.auto_execute_flow
          ? await buildSharedAutoExecutionSteps(false)
          : null;
        const basePipelineReq: PipelineRequest = {
          pipeline_id: "transcriber_tool",
          task_name: `Transcribe ${getExecutionMediaDisplayName({
            reference: normalizedPayload.audio_ref ?? null,
            defaultName: "media",
          })}`,
          steps: [
            {
              step_name: "transcribe",
              params: omitUndefinedFields({
                audio_ref: normalizedPayload.audio_ref ?? null,
                engine: normalizedPayload.engine ?? "builtin",
                model: normalizedPayload.model,
                device: normalizedPayload.device,
                vad_filter: true,
                language: normalizedPayload.language,
                initial_prompt: normalizedPayload.initial_prompt,
              }),
            },
          ],
        };
        const pipelineReq =
          settings.auto_execute_flow
            ? appendAutoExecutionSteps(basePipelineReq, () => autoExecution?.steps ?? [])
            : basePipelineReq;

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
    context_ref?: MediaReference | null;
  }): Promise<ExecutionOutcome> {
    await ensureAiTranslationConfigured();

    return await executeDesktopTaskSubmission({
      payload,
      normalizePayload: (nextPayload) => ({
        ...nextPayload,
        context_ref: nextPayload.context_ref ?? null,
      }),
      desktopMethod: "desktopTranslate",
      desktopUnavailableMessage: "Desktop translation worker is unavailable.",
      desktopTaskIdPrefix: "desktop-translate",
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
    task_id?: string;
    video_ref: MediaReference;
    srt_ref: MediaReference;
    watermark_path?: string | null;
    output_ref?: MediaReference | null;
    options: Record<string, unknown>;
  }): Promise<ExecutionOutcome> {
    return await executeDesktopTaskSubmission({
      payload,
      normalizePayload: (nextPayload) => ({
        ...nextPayload,
        video_ref: requireExecutionMediaReference(nextPayload.video_ref, "Synthesis video"),
        srt_ref: requireExecutionMediaReference(nextPayload.srt_ref, "Synthesis subtitle"),
        output_ref: nextPayload.output_ref ?? null,
      }),
      desktopMethod: "desktopSynthesize",
      desktopUnavailableMessage: "Desktop synthesis worker is unavailable.",
      desktopTaskIdPrefix: "desktop-synthesize",
      backendSubmit: (normalizedPayload) =>
        import("../../api/client").then(({ apiClient }) =>
          apiClient.synthesizeVideo(omitUndefinedFields({
            video_ref: normalizedPayload.video_ref,
            srt_ref: normalizedPayload.srt_ref,
            watermark_path: normalizedPayload.watermark_path || null,
            output_ref: normalizedPayload.output_ref,
            options: normalizedPayload.options,
          })),
        ),
    });
  },

  async download(
    pipeline: PipelineRequest,
    settings?: DownloadExecutionSettings,
    taskId?: string,
  ): Promise<ExecutionOutcome> {
    const autoExecution = settings?.auto_execute_flow
      ? await buildSharedAutoExecutionSteps(true)
      : null;
    const pipelineForSubmission =
      settings?.auto_execute_flow
        ? appendAutoExecutionSteps(pipeline, () => autoExecution?.steps ?? [])
        : pipeline;

    return await executeDesktopTaskSubmission({
      payload: {
        pipeline: pipelineForSubmission,
        desktopPayload: await createDesktopDownloadSubmissionPayload(pipeline, settings),
      },
      normalizePayload: ({ pipeline: nextPipeline, desktopPayload }) => ({
        pipeline: nextPipeline,
        desktopPayload,
        task_id: taskId ?? null,
      }),
      desktopMethod: "desktopDownload",
      desktopUnavailableMessage: "Desktop download worker is unavailable.",
      desktopTaskIdPrefix: "desktop-download",
      mapDesktopArgs: (normalizedPayload, taskId) =>
        [{ task_id: taskId, ...normalizedPayload.desktopPayload }],
      backendSubmit: ({ pipeline: nextPipeline }) =>
        import("../../api/client").then(({ apiClient }) => apiClient.runPipeline(nextPipeline)),
    });
  },
};
