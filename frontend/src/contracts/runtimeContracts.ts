import runtimeContract from "../../../contracts/runtime-contract.json";

export type TaskOwnerMode = "backend";
export type TaskLifecycle = "runtime-only" | "history-only" | "resumable" | "ephemeral-ui";
export type TaskSource = "backend";
export type TaskPersistenceScope = "runtime" | "history";
export type TaskQueueState =
  | "queued"
  | "running"
  | "paused"
  | "cancelled"
  | "completed"
  | "failed"
  | "idle";
export type TaskStatus =
  | "pending"
  | "running"
  | "processing_result"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

type RuntimeContractShape = {
  task_contract_version: number;
  desktop_bridge_contract_version: number;
  task_owner_mode: TaskOwnerMode;
  task_statuses: TaskStatus[];
  task_sources: TaskSource[];
  task_persistence_scopes: TaskPersistenceScope[];
  task_queue_states: TaskQueueState[];
  features: {
    preprocessing: boolean;
  };
  task_lifecycle: {
    runtime_only: TaskLifecycle;
    history_only: TaskLifecycle;
    resumable: TaskLifecycle;
    ephemeral_ui: TaskLifecycle;
  };
};

const contract = runtimeContract as RuntimeContractShape;

export const TASK_CONTRACT_VERSION = contract.task_contract_version;
export const DESKTOP_BRIDGE_CONTRACT_VERSION = contract.desktop_bridge_contract_version;
export const TASK_OWNER_MODE = contract.task_owner_mode;
export const TASK_STATUSES = contract.task_statuses;
export const TASK_SOURCES = contract.task_sources;
export const TASK_PERSISTENCE_SCOPES = contract.task_persistence_scopes;
export const TASK_QUEUE_STATES = contract.task_queue_states;
export const RUNTIME_FEATURES = contract.features;
export const TASK_LIFECYCLE = contract.task_lifecycle;

export function getTaskLifecycle(args: {
  taskSource: TaskSource;
  persistenceScope?: "runtime" | "history";
  status: string;
}): TaskLifecycle {
  const { persistenceScope, status } = args;

  if (persistenceScope === "history") {
    return TASK_LIFECYCLE.history_only;
  }

  if (status === "pending" || status === "running" || status === "paused" || status === "processing_result") {
    return TASK_LIFECYCLE.resumable;
  }

  return TASK_LIFECYCLE.history_only;
}
