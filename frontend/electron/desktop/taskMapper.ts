import type { Task } from "../../src/types/task";
import type { OCRTextEvent } from "../../src/types/api";
import type { SubtitleSegment } from "../../src/types/task";
import { TASK_CONTRACT_VERSION, TASK_LIFECYCLE } from "../../src/contracts/runtimeContracts";
export { TASK_CONTRACT_VERSION } from "../../src/contracts/runtimeContracts";
import {
  getDesktopTaskBasename,
  getTaskMediaLabel,
  normalizeDesktopTaskMediaReference,
  resolveTaskMediaPath,
} from "./taskMediaRef";
import type {
  DesktopTaskStatus,
  DesktopTaskType,
  DesktopWorkerEventPayload,
  DesktopWorkerRequest,
  PausedDesktopWorkerTask,
} from "./taskTypes";

function resolveDesktopTaskCreatedAt(payload: Record<string, unknown>) {
  return typeof payload.created_at === "number" && Number.isFinite(payload.created_at)
    ? payload.created_at
    : Date.now();
}

function normalizeTaskResult(result: unknown): Task["result"] {
  if (!result || typeof result !== "object") {
    return {
      success: true,
      files: [],
      meta: {},
    };
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
  if (!Array.isArray(segments)) {
    return [];
  }
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
  if (!Array.isArray(events)) {
    return [];
  }
  return events as OCRTextEvent[];
}

export function isTrackedDesktopCommand(command: string): command is DesktopTaskType {
  return (
    command === "download" ||
    command === "transcribe" ||
    command === "translate" ||
    command === "synthesize" ||
    command === "extract" ||
    command === "enhance" ||
    command === "clean"
  );
}

export function buildDesktopTask(
  id: string,
  command: DesktopTaskType,
  payload: Record<string, unknown>,
  status: DesktopTaskStatus,
  progress: number,
  message?: string,
  result?: unknown,
  error?: string,
): Task {
  const type =
    command === "synthesize"
      ? "synthesis"
      : command === "enhance"
        ? "enhancement"
        : command === "clean"
          ? "cleanup"
          : command;
  const name =
    command === "download"
      ? `Download ${getDesktopTaskBasename(payload.filename || payload.url, "media")}`
      : command === "transcribe"
        ? `Transcribe ${getTaskMediaLabel(payload.audio_ref || payload.audio_path, "audio")}`
        : command === "translate"
          ? `Translate ${getTaskMediaLabel(payload.context_ref || payload.context_path, "subtitles")}`
          : command === "extract"
            ? `Extract ${getTaskMediaLabel(payload.video_ref || payload.video_path, "video")}`
            : command === "enhance"
              ? `Enhance ${getTaskMediaLabel(payload.video_ref || payload.video_path, "video")}`
            : command === "clean"
                ? `Clean ${getTaskMediaLabel(payload.video_ref || payload.video_path, "video")}`
                : `Synthesize ${getTaskMediaLabel(payload.video_ref || payload.video_path, "video")}`;

  const requestVideoRef = normalizeDesktopTaskMediaReference(
    payload.video_ref ||
      payload.audio_ref ||
      payload.file_ref ||
      payload.video_path ||
      payload.audio_path ||
      payload.file_path,
    { media_kind: "video", role: "source" },
  );
  const requestSubtitleRef = normalizeDesktopTaskMediaReference(
    payload.subtitle_ref || payload.context_ref || payload.srt_path || payload.context_path,
    { type: "application/x-subrip" },
  );

  return {
    id,
    type,
    status,
    task_source: "desktop",
    task_contract_version: TASK_CONTRACT_VERSION,
    persistence_scope: "runtime",
    lifecycle: TASK_LIFECYCLE.runtime_only,
    progress,
    name,
    message,
    error,
    request_params: {
      ...payload,
      __desktop_worker: true,
      video_ref: requestVideoRef,
      subtitle_ref:
        command === "translate"
          ? null
          : requestSubtitleRef
            ? { ...requestSubtitleRef, media_kind: "subtitle", role: "subtitle", origin: "task" }
            : null,
      context_ref:
        command === "translate" && requestSubtitleRef
          ? { ...requestSubtitleRef, media_kind: "subtitle", role: "context", origin: "task" }
          : null,
    },
    result:
      status === "completed"
        ? (() => {
            if (command === "transcribe") {
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
                files: subtitlePath
                  ? [{ type: "subtitle", path: subtitlePath }]
                  : [],
                meta: {
                  segments: normalizeSubtitleSegments(transcribeResult?.segments),
                  text: transcribeResult?.text || "",
                  language: transcribeResult?.language || "auto",
                  video_ref: normalizeDesktopTaskMediaReference(
                    transcribeResult?.video_ref || payload.audio_ref || payload.audio_path,
                    { type: "video/mp4" },
                  ),
                  subtitle_ref: subtitleRef,
                  output_ref: normalizeDesktopTaskMediaReference(
                    transcribeResult?.output_ref || subtitleRef,
                    { type: "application/x-subrip" },
                  ),
                },
              };
            }

            if (command === "download") {
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
                  video_ref: normalizeDesktopTaskMediaReference(
                    downloadResult?.meta?.video_ref || downloadVideoPath,
                    { type: "video/mp4" },
                  ),
                  subtitle_ref: normalizeDesktopTaskMediaReference(
                    downloadResult?.meta?.subtitle_ref ||
                      downloadResult?.meta?.output_ref ||
                      downloadSubtitlePath,
                    { type: "application/x-subrip" },
                  ),
                  output_ref: normalizeDesktopTaskMediaReference(
                    downloadResult?.meta?.output_ref ||
                      downloadResult?.meta?.video_ref ||
                      downloadVideoPath,
                    { type: "video/mp4" },
                  ),
                },
                error: downloadResult?.error,
              };
            }

            if (command === "translate") {
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
                files: subtitlePath
                  ? [{ type: "subtitle", path: subtitlePath }]
                  : [],
                meta: {
                  segments: normalizeSubtitleSegments(translateResult?.segments),
                  language: translateResult?.language || "",
                  mode: translateResult?.mode,
                  context_ref: normalizeDesktopTaskMediaReference(
                    translateResult?.context_ref || payload.context_ref || payload.context_path,
                    { type: "application/x-subrip" },
                  ),
                  subtitle_ref: subtitleRef,
                  output_ref: normalizeDesktopTaskMediaReference(
                    translateResult?.output_ref || subtitleRef,
                    { type: "application/x-subrip" },
                  ),
                },
              };
            }

            if (command === "synthesize") {
              const synthesizeResult = result as {
                video_path?: string;
                output_path?: string;
              } | undefined;
              const videoPath = synthesizeResult?.output_path || synthesizeResult?.video_path;
              return {
                success: true,
                files: videoPath ? [{ type: "video", path: videoPath }] : [],
                meta: {
                  video_ref: normalizeDesktopTaskMediaReference(videoPath, { type: "video/mp4" }),
                  output_ref: normalizeDesktopTaskMediaReference(videoPath, { type: "video/mp4" }),
                },
              };
            }

            if (command === "extract") {
              const extractResult = result as {
                events?: unknown[];
                files?: Array<{ type: string; path: string; label?: string }>;
              } | undefined;
              return {
                success: true,
                files: extractResult?.files || [],
                meta: {
                  events: normalizeOcrEvents(extractResult?.events),
                },
              };
            }

            return normalizeTaskResult(result);
          })()
        : undefined,
    created_at: resolveDesktopTaskCreatedAt(payload),
    queue_state:
      status === "pending"
        ? "queued"
        : status === "running"
          ? "running"
          : status === "completed"
            ? "completed"
            : "failed",
  };
}

export function getDesktopTaskSnapshot(params: {
  activeTaskId: string | null;
  queuedTaskIds: string[];
  pausedTasks: Map<string, PausedDesktopWorkerTask>;
  requests: Map<string, DesktopWorkerRequest>;
  historyTasks?: Task[];
}): Task[] {
  const tasks: Array<Task & { queue_position?: number | null }> = [];

  if (params.activeTaskId) {
    const activeRequest = params.requests.get(params.activeTaskId);
    if (activeRequest && isTrackedDesktopCommand(activeRequest.command)) {
      tasks.push({
        ...buildDesktopTask(
          params.activeTaskId,
          activeRequest.command,
          activeRequest.payload,
          "running",
          0,
          "Starting",
        ),
        queue_position: null,
      });
    }
  }

  params.queuedTaskIds.forEach((taskId, index) => {
    const pending = params.requests.get(taskId);
    if (!pending || !isTrackedDesktopCommand(pending.command)) {
      return;
    }

    tasks.push({
      ...buildDesktopTask(taskId, pending.command, pending.payload, "pending", 0, "Queued"),
      queue_position: index + 1,
    });
  });

  params.pausedTasks.forEach((pausedTask, taskId) => {
    tasks.push({
      ...buildDesktopTask(taskId, pausedTask.command, pausedTask.payload, "failed", 0, "Paused"),
      status: "paused",
      queue_state: "paused",
      message: "Paused",
    });
  });

  if (params.historyTasks?.length) {
    tasks.push(
      ...params.historyTasks.map((task) => ({
        ...task,
        task_source: task.task_source ?? "desktop",
        task_contract_version: task.task_contract_version ?? TASK_CONTRACT_VERSION,
        persistence_scope: "history" as const,
        lifecycle: task.lifecycle ?? TASK_LIFECYCLE.history_only,
      })),
    );
  }

  return tasks.sort((a, b) => b.created_at - a.created_at);
}

export function buildDesktopTaskProgressUpdate(params: {
  taskId: string;
  request: DesktopWorkerRequest | undefined;
  payload: unknown;
}): Task | null {
  const { taskId, request, payload } = params;
  if (
    !request ||
    !isTrackedDesktopCommand(request.command) ||
    !payload ||
    typeof payload !== "object"
  ) {
    return null;
  }

  const eventPayload = payload as DesktopWorkerEventPayload;
  return buildDesktopTask(
    taskId,
    request.command,
    request.payload,
    "running",
    Number(eventPayload.progress || 0),
    eventPayload.message,
  );
}

export function buildDesktopTaskResponseUpdate(params: {
  taskId: string;
  request: DesktopWorkerRequest | undefined;
  ok: boolean;
  result?: unknown;
  error?: string;
}): Task | null {
  const { taskId, request, ok, result, error } = params;
  if (!request || !isTrackedDesktopCommand(request.command)) {
    return null;
  }

  if (ok) {
    return buildDesktopTask(
      taskId,
      request.command,
      request.payload,
      "completed",
      100,
      "Completed",
      result,
    );
  }

  const errorMessage = error || "Desktop worker request failed";
  return buildDesktopTask(
    taskId,
    request.command,
    request.payload,
    "failed",
    0,
    errorMessage,
    undefined,
    errorMessage,
  );
}
