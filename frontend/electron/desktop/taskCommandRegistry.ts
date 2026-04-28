import type { Task } from "../../src/types/task";
import type { OCRTextEvent } from "../../src/types/api";
import type { SubtitleSegment } from "../../src/types/task";
import {
  getDesktopTaskBasename,
  getTaskMediaLabel,
  normalizeDesktopTaskMediaReference,
  resolveTaskMediaPath,
} from "./taskMediaRef";
import type { DesktopTaskType } from "./taskTypes";

export type DesktopRequestMediaRefs = {
  videoRef: ReturnType<typeof normalizeDesktopTaskMediaReference>;
  subtitleRef: ReturnType<typeof normalizeDesktopTaskMediaReference>;
  contextRef: ReturnType<typeof normalizeDesktopTaskMediaReference>;
};

export type DesktopCommandMapper = {
  taskType: Task["type"];
  name: (payload: Record<string, unknown>) => string;
  requestMedia: (payload: Record<string, unknown>) => DesktopRequestMediaRefs;
  result: (args: { payload: Record<string, unknown>; result: unknown }) => Task["result"];
};

function normalizeTaskResult(result: unknown): Task["result"] {
  if (!result || typeof result !== "object") {
    return { success: true, files: [], meta: {} };
  }
  const candidate = result as Partial<Task["result"]> & Record<string, unknown>;
  return {
    success: typeof candidate.success === "boolean" ? candidate.success : true,
    files: Array.isArray(candidate.files) ? candidate.files : [],
    meta:
      candidate.meta && typeof candidate.meta === "object" && !Array.isArray(candidate.meta)
        ? (candidate.meta as Record<string, unknown>)
        : {},
    error: typeof candidate.error === "string" ? candidate.error : undefined,
  };
}

function normalizeSubtitleSegments(segments: unknown): SubtitleSegment[] {
  if (!Array.isArray(segments)) return [];
  return segments.filter(
    (segment): segment is SubtitleSegment =>
      Boolean(segment) &&
      typeof segment === "object" &&
      "id" in segment &&
      typeof (segment as SubtitleSegment).start === "number" &&
      typeof (segment as SubtitleSegment).end === "number" &&
      typeof (segment as SubtitleSegment).text === "string",
  );
}

function normalizeOcrEvents(events: unknown): OCRTextEvent[] {
  return Array.isArray(events) ? (events as OCRTextEvent[]) : [];
}

function sourceMediaRef(payload: Record<string, unknown>) {
  return normalizeDesktopTaskMediaReference(
    payload.video_ref ||
      payload.audio_ref ||
      payload.file_ref ||
      payload.video_path ||
      payload.audio_path ||
      payload.file_path,
    { media_kind: "video", role: "source" },
  );
}

function subtitleMediaRef(payload: Record<string, unknown>) {
  return normalizeDesktopTaskMediaReference(
    payload.subtitle_ref || payload.context_ref || payload.srt_path || payload.context_path,
    { type: "application/x-subrip" },
  );
}

function defaultRequestMedia(payload: Record<string, unknown>): DesktopRequestMediaRefs {
  return {
    videoRef: sourceMediaRef(payload),
    subtitleRef: normalizeDesktopTaskMediaReference(subtitleMediaRef(payload), {
      media_kind: "subtitle",
      role: "subtitle",
      origin: "task",
    }),
    contextRef: null,
  };
}

function downloadResult(result: unknown): Task["result"] {
  const downloadResult = result as {
    files?: Array<{ type: string; path: string; label?: string }>;
    meta?: Record<string, unknown>;
    error?: string;
  } | undefined;
  const downloadVideoPath = resolveTaskMediaPath(
    downloadResult?.meta?.video_ref ||
      (downloadResult?.files || []).find((file) => file.type === "video")?.path,
  );
  const downloadSubtitlePath = resolveTaskMediaPath(
    downloadResult?.meta?.subtitle_ref ||
      downloadResult?.meta?.output_ref ||
      downloadResult?.meta?.srt_path ||
      (downloadResult?.files || []).find((file) => file.type === "subtitle")?.path,
  );
  return {
    success: true,
    files: downloadResult?.files || [],
    meta: {
      ...(downloadResult?.meta || {}),
      video_ref: normalizeDesktopTaskMediaReference(downloadResult?.meta?.video_ref || downloadVideoPath, {
        type: "video/mp4",
      }),
      subtitle_ref: normalizeDesktopTaskMediaReference(
        downloadResult?.meta?.subtitle_ref || downloadResult?.meta?.output_ref || downloadSubtitlePath,
        { type: "application/x-subrip" },
      ),
      output_ref: normalizeDesktopTaskMediaReference(
        downloadResult?.meta?.output_ref || downloadResult?.meta?.video_ref || downloadVideoPath,
        { type: "video/mp4" },
      ),
    },
    error: downloadResult?.error,
  };
}

function transcribeResult(payload: Record<string, unknown>, result: unknown): Task["result"] {
  const transcribeResult = result as {
    segments?: unknown[];
    text?: string;
    language?: string;
    video_ref?: unknown;
    subtitle_ref?: unknown;
    output_ref?: unknown;
  } | undefined;
  const subtitleRef = normalizeDesktopTaskMediaReference(
    transcribeResult?.subtitle_ref || transcribeResult?.output_ref,
    { type: "application/x-subrip" },
  );
  const subtitlePath = resolveTaskMediaPath(subtitleRef);
  return {
    success: true,
    files: subtitlePath ? [{ type: "subtitle", path: subtitlePath }] : [],
    meta: {
      segments: normalizeSubtitleSegments(transcribeResult?.segments),
      text: transcribeResult?.text || "",
      language: transcribeResult?.language || "auto",
      video_ref: normalizeDesktopTaskMediaReference(
        transcribeResult?.video_ref || payload.audio_ref || payload.audio_path,
        { type: "video/mp4" },
      ),
      subtitle_ref: subtitleRef,
      output_ref: normalizeDesktopTaskMediaReference(transcribeResult?.output_ref || subtitleRef, {
        type: "application/x-subrip",
      }),
    },
  };
}

function translateResult(payload: Record<string, unknown>, result: unknown): Task["result"] {
  const translateResult = result as {
    segments?: unknown[];
    language?: string;
    context_ref?: unknown;
    subtitle_ref?: unknown;
    output_ref?: unknown;
    mode?: string;
  } | undefined;
  const subtitleRef = normalizeDesktopTaskMediaReference(
    translateResult?.subtitle_ref || translateResult?.output_ref,
    { type: "application/x-subrip" },
  );
  const subtitlePath = resolveTaskMediaPath(subtitleRef);
  return {
    success: true,
    files: subtitlePath ? [{ type: "subtitle", path: subtitlePath }] : [],
    meta: {
      segments: normalizeSubtitleSegments(translateResult?.segments),
      language: translateResult?.language || "",
      mode: translateResult?.mode,
      context_ref: normalizeDesktopTaskMediaReference(
        translateResult?.context_ref || payload.context_ref || payload.context_path,
        { type: "application/x-subrip" },
      ),
      subtitle_ref: subtitleRef,
      output_ref: normalizeDesktopTaskMediaReference(translateResult?.output_ref || subtitleRef, {
        type: "application/x-subrip",
      }),
    },
  };
}

export const desktopCommandMappers: Record<DesktopTaskType, DesktopCommandMapper> = {
  download: {
    taskType: "download",
    name: (payload) => `Download ${getDesktopTaskBasename(payload.filename || payload.url, "media")}`,
    requestMedia: defaultRequestMedia,
    result: ({ result }) => downloadResult(result),
  },
  transcribe: {
    taskType: "transcribe",
    name: (payload) => `Transcribe ${getTaskMediaLabel(payload.audio_ref || payload.audio_path, "audio")}`,
    requestMedia: defaultRequestMedia,
    result: ({ payload, result }) => transcribeResult(payload, result),
  },
  translate: {
    taskType: "translate",
    name: (payload) => `Translate ${getTaskMediaLabel(payload.context_ref || payload.context_path, "subtitles")}`,
    requestMedia: (payload) => ({
      videoRef: sourceMediaRef(payload),
      subtitleRef: null,
      contextRef: normalizeDesktopTaskMediaReference(subtitleMediaRef(payload), {
        media_kind: "subtitle",
        role: "context",
        origin: "task",
      }),
    }),
    result: ({ payload, result }) => translateResult(payload, result),
  },
  synthesize: {
    taskType: "synthesis",
    name: (payload) => `Synthesize ${getTaskMediaLabel(payload.video_ref || payload.video_path, "video")}`,
    requestMedia: defaultRequestMedia,
    result: ({ result }) => {
      const synthesizeResult = result as { video_path?: string; output_path?: string } | undefined;
      const videoPath = synthesizeResult?.output_path || synthesizeResult?.video_path;
      return {
        success: true,
        files: videoPath ? [{ type: "video", path: videoPath }] : [],
        meta: {
          video_ref: normalizeDesktopTaskMediaReference(videoPath, { type: "video/mp4" }),
          output_ref: normalizeDesktopTaskMediaReference(videoPath, { type: "video/mp4" }),
        },
      };
    },
  },
  extract: {
    taskType: "extract",
    name: (payload) => `Extract ${getTaskMediaLabel(payload.video_ref || payload.video_path, "video")}`,
    requestMedia: defaultRequestMedia,
    result: ({ result }) => {
      const extractResult = result as {
        events?: unknown[];
        files?: Array<{ type: string; path: string; label?: string }>;
      } | undefined;
      return {
        success: true,
        files: extractResult?.files || [],
        meta: { events: normalizeOcrEvents(extractResult?.events) },
      };
    },
  },
  enhance: {
    taskType: "enhancement",
    name: (payload) => `Enhance ${getTaskMediaLabel(payload.video_ref || payload.video_path, "video")}`,
    requestMedia: defaultRequestMedia,
    result: ({ result }) => normalizeTaskResult(result),
  },
  clean: {
    taskType: "cleanup",
    name: (payload) => `Clean ${getTaskMediaLabel(payload.video_ref || payload.video_path, "video")}`,
    requestMedia: defaultRequestMedia,
    result: ({ result }) => normalizeTaskResult(result),
  },
};
