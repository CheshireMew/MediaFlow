import type { PipelineRequest } from "../../types/api";
import type { FileRef, SubtitleSegment, Task, TaskResult } from "../../types/task";
import type { TranscribeResult } from "../../types/transcriber";
import type { TranslatorMode } from "../../stores/translatorStore";
import type { DownloadHistoryItem } from "../../stores/downloaderStore";
import { getTaskMediaRefs } from "../../services/ui/taskMedia";
import {
  hasTranscribeStep,
  resolveTranscribeTaskMedia,
  resolveTranslationTaskMedia,
} from "../../services/tasks/taskMediaResolver";
import {
  createMediaReference,
  type MediaReference,
  resolveMediaReferencePath,
} from "../../services/ui/mediaReference";

const TRANSLATION_ACTIVE_STATUSES = [
  "running",
  "pending",
  "processing_result",
  "paused",
] as const;

export const isTranslatorMode = (value: unknown): value is TranslatorMode =>
  value === "standard" || value === "intelligent" || value === "proofread";

export const getTranslationTaskMode = (task: Task): TranslatorMode | null => {
  const rawMode = (task.request_params as { mode?: unknown } | undefined)?.mode;
  return isTranslatorMode(rawMode) ? rawMode : null;
};

export const getTranslationTaskSegments = (task: Task): SubtitleSegment[] => {
  const segments = task.result?.meta?.segments ?? task.result?.segments;
  return Array.isArray(segments) ? (segments as SubtitleSegment[]) : [];
};

export const getTranslationTaskMediaRefs = (task: Task) => {
  const { sourceSubtitleRef, targetSubtitleRef } = resolveTranslationTaskMedia(task);
  return {
    sourceSubtitleRef,
    targetSubtitleRef,
  };
};

export const selectTaskById = (
  tasks: Task[],
  taskId: string | null | undefined,
): Task | null => {
  if (!taskId) return null;
  return tasks.find((task) => task.id === taskId) ?? null;
};

export const isDownloadTask = (task: Task): boolean => {
  if (task.type === "download") return true;
  if (task.type !== "pipeline") return false;

  const steps = (task.request_params as PipelineRequest | undefined)?.steps;
  return Array.isArray(steps) && steps.some((step) => step.step_name === "download");
};

export const getDownloadTaskUrl = (task: Task): string | null => {
  if (task.type === "download") {
    const params = task.request_params as Record<string, unknown> | undefined;
    return typeof params?.url === "string" ? params.url : null;
  }

  const steps = (task.request_params as PipelineRequest | undefined)?.steps;
  if (!Array.isArray(steps)) return null;

  const downloadStep = steps.find((step) => step.step_name === "download");
  const params = downloadStep?.params as Record<string, unknown> | undefined;
  return typeof params?.url === "string" ? params.url : null;
};

export type DownloadTaskEntry = DownloadHistoryItem & {
  task: Task | null;
};

export const buildDownloadTaskEntries = (
  tasks: Task[],
  history: DownloadHistoryItem[],
): DownloadTaskEntry[] =>
  history.map((item) => ({
    ...item,
    task:
      selectTaskById(tasks, item.id) ??
      tasks.find((task) => isDownloadTask(task) && getDownloadTaskUrl(task) === item.url) ??
      null,
  }));

export const getActiveDownloadTasks = (tasks: Task[]): Task[] =>
  tasks.filter(
    (task) =>
      isDownloadTask(task) &&
      ["pending", "running", "paused"].includes(task.status),
  );

export const findActiveTranslationTask = (
  tasks: Task[],
  sourceFileRef: MediaReference | null,
  sourceFilePath: string | null,
): Task | undefined =>
  tasks.find((task) => {
    if (task.type !== "translate") return false;
    if (
      !TRANSLATION_ACTIVE_STATUSES.includes(
        task.status as (typeof TRANSLATION_ACTIVE_STATUSES)[number],
      )
      ) {
      return false;
    }

    const sourceIdentity = resolveMediaReferencePath(sourceFileRef, sourceFilePath);
    if (sourceIdentity) {
      const taskMediaRefs = getTranslationTaskMediaRefs(task);
      const sourceSubtitleIdentity = resolveMediaReferencePath(taskMediaRefs.sourceSubtitleRef);
      return sourceSubtitleIdentity === sourceIdentity;
    }

    return !sourceFileRef && !sourceFilePath;
  });

export const findCompletedTranslationTask = (
  tasks: Task[],
  sourceFileRef: MediaReference | null,
  sourceFilePath: string | null,
): Task | undefined =>
  tasks.find((task) => {
    if (task.type !== "translate") return false;
    if (task.status !== "completed") return false;

    const sourceIdentity = resolveMediaReferencePath(sourceFileRef, sourceFilePath);
    if (sourceIdentity) {
      const taskMediaRefs = getTranslationTaskMediaRefs(task);
      const sourceSubtitleIdentity = resolveMediaReferencePath(taskMediaRefs.sourceSubtitleRef);
      return sourceSubtitleIdentity === sourceIdentity;
    }

    return true;
  });

export const findActiveTranscribeTask = (
  tasks: Task[],
  fileRef: MediaReference | null,
  filePath: string | null | undefined,
): Task | undefined =>
  tasks.find((task) => {
    if (!["running", "pending", "paused"].includes(task.status)) return false;
    if (!hasTranscribeStep(task)) return false;

    const mediaIdentity = resolveMediaReferencePath(fileRef, filePath);
    if (!mediaIdentity) return true;
    const transcribeMediaRefs = resolveTranscribeTaskMedia(task);
    const sourceIdentity = resolveMediaReferencePath(transcribeMediaRefs.sourceMediaRef);
    if (sourceIdentity === mediaIdentity) {
      return true;
    }
    if (sourceIdentity) {
      return false;
    }
    return transcribeMediaRefs.sourceCandidates.includes(mediaIdentity);
  });

export const findCompletedTranscribeTask = (
  tasks: Task[],
  fileRef: MediaReference | null,
  filePath: string | null | undefined,
): Task | undefined =>
  tasks.find((task) => {
    if (task.status !== "completed") return false;
    if (!hasTranscribeStep(task)) return false;

    const mediaIdentity = resolveMediaReferencePath(fileRef, filePath);
    if (!mediaIdentity) return true;
    const transcribeMediaRefs = resolveTranscribeTaskMedia(task);
    const sourceIdentity = resolveMediaReferencePath(transcribeMediaRefs.sourceMediaRef);
    if (sourceIdentity === mediaIdentity) {
      return true;
    }
    if (sourceIdentity) {
      return false;
    }
    return transcribeMediaRefs.sourceCandidates.includes(mediaIdentity);
  });

export const mapTaskToTranscribeResult = (
  task: Task,
  fileRef: MediaReference | null,
  filePath: string | null | undefined,
): TranscribeResult | null => {
  if (!task.result) return null;

  const backendResult = task.result as TaskResult;
  const meta = backendResult.meta || {};
  const files = backendResult.files || [];
  const srtFile = files.find((f: FileRef) => f.type === "subtitle");
  const transcribeMediaRefs = resolveTranscribeTaskMedia(task);
  const candidatePath =
    resolveMediaReferencePath(fileRef, filePath) ??
    resolveMediaReferencePath(transcribeMediaRefs.sourceMediaRef) ??
    transcribeMediaRefs.sourceCandidates[0] ??
    undefined;
  const taskMediaRefs = getTaskMediaRefs(task);
  const subtitleRef =
    taskMediaRefs.subtitleRef ??
    transcribeMediaRefs.subtitleRef ??
    (srtFile?.path ? createMediaReference({ path: srtFile.path }) : null);
  const videoRef =
    taskMediaRefs.videoRef ??
    transcribeMediaRefs.sourceMediaRef ??
    (candidatePath ? createMediaReference({ path: candidatePath }) : null);
  const resolvedCandidatePath =
    resolveMediaReferencePath(videoRef, candidatePath) ?? undefined;

  return {
    segments: Array.isArray(meta.segments) ? meta.segments : [],
    text:
      typeof meta.text === "string"
        ? meta.text
        : typeof meta.transcript === "string"
          ? meta.transcript
          : "",
    language: typeof meta.language === "string" ? meta.language : "auto",
    video_ref:
      videoRef ??
      (resolvedCandidatePath ? createMediaReference({ path: resolvedCandidatePath }) : null),
    subtitle_ref: subtitleRef,
  };
};
