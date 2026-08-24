import type { PipelineRequest } from "../../types/api";
import type { TranslationOutput } from "../../types/generatedApi";
import type { SubtitleSegment, Task } from "../../types/task";
import type { TranscribeResult } from "../../types/transcriber";
import type { TranslatorExecutionMode } from "../../stores/translatorStore";
import type { DownloadHistoryItem } from "../../stores/downloaderStore";
import { getTaskMediaRefs } from "../../services/ui/taskMedia";
import {
  hasTranscribeStep,
  resolveTranscribeTaskMedia,
  resolveTranslationTaskMedia,
} from "../../services/tasks/taskMediaResolver";
import {
  type MediaReference,
  resolveMediaReferencePath,
} from "../../services/ui/mediaReference";
import {
  isTaskActive,
} from "../../services/tasks/taskRuntimeState";

export const isTranslatorMode = (value: unknown): value is TranslatorExecutionMode =>
  value === "standard" || value === "intelligent" || value === "proofread";

export const getTranslationTaskMode = (task: Task): TranslatorExecutionMode | null => {
  const steps = (task.request_params as PipelineRequest | undefined)?.steps;
  const rawMode = steps?.find((step) => step.step_name === "translate")?.params
    ? (steps.find((step) => step.step_name === "translate")?.params as { mode?: unknown }).mode
    : undefined;
  return isTranslatorMode(rawMode) ? rawMode : null;
};

export const getTranslationTaskOutput = (task: Task): TranslationOutput | null =>
  task.result?.outputs?.translation ?? null;

export const getTranslationTaskSegments = (task: Task): SubtitleSegment[] =>
  getTranslationTaskOutput(task)?.segments ?? [];

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
  return task.primary_operation === "download";
};

export const getDownloadTaskUrl = (task: Task): string | null => {
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
      isTaskActive(task),
  );

export const findActiveTranslationTask = (
  tasks: Task[],
  sourceFileRef: MediaReference | null,
): Task | undefined =>
  tasks.find((task) => {
    if (task.primary_operation !== "translate") return false;
    if (!isTaskActive(task)) {
      return false;
    }

    const sourceIdentity = resolveMediaReferencePath(sourceFileRef);
    if (sourceIdentity) {
      const taskMediaRefs = getTranslationTaskMediaRefs(task);
      const sourceSubtitleIdentity = resolveMediaReferencePath(taskMediaRefs.sourceSubtitleRef);
      return sourceSubtitleIdentity === sourceIdentity;
    }

    return false;
  });

export const findCompletedTranslationTask = (
  tasks: Task[],
  sourceFileRef: MediaReference | null,
): Task | undefined =>
  tasks.find((task) => {
    if (task.primary_operation !== "translate") return false;
    if (task.status !== "completed") return false;

    const sourceIdentity = resolveMediaReferencePath(sourceFileRef);
    if (sourceIdentity) {
      const taskMediaRefs = getTranslationTaskMediaRefs(task);
      const sourceSubtitleIdentity = resolveMediaReferencePath(taskMediaRefs.sourceSubtitleRef);
      return sourceSubtitleIdentity === sourceIdentity;
    }

    return false;
  });

export const findActiveTranscribeTask = (
  tasks: Task[],
  fileRef: MediaReference | null,
): Task | undefined =>
  tasks.find((task) => {
    if (!isTaskActive(task)) return false;
    if (!hasTranscribeStep(task)) return false;

    const mediaIdentity = resolveMediaReferencePath(fileRef);
    if (!mediaIdentity) return false;
    const transcribeMediaRefs = resolveTranscribeTaskMedia(task);
    const sourceIdentity = resolveMediaReferencePath(transcribeMediaRefs.sourceMediaRef);
    if (sourceIdentity === mediaIdentity) {
      return true;
    }
    if (sourceIdentity) {
      return false;
    }
    return false;
  });

export const findCompletedTranscribeTask = (
  tasks: Task[],
  fileRef: MediaReference | null,
): Task | undefined =>
  tasks.find((task) => {
    if (task.status !== "completed") return false;
    if (!hasTranscribeStep(task)) return false;

    const mediaIdentity = resolveMediaReferencePath(fileRef);
    if (!mediaIdentity) return false;
    const transcribeMediaRefs = resolveTranscribeTaskMedia(task);
    const sourceIdentity = resolveMediaReferencePath(transcribeMediaRefs.sourceMediaRef);
    if (sourceIdentity === mediaIdentity) {
      return true;
    }
    if (sourceIdentity) {
      return false;
    }
    return false;
  });

export const mapTaskToTranscribeResult = (
  task: Task,
  fileRef: MediaReference | null,
): TranscribeResult | null => {
  if (!task.result) return null;

  const transcription = task.result.outputs?.transcription;
  if (!transcription) return null;
  const transcribeMediaRefs = resolveTranscribeTaskMedia(task);
  const taskMediaRefs = getTaskMediaRefs(task);
  const subtitleRef =
    taskMediaRefs.subtitleRef ??
    transcribeMediaRefs.subtitleRef;
  const videoRef =
    taskMediaRefs.videoRef ??
    transcribeMediaRefs.sourceMediaRef ??
    fileRef;

  return {
    segments: transcription.segments,
    text: transcription.text,
    language: transcription.language,
    video_ref: videoRef,
    subtitle_ref: subtitleRef,
  };
};
