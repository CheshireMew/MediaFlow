import runtimeContract from "../../../contracts/runtime-contract.json";
import {
  TASK_MESSAGE_CODES,
  type TaskMessageCode,
} from "./generatedTaskMessageCatalog";
export type { TaskMessageCode } from "./generatedTaskMessageCatalog";

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
  task_persistence_scopes: TaskPersistenceScope[];
  task_queue_states: TaskQueueState[];
  task_message_codes: TaskMessageCode[];
  task_status_projection: Record<
    TaskStatus,
    {
      persistence_scope: TaskPersistenceScope;
      lifecycle: TaskLifecycle;
      queue_state: TaskQueueState;
      is_active: boolean;
      is_running: boolean;
    }
  >;
  asr_execution_preferences: {
    key: string;
    schema_version: number;
    defaults: {
      engine: "builtin" | "cli";
      model: string;
      device: string;
    };
  };
  task_lifecycle: {
    runtime_only: TaskLifecycle;
    history_only: TaskLifecycle;
    resumable: TaskLifecycle;
    ephemeral_ui: TaskLifecycle;
  };
};

const contract = runtimeContract as RuntimeContractShape;

if (
  contract.task_message_codes.length !== TASK_MESSAGE_CODES.length ||
  contract.task_message_codes.some((code, index) => code !== TASK_MESSAGE_CODES[index])
) {
  throw new Error("Generated task message catalog is out of sync with runtime-contract.json");
}

export const TASK_CONTRACT_VERSION = contract.task_contract_version;
export const DESKTOP_BRIDGE_CONTRACT_VERSION = contract.desktop_bridge_contract_version;
export const TASK_PERSISTENCE_SCOPES = contract.task_persistence_scopes;
export const TASK_QUEUE_STATES = contract.task_queue_states;
export { TASK_MESSAGE_CODES };
export const TASK_STATUS_PROJECTION = contract.task_status_projection;
export const ASR_EXECUTION_PREFERENCES = contract.asr_execution_preferences;
export const TASK_LIFECYCLE = contract.task_lifecycle;

const taskMessageCodeSet = new Set<string>(TASK_MESSAGE_CODES);

export function isTaskMessageCode(value: unknown): value is TaskMessageCode {
  return typeof value === "string" && taskMessageCodeSet.has(value);
}

export function getTaskQueueState(status: TaskStatus): TaskQueueState {
  return TASK_STATUS_PROJECTION[status].queue_state;
}

export function isRuntimeTaskActive(status: TaskStatus): boolean {
  return TASK_STATUS_PROJECTION[status].is_active;
}

export function isRuntimeTaskRunning(status: TaskStatus): boolean {
  return TASK_STATUS_PROJECTION[status].is_running;
}
