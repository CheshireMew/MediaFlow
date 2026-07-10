import type { ClipExportSegment, SynthesizeOptions } from "../../types/api";
import type { MediaReference } from "../ui/mediaReference";

export type VideoExportScope =
  | { kind: "full-video" }
  | { kind: "clips"; segments: ClipExportSegment[] };

export type VideoExportSubmission = {
  options: SynthesizeOptions;
  outputRef: MediaReference | null;
  outputDir: string | null;
  watermarkPath: string | null;
  subtitleEnabled: boolean;
  watermarkEnabled: boolean;
};

export function getVideoExportClipDuration(scope: VideoExportScope): number {
  if (scope.kind !== "clips") return 0;
  return scope.segments.reduce(
    (total, segment) => total + Math.max(0, segment.end - segment.start),
    0,
  );
}

export function resolveClipRenderMode(
  submission: Pick<
    VideoExportSubmission,
    "subtitleEnabled" | "watermarkEnabled" | "watermarkPath"
  >,
): "burned" | "source" {
  return submission.subtitleEnabled ||
    (submission.watermarkEnabled && Boolean(submission.watermarkPath))
    ? "burned"
    : "source";
}

export function resolveVideoExportOutputDir(
  videoPath: string,
  lastOutputDir: string | null,
  exportKind: VideoExportScope["kind"],
): string {
  if (lastOutputDir) return lastOutputDir;

  const separator = videoPath.includes("\\") ? "\\" : "/";
  const lastSeparator = Math.max(videoPath.lastIndexOf("\\"), videoPath.lastIndexOf("/"));
  const sourceDir = lastSeparator >= 0 ? videoPath.slice(0, lastSeparator) : ".";
  if (exportKind === "full-video") return sourceDir;

  const sourceName = videoPath.slice(lastSeparator + 1) || "video.mp4";
  const sourceStem = sourceName.replace(/\.[^.]+$/, "") || "video";
  return `${sourceDir}${separator}${sourceStem}_clips`;
}
