const TASK_DISPLAY_HEAD_LENGTH = 4;
const TASK_DISPLAY_TAIL_LENGTH = 4;

export function formatTaskDisplayId(taskId: string): string {
  const normalizedTaskId = taskId.trim();

  if (!normalizedTaskId) {
    return "#unknown";
  }

  if (normalizedTaskId.length <= TASK_DISPLAY_HEAD_LENGTH + TASK_DISPLAY_TAIL_LENGTH) {
    return `#${normalizedTaskId}`;
  }

  return `#${normalizedTaskId.slice(0, TASK_DISPLAY_HEAD_LENGTH)}...${normalizedTaskId.slice(-TASK_DISPLAY_TAIL_LENGTH)}`;
}
