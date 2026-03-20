import type { Task } from "../../types/task";
import { selectTaskById } from "../tasks/taskSelectors";

const PREPROCESSING_TASK_TYPES = new Set<Task["type"]>([
  "enhancement",
  "cleanup",
  "extract",
]);

export function getActivePreprocessingTask(
  tasks: Task[],
  activeTaskId: string | null,
  activeTaskVideoPath: string | null,
  currentVideoPath: string | null,
): Task | null {
  if (!activeTaskId || !activeTaskVideoPath || activeTaskVideoPath !== currentVideoPath) {
    return null;
  }

  const task = selectTaskById(tasks, activeTaskId);
  if (!task || !PREPROCESSING_TASK_TYPES.has(task.type)) {
    return null;
  }

  return task;
}
