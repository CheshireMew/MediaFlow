import type { FileRef, Task, TaskMeta, TaskRequestParams, TaskResult } from "../../types/task";
import { normalizeMediaReference, type MediaReference } from "../ui/mediaReference";

type TaskWithDetails = Task & {
  request_params?: TaskRequestParams;
  result?: TaskResult;
};

function getTaskFiles(result: TaskResult | undefined, type: string) {
  return result?.files?.filter((file: FileRef) => file.type === type).map((file) => file.path) ?? [];
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
      normalizeMediaReference(meta.video_ref) ??
      normalizeMediaReference(params.video_ref),
    subtitleRef:
      normalizeMediaReference(meta.subtitle_ref) ??
      normalizeMediaReference(params.subtitle_ref),
    contextRef:
      normalizeMediaReference(meta.context_ref) ??
      normalizeMediaReference(params.context_ref),
    outputRef:
      normalizeMediaReference(meta.output_ref) ??
      normalizeMediaReference(params.output_ref),
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
    videoRef: structuredRefs.videoRef ?? normalizeMediaReference(videoCandidate),
    subtitleRef:
      structuredRefs.subtitleRef ?? normalizeMediaReference(subtitleCandidate),
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
    normalizeMediaReference(requestParams?.context_ref) ??
    normalizeMediaReference(requestParams?.subtitle_ref) ??
    structuredRefs.contextRef ??
    structuredRefs.subtitleRef ??
    null;

  const targetSubtitleRef =
    normalizeMediaReference(resultMeta?.output_ref) ??
    normalizeMediaReference(resultMeta?.subtitle_ref) ??
    structuredRefs.outputRef ??
    normalizeMediaReference(resultSubtitleFile?.path);

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
      directAudioRef = normalizeMediaReference(audioRefCandidate);
    }
    if (!directAudioRef && typeof params?.audio_path === "string") {
      directAudioRef = normalizeMediaReference(params.audio_path);
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
      directAudioRef = normalizeMediaReference(audioRefCandidate);
    }
    if (!directAudioRef && typeof params?.audio_path === "string") {
      directAudioRef = normalizeMediaReference(params.audio_path);
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
