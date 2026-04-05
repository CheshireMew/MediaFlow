import type { PipelineRequest, TranslateRequest } from "../../types/api";
import type { Task, TaskRequestParams, TaskType } from "../../types/task";
import {
  createTaskFromExecutionOutcome,
  executionService,
  preprocessingService,
  settingsService,
} from "../domain";
import { createMediaReference, type MediaReference } from "../ui/mediaReference";
import { fileService } from "../fileService";
import { parseSubtitleContent } from "../../utils/subtitleParser";

type RetryDescriptor = {
  type: TaskType;
  request_params: TaskRequestParams;
  name?: string;
};

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

function toMediaReference(value: unknown, type?: string): MediaReference | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return createMediaReference({ path: value, type });
  }
  if (typeof value === "object" && "path" in value && typeof value.path === "string") {
    const candidate = value as Partial<MediaReference>;
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

async function submitDownloadRetry(task: Task) {
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
  const outcome = await executionService.download(pipeline, settings);
  return {
    outcome,
    descriptor: {
      type: "download" as const,
      name: task.name,
      request_params: {
        steps: pipeline.steps,
        ...(pipeline.steps[0]?.params ?? {}),
      },
    },
  };
}

async function submitTranscribeRetry(task: Task) {
  const stepParams = getStepParams(task, "transcribe");
  const params = stepParams ?? getRequestParams(task);
  if (!params) {
    return null;
  }

  const audioRef = getTaskMediaReference(params, ["audio_ref", "video_ref", "audio_path", "video_path"], "video/mp4");
  if (!audioRef?.path) {
    return null;
  }

  const outcome = await executionService.transcribe({
    audio_path: null,
    audio_ref: audioRef,
    engine: (params.engine as "builtin" | "cli" | undefined) ?? "builtin",
    model: typeof params.model === "string" ? params.model : "base",
    device: typeof params.device === "string" ? params.device : "cpu",
    language: typeof params.language === "string" ? params.language : null,
    initial_prompt: typeof params.initial_prompt === "string" ? params.initial_prompt : null,
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
                engine: (params.engine as "builtin" | "cli" | undefined) ?? "builtin",
                model: typeof params.model === "string" ? params.model : "base",
                device: typeof params.device === "string" ? params.device : "cpu",
                vad_filter: params.vad_filter ?? true,
                language: typeof params.language === "string" ? params.language : undefined,
                initial_prompt: typeof params.initial_prompt === "string" ? params.initial_prompt : undefined,
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
    descriptor: {
      type: task.type,
      name: task.name,
      request_params,
    },
  };
}

async function submitTranslateRetry(task: Task) {
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

  const translateReq: TranslateRequest = {
    segments,
    target_language: typeof params.target_language === "string" ? params.target_language : "Chinese",
    mode:
      typeof params.mode === "string"
        ? (params.mode as "standard" | "intelligent" | "proofread")
        : "standard",
    context_path: contextPath,
    context_ref: contextRef,
  };
  const outcome = await executionService.translate(translateReq);
  return {
    outcome,
    descriptor: {
      type: "translate",
      name: task.name,
      request_params: {
        context_path: contextPath,
        context_ref: contextRef,
        target_language: translateReq.target_language,
        mode: translateReq.mode,
      },
    },
  };
}

async function submitSynthesizeRetry(task: Task) {
  const params = getRequestParams(task);
  if (!params) {
    return null;
  }

  const videoRef = getTaskMediaReference(params, ["video_ref", "video_path"], "video/mp4");
  const srtRef = getTaskMediaReference(
    params,
    ["srt_ref", "subtitle_ref", "context_ref", "srt_path"],
    "application/x-subrip",
  );
  if (!videoRef?.path || !srtRef?.path) {
    return null;
  }

  const {
    video_ref,
    video_path,
    subtitle_ref,
    srt_ref,
    context_ref,
    srt_path,
    watermark_path,
    output_path,
    ...rest
  } = params;
  const outcome = await executionService.synthesize({
    video_path: null,
    video_ref: videoRef,
    srt_path: srtRef.path,
    srt_ref: srtRef,
    watermark_path: typeof watermark_path === "string" ? watermark_path : null,
    output_path: typeof output_path === "string" ? output_path : null,
    options: rest,
  });

  return {
    outcome,
    descriptor: {
      type: task.type,
      name: task.name,
      request_params: {
        video_ref: videoRef,
        srt_path: srtRef.path,
        subtitle_ref: srtRef,
        watermark_path,
        output_path,
        ...rest,
      },
    },
  };
}

async function submitExtractRetry(task: Task) {
  const params = getRequestParams(task);
  if (!params) {
    return null;
  }
  const videoRef = getTaskMediaReference(params, ["video_ref", "video_path"], "video/mp4");
  if (!videoRef?.path) {
    return null;
  }
  const outcome = await preprocessingService.extractText({
    video_path: null,
    video_ref: videoRef,
    roi: Array.isArray(params.roi) ? (params.roi as [number, number, number, number]) : undefined,
    engine: typeof params.engine === "string" ? params.engine : "rapid",
    sample_rate: typeof params.sample_rate === "number" ? params.sample_rate : undefined,
  });
  return {
    outcome,
    descriptor: {
      type: "extract",
      name: task.name,
      request_params: {
        video_ref: videoRef,
        roi: params.roi,
        engine: params.engine,
        sample_rate: params.sample_rate,
      },
    },
  };
}

async function submitEnhanceRetry(task: Task) {
  const params = getRequestParams(task);
  if (!params) {
    return null;
  }
  const videoRef = getTaskMediaReference(params, ["video_ref", "video_path"], "video/mp4");
  if (!videoRef?.path) {
    return null;
  }
  const outcome = await preprocessingService.enhanceVideo({
    video_path: null,
    video_ref: videoRef,
    model: typeof params.model === "string" ? params.model : undefined,
    scale: typeof params.scale === "string" ? params.scale : undefined,
    method: typeof params.method === "string" ? params.method : undefined,
  });
  return {
    outcome,
    descriptor: {
      type: "enhancement",
      name: task.name,
      request_params: {
        video_ref: videoRef,
        model: params.model,
        scale: params.scale,
        method: params.method,
      },
    },
  };
}

async function submitCleanRetry(task: Task) {
  const params = getRequestParams(task);
  if (!params) {
    return null;
  }
  const videoRef = getTaskMediaReference(params, ["video_ref", "video_path"], "video/mp4");
  if (!videoRef?.path || !Array.isArray(params.roi)) {
    return null;
  }
  const outcome = await preprocessingService.cleanVideo({
    video_path: null,
    video_ref: videoRef,
    roi: params.roi as [number, number, number, number],
    method: typeof params.method === "string" ? params.method : undefined,
  });
  return {
    outcome,
    descriptor: {
      type: "cleanup",
      name: task.name,
      request_params: {
        video_ref: videoRef,
        roi: params.roi,
        method: params.method,
      },
    },
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
  let submission:
    | {
        outcome: unknown;
        descriptor: RetryDescriptor;
      }
    | null = null;

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
      outcome: submission.outcome as never,
      type: submission.descriptor.type,
      name: submission.descriptor.name,
      request_params: submission.descriptor.request_params,
    }),
  );
}
