export type {
  AggregatedTaskSourceState,
  TaskSource,
  TaskSourceBundle,
  TaskSourceKind,
} from "./taskSources/types";
export {
  aggregateTaskSourceState,
  applyTaskSnapshot,
  createTaskSourceBundle,
  getTaskSourceForTask,
  hasActiveRemoteTasks,
  hasSupportedTaskContract,
  isDesktopTask,
  normalizeTaskForRenderer,
  SUPPORTED_TASK_CONTRACT_VERSION,
  getTaskSourceOwnerMode,
  isTaskAllowedInOwnerMode,
  normalizeTaskForOwnerMode,
} from "./taskSources/shared";
export { createDesktopTaskSource } from "./taskSources/desktopSource";
export { createBackendTaskSource } from "./taskSources/backendSource";
export {
  ACTIVE_TASK_STATUSES,
  isTaskActive,
  isTaskHistoryEntry,
  isTaskPaused,
  isTaskQueued,
  isTaskRecoverable,
  isTaskRunning,
  isTaskTerminal,
} from "../services/tasks/taskRuntimeState";
