import type { Task } from "../../types/task";
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

export function getTaskMediaRefs(task: Task) {
  return getTaskStructuredMediaRefs(task);
}

export function getTaskMediaCandidates(task: Task) {
  return buildTaskMediaCandidates(task);
}

export function hasTaskVideoMedia(task: Task) {
  return (task.artifacts ?? []).some((artifact) => artifact.kind === "video" && artifact.ref.path);
}

export function hasTaskTranscribableMedia(task: Task) {
  return (task.artifacts ?? []).some(
    (artifact) => (artifact.kind === "video" || artifact.kind === "audio") && artifact.ref.path,
  );
}

export function hasTaskSubtitleMedia(task: Task) {
  const candidates = getTaskMediaCandidates(task);
  return candidates.subtitle.some((candidate) => typeof candidate === "string" && candidate.length > 0);
}

export async function resolveTaskMediaPaths(task: Task) {
  return await resolvePreferredMediaPaths(getTaskMediaCandidates(task));
}

export async function resolveTaskOutputPath(task: Task) {
  const { outputPath } = await resolveTaskMediaPaths(task);
  return outputPath;
}

export async function resolveTaskMediaReferences(task: Task): Promise<{
  videoRef: MediaReference | null;
  subtitleRef: MediaReference | null;
  contextRef: MediaReference | null;
  outputRef: MediaReference | null;
}> {
  return resolvePrimaryTaskMedia(task);
}

export async function resolveTaskNavigationPayload(
  task: Task,
): Promise<NavigationPayload> {
  const primaryMedia = await resolveTaskMediaReferences(task);

  return createNavigationMediaPayload({
    videoRef: primaryMedia.videoRef,
    subtitleRef: primaryMedia.subtitleRef,
  });
}
