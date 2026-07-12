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
  return (task.artifacts ?? []).some((artifact) => artifact.kind === "video" && artifact.ref.path);
}

export function hasTaskTranscribableMedia(task: TaskWithDetails) {
  return (task.artifacts ?? []).some(
    (artifact) => (artifact.kind === "video" || artifact.kind === "audio") && artifact.ref.path,
  );
}

export function hasTaskSubtitleMedia(task: TaskWithDetails) {
  const candidates = getTaskMediaCandidates(task);
  return candidates.subtitle.some((candidate) => typeof candidate === "string" && candidate.length > 0);
}

export async function resolveTaskMediaPaths(task: TaskWithDetails) {
  return await resolvePreferredMediaPaths(getTaskMediaCandidates(task));
}

export async function resolveTaskOutputPath(task: TaskWithDetails) {
  const { outputPath } = await resolveTaskMediaPaths(task);
  return outputPath;
}

export async function resolveTaskMediaReferences(task: TaskWithDetails): Promise<{
  videoRef: MediaReference | null;
  subtitleRef: MediaReference | null;
  contextRef: MediaReference | null;
  outputRef: MediaReference | null;
}> {
  return resolvePrimaryTaskMedia(task);
}

export async function resolveTaskNavigationPayload(
  task: TaskWithDetails,
): Promise<NavigationPayload> {
  const primaryMedia = await resolveTaskMediaReferences(task);

  return createNavigationMediaPayload({
    videoRef: primaryMedia.videoRef,
    subtitleRef: primaryMedia.subtitleRef,
  });
}
