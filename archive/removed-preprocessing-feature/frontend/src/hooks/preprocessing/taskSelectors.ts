import type { Task } from "../../types/task";
import { selectTaskById } from "../tasks/taskSelectors";
import type { MediaReference } from "../../services/ui/mediaReference";

const PREPROCESSING_TASK_TYPES = new Set<Task["type"]>([
  "enhancement",
  "cleanup",
  "extract",
]);

function getPreprocessingTaskVideoIdentity(task: Task) {
  const params = task.request_params as Record<string, unknown> | undefined;
  const ref =
    params?.video_ref && typeof params.video_ref === "object"
      ? (params.video_ref as { path?: unknown })
      : null;
  return ref && typeof ref.path === "string" ? ref.path : null;
}

export function getActivePreprocessingTask(
  tasks: Task[],
  currentPreprocessingTaskId: string | null,
  currentPreprocessingTaskVideoRef: MediaReference | null,
  currentVideoRef: MediaReference | null,
): Task | null {
  const activeVideoIdentity = currentPreprocessingTaskVideoRef?.path ?? null;
  const currentVideoIdentity = currentVideoRef?.path ?? null;

  if (
    !currentPreprocessingTaskId ||
    !activeVideoIdentity ||
    !currentVideoIdentity ||
    activeVideoIdentity !== currentVideoIdentity
  ) {
    return null;
  }

  const task = selectTaskById(tasks, currentPreprocessingTaskId);
  if (!task || !PREPROCESSING_TASK_TYPES.has(task.type)) {
    return null;
  }

  return task;
}

export function findRecoverablePreprocessingTask(
  tasks: Task[],
  currentVideoRef: MediaReference | null,
): Task | null {
  const currentVideoIdentity = currentVideoRef?.path ?? null;
  if (!currentVideoIdentity) {
    return null;
  }

  return (
    tasks.find((task) => {
      if (!PREPROCESSING_TASK_TYPES.has(task.type)) {
        return false;
      }
      if (!["running", "pending", "paused", "completed"].includes(task.status)) {
        return false;
      }
      return getPreprocessingTaskVideoIdentity(task) === currentVideoIdentity;
    }) ?? null
  );
}
