import type {
  OCRExtractRequest,
  PipelineRequest,
  TranslateRequest,
} from "../../types/api";
import type { Task, TaskRequestParams, TaskType } from "../../types/task";
import {
  createTaskFromExecutionOutcome,
  executionService,
  preprocessingService,
  settingsService,
} from "../domain";
import type { ExecutionOutcome } from "../domain";
import { createMediaReference, type MediaReference } from "../ui/mediaReference";
import { fileService } from "../fileService";
import { parseSubtitleContent } from "../../utils/subtitleParser";

type RetryDescriptor = {
  type: TaskType;
  request_params: TaskRequestParams;
  name?: string;
  created_at?: number;
};

type RetrySubmission = {
  outcome: ExecutionOutcome<unknown>;
  descriptor: RetryDescriptor;
};

type TranslateMode = NonNullable<TranslateRequest["mode"]>;
type OcrEngine = OCRExtractRequest["engine"];

function getRequestParams(task: Task) {
  return task.request_params && typeof task.request_params === "object"
    ? (task.request_params as Record<string, unknown>)
    : null;
}

function getPipelineSteps(task: Task) {
  const params = getRequestParams(task);
  return Array.isArray(params?.steps) ? params.steps : [];
}

function getPipelineStep(task: Task, stepName: string) {
  return getPipelineSteps(task).find(
    (step) =>
      step &&
      typeof step === "object" &&
      ("step_name" in step || "action" in step) &&
      ((step as { step_name?: string }).step_name === stepName ||
        (step as { action?: string }).action === stepName),
  ) as { params?: Record<string, unknown> } | undefined;
}

function getStepParams(task: Task, stepName: string) {
  const step = getPipelineStep(task, stepName);
  return step?.params && typeof step.params === "object" ? step.params : null;
}

function createRetryDescriptor(
  type: TaskType,
  request_params: TaskRequestParams,
  name?: string,
  created_at?: number,
): RetryDescriptor {
  return {
    type,
    request_params,
    name,
    created_at,
  };
}

function resolveRetryTaskId(task: Task): string | undefined {
  return task.task_source === "desktop" ? task.id : undefined;
}

function isMediaReferenceCandidate(
  value: unknown,
): value is Partial<MediaReference> & { path: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "path" in value &&
      typeof (value as { path?: unknown }).path === "string",
  );
}

function isTranslateMode(value: unknown): value is TranslateMode {
  return value === "standard" || value === "intelligent" || value === "proofread";
}

function isOcrEngine(value: unknown): value is OcrEngine {
  return value === "rapid" || value === "paddle";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRoiTuple(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => isFiniteNumber(item))
  );
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toMediaReference(value: unknown, type?: string): MediaReference | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return createMediaReference({ path: value, type });
  }
  if (isMediaReferenceCandidate(value)) {
    const candidate = value;
    return createMediaReference({
      path: candidate.path,
      name: candidate.name,
      size: candidate.size,
      type: candidate.type ?? type,
      media_id: candidate.media_id,
      media_kind: candidate.media_kind,
      role: candidate.role,
      origin: candidate.origin,
    });
  }
  return null;
}

function getTaskMediaReference(params: Record<string, unknown>, keys: string[], type?: string) {
  for (const key of keys) {
    const ref = toMediaReference(params[key], type);
    if (ref) {
      return ref;
    }
  }
  return null;
}

function normalizeSynthesisTaskParams(task: Task) {
  const params = getRequestParams(task);
  if (!params) {
    return null;
  }

  const optionsFromParams = readRecord(params.options);
  const options =
    optionsFromParams ??
    Object.fromEntries(
      Object.entries(params).filter(
        ([key]) =>
          ![
            "__desktop_worker",
            "task_id",
            "video_ref",
            "video_path",
            "subtitle_ref",
            "srt_ref",
            "context_ref",
            "srt_path",
            "watermark_path",
            "output_path",
            "options",
          ].includes(key),
      ),
    );

  return {
    params,
    options,
    watermarkPath: readOptionalString(params.watermark_path),
    outputPath: readOptionalString(params.output_path),
  };
}

async function submitDownloadRetry(task: Task): Promise<RetrySubmission | null> {
  const params = getRequestParams(task);
  if (!params) {
    return null;
  }

  const steps = getPipelineSteps(task);
  const pipeline: PipelineRequest =
    steps.length > 0
      ? {
          pipeline_id: typeof params.pipeline_id === "string" ? params.pipeline_id : "downloader_tool",
          task_name: task.name,
          steps: steps as PipelineRequest["steps"],
        }
      : {
          pipeline_id: "downloader_tool",
          task_name: task.name,
          steps: [
            {
              step_name: "download",
              params: Object.fromEntries(
                Object.entries({
                  url: params.url,
                  proxy: params.proxy,
                  output_dir: params.output_dir,
                  playlist_title: params.playlist_title,
                  playlist_items: params.playlist_items,
                  download_subs: params.download_subs,
                  resolution: params.resolution,
                  cookie_file: params.cookie_file,
                  filename: params.filename,
                  local_source: params.local_source,
                  codec: params.codec,
                }).filter(([, value]) => value !== undefined),
              ),
            },
          ],
        };

  const downloadParams = pipeline.steps[0]?.params;
  if (!downloadParams || typeof downloadParams.url !== "string" || !downloadParams.url.trim()) {
    return null;
  }

  const settings = await settingsService.getSettings().catch(() => undefined);
  const outcome = await executionService.download(
    pipeline,
    settings,
    resolveRetryTaskId(task),
  );
  return {
    outcome,
    descriptor: createRetryDescriptor(
      "download",
      {
        steps: pipeline.steps,
        ...(pipeline.steps[0]?.params ?? {}),
      },
      task.name,
      task.created_at,
    ),
  };
}

async function submitTranscribeRetry(task: Task): Promise<RetrySubmission | null> {
  const stepParams = getStepParams(task, "transcribe");
  const params = stepParams ?? getRequestParams(task);
  if (!params) {
    return null;
  }

  const audioRef = getTaskMediaReference(params, ["audio_ref", "video_ref", "audio_path", "video_path"], "video/mp4");
  if (!audioRef?.path) {
    return null;
  }

  const engine = params.engine === "cli" ? "cli" : "builtin";
  const model = typeof params.model === "string" ? params.model : "base";
  const device = typeof params.device === "string" ? params.device : "cpu";
  const language = readOptionalString(params.language);
  const initialPrompt = readOptionalString(params.initial_prompt);

  const outcome = await executionService.transcribe({
    audio_path: null,
    audio_ref: audioRef,
    engine,
    model,
    device,
    language: language ?? null,
    initial_prompt: initialPrompt ?? null,
  });

  const request_params =
    task.type === "pipeline"
      ? {
          pipeline_id: "transcriber_tool",
          steps: [
            {
              step_name: "transcribe",
              params: {
                audio_path: null,
                audio_ref: audioRef,
                engine,
                model,
                device,
                vad_filter: params.vad_filter ?? true,
                language,
                initial_prompt: initialPrompt,
              },
            },
          ],
          video_ref: audioRef,
        }
      : {
          audio_ref: audioRef,
          engine: (params.engine as "builtin" | "cli" | undefined) ?? "builtin",
          model: typeof params.model === "string" ? params.model : "base",
          device: typeof params.device === "string" ? params.device : "cpu",
          language: typeof params.language === "string" ? params.language : undefined,
          initial_prompt: typeof params.initial_prompt === "string" ? params.initial_prompt : undefined,
        };

  return {
    outcome,
    descriptor: createRetryDescriptor(task.type, request_params, task.name, task.created_at),
  };
}

async function submitTranslateRetry(task: Task): Promise<RetrySubmission | null> {
  const params = getRequestParams(task);
  if (!params) {
    return null;
  }

  const contextRef = getTaskMediaReference(
    params,
    ["context_ref", "subtitle_ref", "context_path", "srt_path"],
    "application/x-subrip",
  );
  const contextPath = contextRef?.path ?? null;
  if (!contextPath) {
    return null;
  }

  const content = await fileService.readFile(contextPath);
  const segments = parseSubtitleContent(content, contextPath);
  if (segments.length === 0) {
    throw new Error(`Retry failed: no subtitle segments found in ${contextPath}`);
  }

  const targetLanguage =
    typeof params.target_language === "string" ? params.target_language : "Chinese";
  const mode: TranslateMode = isTranslateMode(params.mode) ? params.mode : "standard";
  const translateReq = {
    segments,
    target_language: targetLanguage,
    mode,
    context_path: contextPath,
    context_ref: contextRef,
  } satisfies Parameters<typeof executionService.translate>[0];
  const outcome = await executionService.translate(translateReq);
  return {
    outcome,
    descriptor: createRetryDescriptor(
      "translate",
      {
        context_path: contextPath,
        context_ref: contextRef,
        target_language: targetLanguage,
        mode,
      },
      task.name,
      task.created_at,
    ),
  };
}

async function submitSynthesizeRetry(task: Task): Promise<RetrySubmission | null> {
  const normalized = normalizeSynthesisTaskParams(task);
  if (!normalized) {
    return null;
  }
  const { params, options, watermarkPath, outputPath } = normalized;

  const videoRef = getTaskMediaReference(params, ["video_ref", "video_path"], "video/mp4");
  const srtRef = getTaskMediaReference(
    params,
    ["srt_ref", "subtitle_ref", "context_ref", "srt_path"],
    "application/x-subrip",
  );
  if (!videoRef?.path || !srtRef?.path) {
    return null;
  }
  const outcome = await executionService.synthesize({
    task_id: resolveRetryTaskId(task),
    video_path: null,
    video_ref: videoRef,
    srt_path: srtRef.path,
    srt_ref: srtRef,
    watermark_path: watermarkPath ?? null,
    output_path: outputPath ?? null,
    options,
  });

  return {
    outcome,
    descriptor: createRetryDescriptor(
      task.type,
      {
        video_ref: videoRef,
        srt_path: srtRef.path,
        subtitle_ref: srtRef,
        ...(watermarkPath !== undefined
          ? { watermark_path: watermarkPath }
          : {}),
        ...(outputPath !== undefined
          ? { output_path: outputPath }
          : {}),
        options,
      },
      task.name,
      task.created_at,
    ),
  };
}

async function submitExtractRetry(task: Task): Promise<RetrySubmission | null> {
  const params = getRequestParams(task);
  if (!params) {
    return null;
  }
  const videoRef = getTaskMediaReference(params, ["video_ref", "video_path"], "video/mp4");
  if (!videoRef?.path) {
    return null;
  }
  const roi = isRoiTuple(params.roi) ? params.roi : undefined;
  const engine: OcrEngine = isOcrEngine(params.engine) ? params.engine : "rapid";
  const sampleRate = isFiniteNumber(params.sample_rate) ? params.sample_rate : undefined;
  const outcome = await preprocessingService.extractText({
    task_id: resolveRetryTaskId(task),
    video_path: null,
    video_ref: videoRef,
    roi,
    engine,
    sample_rate: sampleRate,
  });
  return {
    outcome,
    descriptor: createRetryDescriptor(
      "extract",
      {
        video_ref: videoRef,
        ...(roi ? { roi } : {}),
        engine,
        ...(sampleRate !== undefined ? { sample_rate: sampleRate } : {}),
      },
      task.name,
      task.created_at,
    ),
  };
}

async function submitEnhanceRetry(task: Task): Promise<RetrySubmission | null> {
  const params = getRequestParams(task);
  if (!params) {
    return null;
  }
  const videoRef = getTaskMediaReference(params, ["video_ref", "video_path"], "video/mp4");
  if (!videoRef?.path) {
    return null;
  }
  const model = readOptionalString(params.model);
  const scale = readOptionalString(params.scale);
  const method = readOptionalString(params.method);
  const outcome = await preprocessingService.enhanceVideo({
    task_id: resolveRetryTaskId(task),
    video_path: null,
    video_ref: videoRef,
    model,
    scale,
    method,
  });
  return {
    outcome,
    descriptor: createRetryDescriptor(
      "enhancement",
      {
        video_ref: videoRef,
        ...(model !== undefined ? { model } : {}),
        ...(scale !== undefined ? { scale } : {}),
        ...(method !== undefined ? { method } : {}),
      },
      task.name,
      task.created_at,
    ),
  };
}

async function submitCleanRetry(task: Task): Promise<RetrySubmission | null> {
  const params = getRequestParams(task);
  if (!params) {
    return null;
  }
  const videoRef = getTaskMediaReference(params, ["video_ref", "video_path"], "video/mp4");
  const roi = isRoiTuple(params.roi) ? params.roi : null;
  if (!videoRef?.path || !roi) {
    return null;
  }
  const method = readOptionalString(params.method);
  const outcome = await preprocessingService.cleanVideo({
    task_id: resolveRetryTaskId(task),
    video_path: null,
    video_ref: videoRef,
    roi,
    method,
  });
  return {
    outcome,
    descriptor: createRetryDescriptor(
      "cleanup",
      {
        video_ref: videoRef,
        roi,
        ...(method !== undefined ? { method } : {}),
      },
      task.name,
      task.created_at,
    ),
  };
}

function isDownloadLikeTask(task: Task) {
  return task.type === "download" || Boolean(getPipelineStep(task, "download"));
}

function isTranscribeLikeTask(task: Task) {
  return task.type === "transcribe" || Boolean(getPipelineStep(task, "transcribe"));
}

export function canRetryTask(task: Task) {
  if (task.status !== "failed") {
    return false;
  }
  return (
    isDownloadLikeTask(task) ||
    isTranscribeLikeTask(task) ||
    task.type === "translate" ||
    task.type === "synthesize" ||
    task.type === "synthesis" ||
    task.type === "extract" ||
    task.type === "enhancement" ||
    task.type === "cleanup"
  );
}

export async function retryFailedTask(task: Task, addTask: (task: Task) => void) {
  let submission: RetrySubmission | null = null;

  if (isDownloadLikeTask(task)) {
    submission = await submitDownloadRetry(task);
  } else if (isTranscribeLikeTask(task)) {
    submission = await submitTranscribeRetry(task);
  } else if (task.type === "translate") {
    submission = await submitTranslateRetry(task);
  } else if (task.type === "synthesize" || task.type === "synthesis") {
    submission = await submitSynthesizeRetry(task);
  } else if (task.type === "extract") {
    submission = await submitExtractRetry(task);
  } else if (task.type === "enhancement") {
    submission = await submitEnhanceRetry(task);
  } else if (task.type === "cleanup") {
    submission = await submitCleanRetry(task);
  }

  if (!submission) {
    throw new Error(`Retry is not available for task type "${task.type}"`);
  }

  addTask(
    createTaskFromExecutionOutcome({
      outcome: submission.outcome,
      type: submission.descriptor.type,
      name: submission.descriptor.name,
      request_params: submission.descriptor.request_params,
      created_at: submission.descriptor.created_at,
    }),
  );
}
