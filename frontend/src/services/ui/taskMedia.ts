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
import { createMediaReference, type MediaReference } from "./mediaReference";
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
  const primaryMedia = await resolveTaskMediaReferences(task);
  const resolvedPaths = await resolveTaskMediaPaths(task);
  const canonicalVideoPath = resolvedPaths.videoPath ?? primaryMedia.videoRef?.path ?? null;
  const canonicalSubtitlePath = resolvedPaths.subtitlePath ?? primaryMedia.subtitleRef?.path ?? null;
  const videoRef =
    primaryMedia.videoRef && canonicalVideoPath !== primaryMedia.videoRef.path
      ? createMediaReference({
          path: canonicalVideoPath ?? primaryMedia.videoRef.path,
          name: primaryMedia.videoRef.name,
          size: primaryMedia.videoRef.size,
          type: primaryMedia.videoRef.type,
          media_id: primaryMedia.videoRef.media_id,
          media_kind: primaryMedia.videoRef.media_kind,
          role: primaryMedia.videoRef.role,
          origin: primaryMedia.videoRef.origin,
        })
      : primaryMedia.videoRef;
  const subtitleRef =
    primaryMedia.subtitleRef && canonicalSubtitlePath !== primaryMedia.subtitleRef.path
      ? createMediaReference({
          path: canonicalSubtitlePath ?? primaryMedia.subtitleRef.path,
          name: primaryMedia.subtitleRef.name,
          size: primaryMedia.subtitleRef.size,
          type: primaryMedia.subtitleRef.type,
          media_id: primaryMedia.subtitleRef.media_id,
          media_kind: primaryMedia.subtitleRef.media_kind,
          role: primaryMedia.subtitleRef.role,
          origin: primaryMedia.subtitleRef.origin,
        })
      : primaryMedia.subtitleRef;

  return createNavigationMediaPayload({
    videoPath: canonicalVideoPath,
    subtitlePath: canonicalSubtitlePath,
    videoRef,
    subtitleRef,
  });
}
