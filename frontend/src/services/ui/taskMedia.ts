import type {
  Task,
  TaskRequestParams,
  TaskResult,
} from "../../types/task";
import {
  createNavigationMediaPayload,
  type NavigationPayload,
} from "./navigation";
import {
  getTaskMediaCandidates as buildTaskMediaCandidates,
  resolvePrimaryTaskMedia,
  getTaskStructuredMediaRefs,
} from "../tasks/taskMediaResolver";
import type { MediaReference } from "./mediaReference";
import { resolvePreferredMediaPaths } from "./mediaPathResolver";

type TaskWithDetails = Task & {
  request_params?: TaskRequestParams;
  result?: TaskResult;
};

export function getTaskMediaRefs(task: TaskWithDetails) {
  return getTaskStructuredMediaRefs(task);
}

export function getTaskMediaCandidates(task: TaskWithDetails) {
  return buildTaskMediaCandidates(task);
}

export function hasTaskVideoMedia(task: TaskWithDetails) {
  const candidates = getTaskMediaCandidates(task);
  return candidates.video.some((candidate) => typeof candidate === "string" && candidate.length > 0);
}

export function hasTaskSubtitleMedia(task: TaskWithDetails) {
  const candidates = getTaskMediaCandidates(task);
  return candidates.subtitle.some((candidate) => typeof candidate === "string" && candidate.length > 0);
}

export async function resolveTaskMediaPaths(task: TaskWithDetails) {
  return await resolvePreferredMediaPaths(getTaskMediaCandidates(task));
}

export async function resolveTaskMediaReferences(task: TaskWithDetails): Promise<{
  videoRef: MediaReference | null;
  subtitleRef: MediaReference | null;
  contextRef: MediaReference | null;
  outputRef: MediaReference | null;
  contextPath: string | null;
}> {
  const primaryMedia = resolvePrimaryTaskMedia(task);
  const { contextPath } = await resolveTaskMediaPaths(task);

  return {
    ...primaryMedia,
    contextPath: primaryMedia.contextPath ?? contextPath,
  };
}

export async function resolveTaskNavigationPayload(
  task: TaskWithDetails,
): Promise<NavigationPayload> {
  const primaryMedia = resolvePrimaryTaskMedia(task);

  return createNavigationMediaPayload({
    videoPath: primaryMedia.videoRef?.path ?? null,
    subtitlePath: primaryMedia.subtitleRef?.path ?? null,
    videoRef: primaryMedia.videoRef,
    subtitleRef: primaryMedia.subtitleRef,
  });
}
