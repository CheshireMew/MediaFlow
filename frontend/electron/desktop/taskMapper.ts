import type { Task } from "../../src/types/task";
import { TASK_CONTRACT_VERSION, TASK_LIFECYCLE } from "../../src/contracts/runtimeContracts";
export { TASK_CONTRACT_VERSION } from "../../src/contracts/runtimeContracts";
import { desktopCommandMappers } from "./taskCommandRegistry";
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

export function isTrackedDesktopCommand(command: string): command is DesktopTaskType {
  return command in desktopCommandMappers;
}

export function createDesktopTask(params: {
  id: string;
  command: DesktopTaskType;
  payload: Record<string, unknown>;
  status: DesktopTaskStatus;
  progress: number;
  message?: string;
  result?: unknown;
  error?: string;
}): Task {
  const mapper = desktopCommandMappers[params.command];
  const requestMedia = mapper.requestMedia(params.payload);
  return {
    id: params.id,
    type: mapper.taskType,
    status: params.status,
    task_source: "desktop",
    task_contract_version: TASK_CONTRACT_VERSION,
    persistence_scope: "runtime",
    lifecycle: TASK_LIFECYCLE.runtime_only,
    progress: params.progress,
    name: mapper.name(params.payload),
    message: params.message,
    error: params.error,
    request_params: {
      ...params.payload,
      __desktop_worker: true,
      video_ref: requestMedia.videoRef,
      subtitle_ref: requestMedia.subtitleRef,
      context_ref: requestMedia.contextRef,
    },
    result:
      params.status === "completed"
        ? mapper.result({ payload: params.payload, result: params.result })
        : undefined,
    created_at: resolveDesktopTaskCreatedAt(params.payload),
    queue_state:
      params.status === "pending"
        ? "queued"
        : params.status === "running"
          ? "running"
          : params.status === "completed"
            ? "completed"
            : "failed",
  };
}

export function getDesktopTaskSnapshot(params: {
  activeTaskId: string | null;
  queuedTaskIds: string[];
  pausedTasks: Map<string, PausedDesktopWorkerTask>;
  requests: ReadonlyMap<string, DesktopWorkerRequest>;
  historyTasks?: Task[];
}): Task[] {
  const tasks: Array<Task & { queue_position?: number | null }> = [];

  if (params.activeTaskId) {
    const activeRequest = params.requests.get(params.activeTaskId);
    if (activeRequest && isTrackedDesktopCommand(activeRequest.command)) {
      tasks.push({
        ...createDesktopTask({
          id: params.activeTaskId,
          command: activeRequest.command,
          payload: activeRequest.payload,
          status: "running",
          progress: 0,
          message: "Starting",
        }),
        queue_position: null,
      });
    }
  }

  params.queuedTaskIds.forEach((taskId, index) => {
    const pending = params.requests.get(taskId);
    if (!pending || !isTrackedDesktopCommand(pending.command)) return;
    tasks.push({
      ...createDesktopTask({
        id: taskId,
        command: pending.command,
        payload: pending.payload,
        status: "pending",
        progress: 0,
        message: "Queued",
      }),
      queue_position: index + 1,
    });
  });

  params.pausedTasks.forEach((pausedTask, taskId) => {
    tasks.push({
      ...createDesktopTask({
        id: taskId,
        command: pausedTask.command,
        payload: pausedTask.payload,
        status: "failed",
        progress: 0,
        message: "Paused",
      }),
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

export function createDesktopTaskProgressUpdate(params: {
  taskId: string;
  request: DesktopWorkerRequest | undefined;
  payload: unknown;
}): Task | null {
  const { taskId, request, payload } = params;
  if (!request || !isTrackedDesktopCommand(request.command) || !payload || typeof payload !== "object") {
    return null;
  }
  const eventPayload = payload as DesktopWorkerEventPayload;
  return createDesktopTask({
    id: taskId,
    command: request.command,
    payload: request.payload,
    status: "running",
    progress: Number(eventPayload.progress || 0),
    message: eventPayload.message,
  });
}

export function createDesktopTaskResponseUpdate(params: {
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
    return createDesktopTask({
      id: taskId,
      command: request.command,
      payload: request.payload,
      status: "completed",
      progress: 100,
      message: "Completed",
      result,
    });
  }
  const errorMessage = error || "Desktop worker request failed";
  return createDesktopTask({
    id: taskId,
    command: request.command,
    payload: request.payload,
    status: "failed",
    progress: 0,
    message: errorMessage,
    error: errorMessage,
  });
}
