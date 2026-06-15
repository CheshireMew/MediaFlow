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

const firstSortedArtifactRef = (
  task: TaskWithDetails,
  predicate: (artifact: TaskArtifact) => boolean,
): MediaReference | null => sortedArtifacts(task, predicate)[0]?.ref ?? null;

const artifactPaths = (
  task: TaskWithDetails,
  predicate: (artifact: TaskArtifact) => boolean,
) =>
  sortedArtifacts(task, predicate)
    .map((artifact) => artifact.ref.path);

const sortedArtifacts = (
  task: TaskWithDetails,
  predicate: (artifact: TaskArtifact) => boolean,
) =>
  artifactsOf(task)
    .filter(predicate)
    .sort(
      (left, right) =>
        rolePriority(left.role) - rolePriority(right.role) ||
        outputKindPriority(task, left) - outputKindPriority(task, right),
    );

const rolePriority = (role: TaskArtifact["role"]) => {
  switch (role) {
    case "output":
      return 0;
    case "input":
      return 1;
    case "context":
      return 2;
    default:
      return 3;
  }
};

const outputKindPriority = (task: TaskWithDetails, artifact: TaskArtifact) => {
  if (artifact.role !== "output") {
    return fallbackKindPriority(artifact.kind);
  }

  const operation = task.primary_operation ?? task.type;
  switch (operation) {
    case "synthesis":
    case "clip_export":
    case "enhancement":
    case "cleanup":
      return artifact.kind === "video" ? 0 : fallbackKindPriority(artifact.kind) + 1;
    case "transcribe":
    case "translate":
      return artifact.kind === "subtitle" ? 0 : fallbackKindPriority(artifact.kind) + 1;
    case "download":
      if (artifact.kind === "video") return 0;
      if (artifact.kind === "audio") return 1;
      return fallbackKindPriority(artifact.kind) + 1;
    default:
      return fallbackKindPriority(artifact.kind);
  }
};

const fallbackKindPriority = (kind: TaskArtifact["kind"]) => {
  switch (kind) {
    case "video":
      return 0;
    case "audio":
      return 1;
    case "subtitle":
      return 2;
    case "image":
      return 3;
    default:
      return 4;
  }
};

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
      firstSortedArtifactRef(task, (artifact) => artifact.role === "output"),
  };
}

export function getTaskMediaCandidates(task: TaskWithDetails) {
  return {
    video: artifactPaths(task, (artifact) => artifact.kind === "video" || artifact.kind === "audio"),
    subtitle: artifactPaths(task, (artifact) => artifact.kind === "subtitle"),
    context: artifactPaths(task, (artifact) => artifact.role === "context"),
    output: artifactPaths(task, (artifact) => artifact.role === "output"),
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
