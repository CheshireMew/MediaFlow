import type { Task } from "../../types/task";
import {
  createNavigationMediaPayload,
  type NavigationPayload,
} from "./navigation";
import {
  getTaskMediaCandidates as buildTaskMediaCandidates,
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
  const target = await resolveTaskRevealTarget(task);
  return target.path;
}

export async function resolveTaskRevealTarget(task: Task) {
  const candidates = getTaskMediaCandidates(task);
  const paths = await resolvePreferredMediaPaths(candidates);
  const path = paths.outputPath
    ?? paths.videoPath
    ?? paths.subtitlePath
    ?? paths.contextPath;
  const resolvedArtifact = path
    ? (task.artifacts ?? []).find((artifact) => artifact.ref.path === path)
    : undefined;
  return {
    path,
    usedFallback: Boolean(
      path
      && candidates.output.length > 0
      && resolvedArtifact?.role !== "output",
    ),
  };
}

export async function resolveTaskMediaReferences(task: Task): Promise<{
  videoRef: MediaReference | null;
  subtitleRef: MediaReference | null;
  contextRef: MediaReference | null;
  outputRef: MediaReference | null;
}> {
  const paths = await resolveTaskMediaPaths(task);
  const artifacts = task.artifacts ?? [];
  const refForPath = (path: string | null) =>
    path ? artifacts.find((artifact) => artifact.ref.path === path)?.ref ?? null : null;

  return {
    videoRef: refForPath(paths.videoPath),
    subtitleRef: refForPath(paths.subtitlePath),
    contextRef: refForPath(paths.contextPath),
    outputRef: refForPath(paths.outputPath),
  };
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
