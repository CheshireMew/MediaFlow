import type { FileRef, Task, TaskMeta, TaskRequestParams, TaskResult } from "../../types/task";
import { createMediaReference, type MediaReference } from "../ui/mediaReference";

type TaskWithDetails = Task & {
  request_params?: TaskRequestParams;
  result?: TaskResult;
};

function getTaskFiles(result: TaskResult | undefined, type: string) {
  return result?.files?.filter((file: FileRef) => file.type === type).map((file) => file.path) ?? [];
}

function normalizeTaskMediaRef(candidate: unknown): MediaReference | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const media = candidate as Partial<MediaReference>;
  if (typeof media.path !== "string" || !media.path.trim()) {
    return null;
  }

  return createMediaReference({
    path: media.path,
    name: media.name,
    size: media.size,
    type: media.type,
    media_id: media.media_id,
    media_kind: media.media_kind,
    role: media.role,
    origin: media.origin,
  });
}

function createTaskMediaRef(filePath: unknown, type?: string) {
  if (!filePath || typeof filePath !== "string" || !filePath.trim()) {
    return null;
  }

  return createMediaReference({
    path: filePath.trim(),
    type,
    origin: "task",
  });
}

function appendPathCandidate(
  candidates: Array<string | undefined>,
  candidate: string | null | undefined,
) {
  if (typeof candidate === "string" && candidate.length > 0) {
    candidates.push(candidate);
  }
}

export function getTaskStructuredMediaRefs(task: TaskWithDetails) {
  const result = task.result;
  const params: TaskRequestParams = task.request_params || {};
  const meta: TaskMeta = result?.meta || {};

  return {
    videoRef:
      normalizeTaskMediaRef(meta.video_ref) ??
      normalizeTaskMediaRef(params.video_ref),
    subtitleRef:
      normalizeTaskMediaRef(meta.subtitle_ref) ??
      normalizeTaskMediaRef(params.subtitle_ref),
    contextRef:
      normalizeTaskMediaRef(meta.context_ref) ??
      normalizeTaskMediaRef(params.context_ref),
    outputRef:
      normalizeTaskMediaRef(meta.output_ref) ??
      normalizeTaskMediaRef(params.output_ref),
  };
}

export function normalizeLegacyTaskMediaContract(task: Task): {
  task: Task;
  normalizedFromLegacy: boolean;
} {
  const requestParams = task.request_params;

  if (!requestParams || typeof requestParams !== "object") {
    return {
      task,
      normalizedFromLegacy: task.task_contract_normalized_from_legacy === true,
    };
  }

  let normalizedFromLegacy = task.task_contract_normalized_from_legacy === true;
  const nextRequestParams = { ...requestParams } as Record<string, unknown>;
  const nextResult =
    task.result && typeof task.result === "object"
      ? {
          ...task.result,
          meta:
            task.result.meta && typeof task.result.meta === "object"
              ? { ...task.result.meta }
              : {},
        }
      : task.result;
  const nextResultMeta =
    nextResult && typeof nextResult === "object" && nextResult.meta && typeof nextResult.meta === "object"
      ? (nextResult.meta as Record<string, unknown>)
      : null;

  const legacyRequestSubtitlePath =
    typeof nextRequestParams.context_path === "string"
      ? nextRequestParams.context_path
      : typeof nextRequestParams.srt_path === "string"
        ? nextRequestParams.srt_path
        : null;

  if (task.type === "translate" && legacyRequestSubtitlePath) {
    if (!nextRequestParams.context_ref) {
      nextRequestParams.context_ref = createTaskMediaRef(
        legacyRequestSubtitlePath,
        "application/x-subrip",
      );
      normalizedFromLegacy = true;
    }
    if (!nextRequestParams.subtitle_ref) {
      nextRequestParams.subtitle_ref = createTaskMediaRef(
        legacyRequestSubtitlePath,
        "application/x-subrip",
      );
      normalizedFromLegacy = true;
    }
  }

  if (nextResultMeta) {
    const legacyResultSubtitlePath =
      typeof nextResultMeta.srt_path === "string"
        ? nextResultMeta.srt_path
        : Array.isArray(nextResult?.files)
          ? (
              nextResult.files.find(
                (file) =>
                  file &&
                  typeof file === "object" &&
                  file.type === "subtitle" &&
                  typeof file.path === "string",
              )?.path ?? null
            )
          : null;

    if (task.type === "translate" && legacyResultSubtitlePath) {
      if (!nextResultMeta.subtitle_ref) {
        nextResultMeta.subtitle_ref = createTaskMediaRef(
          legacyResultSubtitlePath,
          "application/x-subrip",
        );
        normalizedFromLegacy = true;
      }
      if (!nextResultMeta.output_ref) {
        nextResultMeta.output_ref = createTaskMediaRef(
          legacyResultSubtitlePath,
          "application/x-subrip",
        );
        normalizedFromLegacy = true;
      }
    }
  }

  return {
    task: {
      ...task,
      task_contract_normalized_from_legacy: normalizedFromLegacy,
      request_params: nextRequestParams as Task["request_params"],
      result: nextResult,
    },
    normalizedFromLegacy,
  };
}

export function getTaskMediaCandidates(task: TaskWithDetails) {
  const result = task.result;
  const { videoRef, subtitleRef, contextRef, outputRef } = getTaskStructuredMediaRefs(task);
  const videoFiles = getTaskFiles(result, "video");
  const audioFiles = getTaskFiles(result, "audio");
  const subtitleFiles = getTaskFiles(result, "subtitle");

  const subtitleCandidates: Array<string | undefined> = [];
  appendPathCandidate(subtitleCandidates, subtitleRef?.path);
  appendPathCandidate(subtitleCandidates, contextRef?.path);
  appendPathCandidate(subtitleCandidates, outputRef?.path);
  subtitleCandidates.push(...subtitleFiles);

  return {
    video: [
      ...(videoRef?.path ? [videoRef.path] : []),
      ...videoFiles,
      ...audioFiles,
    ],
    subtitle: subtitleCandidates,
    context: [] as Array<string | undefined>,
  };
}

export function resolvePrimaryTaskMedia(task: TaskWithDetails) {
  const structuredRefs = getTaskStructuredMediaRefs(task);
  const candidates = getTaskMediaCandidates(task);
  const videoCandidate = candidates.video.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const subtitleCandidate = candidates.subtitle.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const contextCandidate = candidates.context.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  return {
    videoRef: structuredRefs.videoRef ?? (videoCandidate ? createMediaReference({ path: videoCandidate }) : null),
    subtitleRef:
      structuredRefs.subtitleRef ?? (subtitleCandidate ? createMediaReference({ path: subtitleCandidate }) : null),
    contextRef: structuredRefs.contextRef,
    outputRef: structuredRefs.outputRef,
    contextPath: contextCandidate ?? null,
  };
}

export function resolveTranslationTaskMedia(task: Task) {
  const requestParams = task.request_params;
  const resultMeta = task.result?.meta;
  const resultSubtitleFile = task.result?.files?.find((file) => file.type === "subtitle");
  const structuredRefs = getTaskStructuredMediaRefs(task);

  const sourceSubtitleRef =
    normalizeTaskMediaRef(requestParams?.context_ref) ??
    normalizeTaskMediaRef(requestParams?.subtitle_ref) ??
    structuredRefs.contextRef ??
    structuredRefs.subtitleRef ??
    null;

  const targetSubtitleRef =
    normalizeTaskMediaRef(resultMeta?.output_ref) ??
    normalizeTaskMediaRef(resultMeta?.subtitle_ref) ??
    structuredRefs.outputRef ??
    (resultSubtitleFile?.path ? createMediaReference({ path: resultSubtitleFile.path }) : null);

  return {
    sourceSubtitleRef,
    targetSubtitleRef,
  };
}

export function hasTranscribeStep(task: Task): boolean {
  if (task.type === "transcribe") return true;
  if (task.type !== "pipeline") return false;

  const steps = task.request_params?.steps;
  return Array.isArray(steps) && steps.some((step) => step.step_name === "transcribe");
}

export function resolveTranscribeTaskMedia(task: Task) {
  const structuredRefs = getTaskStructuredMediaRefs(task);

  if (structuredRefs.videoRef || structuredRefs.subtitleRef) {
    return {
      sourceMediaRef: structuredRefs.videoRef,
      subtitleRef: structuredRefs.subtitleRef,
      sourceCandidates: structuredRefs.videoRef?.path ? [structuredRefs.videoRef.path] : [],
    };
  }

  let directAudioRef: MediaReference | null = null;
  if (task.type === "transcribe") {
    const params = task.request_params as Record<string, unknown> | undefined;
    const audioRefCandidate = params?.audio_ref;
    if (audioRefCandidate && typeof audioRefCandidate === "object") {
      directAudioRef = normalizeTaskMediaRef(audioRefCandidate);
    }
    if (!directAudioRef && typeof params?.audio_path === "string") {
      directAudioRef = createMediaReference({ path: params.audio_path });
    }
  } else if (task.type === "pipeline") {
    const steps = task.request_params?.steps;
    const transcribeStep = Array.isArray(steps)
      ? steps.find((step) => step.step_name === "transcribe")
      : null;
    const params =
      transcribeStep && typeof transcribeStep === "object" && transcribeStep.params
        ? (transcribeStep.params as Record<string, unknown>)
        : undefined;
    const audioRefCandidate = params?.audio_ref;
    if (audioRefCandidate && typeof audioRefCandidate === "object") {
      directAudioRef = normalizeTaskMediaRef(audioRefCandidate);
    }
    if (!directAudioRef && typeof params?.audio_path === "string") {
      directAudioRef = createMediaReference({ path: params.audio_path });
    }
  }

  const candidatePaths = directAudioRef?.path
    ? [directAudioRef.path]
    : getTaskMediaCandidates(task).video.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      );

  return {
    sourceMediaRef: directAudioRef,
    subtitleRef: null,
    sourceCandidates: candidatePaths,
  };
}
