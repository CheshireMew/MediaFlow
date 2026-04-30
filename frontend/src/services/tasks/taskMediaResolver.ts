import type { Task, TaskArtifact, TaskRequestParams, TaskResult } from "../../types/task";
import type { MediaReference } from "../ui/mediaReference";

type TaskWithDetails = Task & {
  request_params?: TaskRequestParams;
  result?: TaskResult;
};

const artifactsOf = (task: TaskWithDetails): TaskArtifact[] => task.artifacts ?? [];

const firstArtifactRef = (
  task: TaskWithDetails,
  predicate: (artifact: TaskArtifact) => boolean,
): MediaReference | null => artifactsOf(task).find(predicate)?.ref ?? null;

const artifactPaths = (
  task: TaskWithDetails,
  predicate: (artifact: TaskArtifact) => boolean,
) => artifactsOf(task).filter(predicate).map((artifact) => artifact.ref.path);

export function getTaskStructuredMediaRefs(task: TaskWithDetails) {
  return {
    videoRef:
      firstArtifactRef(task, (artifact) => artifact.kind === "video" && artifact.role === "output") ??
      firstArtifactRef(task, (artifact) => artifact.kind === "video" && artifact.role === "input"),
    subtitleRef:
      firstArtifactRef(task, (artifact) => artifact.kind === "subtitle" && artifact.role === "output") ??
      firstArtifactRef(task, (artifact) => artifact.kind === "subtitle" && artifact.role === "input"),
    contextRef:
      firstArtifactRef(task, (artifact) => artifact.role === "context"),
    outputRef:
      firstArtifactRef(task, (artifact) => artifact.role === "output"),
  };
}

export function getTaskMediaCandidates(task: TaskWithDetails) {
  return {
    video: artifactPaths(task, (artifact) => artifact.kind === "video" || artifact.kind === "audio"),
    subtitle: artifactPaths(task, (artifact) => artifact.kind === "subtitle"),
    context: artifactPaths(task, (artifact) => artifact.role === "context"),
  };
}

export function resolvePrimaryTaskMedia(task: TaskWithDetails) {
  const structuredRefs = getTaskStructuredMediaRefs(task);
  const candidates = getTaskMediaCandidates(task);
  const contextCandidate = candidates.context.find(
    (value): value is string => typeof value === "string" && value.length > 0,
  );

  return {
    videoRef: structuredRefs.videoRef,
    subtitleRef:
      structuredRefs.subtitleRef,
    contextRef: structuredRefs.contextRef,
    outputRef: structuredRefs.outputRef,
    contextPath: contextCandidate ?? null,
  };
}

export function resolveTranslationTaskMedia(task: Task) {
  const sourceSubtitleRef =
    firstArtifactRef(task, (artifact) => artifact.kind === "subtitle" && artifact.role === "context") ??
    firstArtifactRef(task, (artifact) => artifact.kind === "subtitle" && artifact.role === "input");

  const targetSubtitleRef =
    firstArtifactRef(task, (artifact) => artifact.kind === "subtitle" && artifact.role === "output");

  return {
    sourceSubtitleRef,
    targetSubtitleRef,
  };
}

export function hasTranscribeStep(task: Task): boolean {
  return task.primary_operation === "transcribe";
}

export function resolveTranscribeTaskMedia(task: Task) {
  const sourceMediaRef =
    firstArtifactRef(task, (artifact) => artifact.kind === "video" && artifact.role === "input") ??
    firstArtifactRef(task, (artifact) => artifact.kind === "audio" && artifact.role === "input") ??
    firstArtifactRef(task, (artifact) => artifact.kind === "video" && artifact.role === "output") ??
    firstArtifactRef(task, (artifact) => artifact.kind === "audio" && artifact.role === "output");
  const subtitleRef = firstArtifactRef(task, (artifact) => artifact.kind === "subtitle" && artifact.role === "output");

  return {
    sourceMediaRef,
    subtitleRef,
    sourceCandidates: sourceMediaRef?.path ? [sourceMediaRef.path] : [],
  };
}
