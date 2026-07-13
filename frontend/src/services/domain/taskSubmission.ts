import type { TaskResponse, TaskSubmissionReceipt } from "../../types/api";
import type { Task, TaskRequestParams, TaskType } from "../../types/task";
import {
  TASK_CONTRACT_VERSION,
  TASK_LIFECYCLE,
  TASK_QUEUE_STATES,
  TASK_PERSISTENCE_SCOPES,
  isTaskMessageCode,
  type TaskLifecycle,
  type TaskPersistenceScope,
  type TaskQueueState,
  type TaskSource,
} from "../../contracts/runtimeContracts";

export const TASK_SUBMISSION_CONTRACT_VERSION = TASK_CONTRACT_VERSION;

export interface TaskExecutionSubmission extends TaskSubmissionReceipt {
  execution_mode: "task_submission";
}

export interface ExecutionOutcome {
  execution_mode: "task_submission";
  result: null;
  submission: TaskExecutionSubmission;
}

export type ExecutionMode = ExecutionOutcome["execution_mode"];
export type NullableExecutionMode = ExecutionMode | null;

function mapSubmissionStatusToTaskStatus(
  receipt: Pick<TaskSubmissionReceipt, "status" | "queue_state">,
): Task["status"] {
  if (receipt.queue_state === "running" || receipt.status === "running") {
    return "running";
  }
  if (receipt.queue_state === "paused" || receipt.status === "paused") {
    return "paused";
  }
  if (receipt.queue_state === "cancelled" || receipt.status === "cancelled") {
    return "cancelled";
  }
  if (receipt.queue_state === "completed" || receipt.status === "completed") {
    return "completed";
  }
  if (receipt.queue_state === "failed" || receipt.status === "failed") {
    return "failed";
  }
  return "pending";
}

export function createExecutionOutcomeFromSubmission(
  submission: TaskExecutionSubmission,
): ExecutionOutcome {
  return {
    execution_mode: "task_submission",
    result: null,
    submission,
  };
}

export function createTaskExecutionSubmissionReceipt(
  response: TaskResponse,
  taskSource: TaskSource = "backend",
): TaskExecutionSubmission {
  if (!response.task_id) {
    throw new Error("Task submission did not return a task_id");
  }
  if (response.task_source !== taskSource) {
    throw new Error(`Task submission source mismatch: expected ${taskSource}, received ${response.task_source}`);
  }
  if (response.task_contract_version !== TASK_SUBMISSION_CONTRACT_VERSION) {
    throw new Error(
      `Task submission contract mismatch: expected ${TASK_SUBMISSION_CONTRACT_VERSION}, received ${response.task_contract_version}`,
    );
  }
  if (
    !response.persistence_scope ||
    !TASK_PERSISTENCE_SCOPES.includes(response.persistence_scope as TaskPersistenceScope)
  ) {
    throw new Error(`Task submission returned invalid persistence scope: ${response.persistence_scope}`);
  }
  if (
    !response.lifecycle ||
    !Object.values(TASK_LIFECYCLE).includes(response.lifecycle as TaskLifecycle)
  ) {
    throw new Error("Task submission did not return lifecycle metadata");
  }
  if (!TASK_QUEUE_STATES.includes(response.queue_state as TaskQueueState)) {
    throw new Error(`Task submission returned invalid queue state: ${response.queue_state}`);
  }
  const messageCode = response.message_code;
  if (!isTaskMessageCode(messageCode)) {
    throw new Error(`Task submission returned invalid message code: ${response.message_code}`);
  }

  const persistenceScope = response.persistence_scope as TaskPersistenceScope;
  const lifecycle = response.lifecycle as TaskLifecycle;
  const queueState = response.queue_state as TaskQueueState;

  return {
    execution_mode: "task_submission",
    task_id: response.task_id,
    status: response.status,
    message_code: messageCode,
    message_params: response.message_params,
    task_source: response.task_source,
    task_contract_version: response.task_contract_version,
    revision: response.revision,
    persistence_scope: persistenceScope,
    lifecycle,
    queue_state: queueState,
    queue_position: response.queue_position ?? null,
    primary_operation: response.primary_operation,
  };
}

export function createTaskExecutionOutcome(
  response: TaskResponse,
  taskSource: TaskSource = "backend",
): ExecutionOutcome {
  return createExecutionOutcomeFromSubmission(
    createTaskExecutionSubmissionReceipt(response, taskSource),
  );
}

export function createTaskFromSubmissionReceipt(args: {
  receipt: TaskSubmissionReceipt;
  type: TaskType;
  name?: string;
  request_params?: TaskRequestParams;
  created_at?: number;
}): Task {
  const { receipt, type, name, request_params, created_at } = args;
  return {
    id: receipt.task_id,
    type,
    status: mapSubmissionStatusToTaskStatus(receipt),
    task_source: receipt.task_source,
    task_contract_version: receipt.task_contract_version,
    revision: receipt.revision,
    persistence_scope: receipt.persistence_scope,
    lifecycle: receipt.lifecycle,
    progress: 0,
    name,
    message_code: receipt.message_code,
    message_params: receipt.message_params,
    request_params,
    primary_operation: receipt.primary_operation,
    created_at: created_at ?? Date.now(),
    queue_state: receipt.queue_state,
    queue_position: receipt.queue_position ?? null,
  };
}

export function createTaskFromExecutionOutcome(args: {
  outcome: ExecutionOutcome;
  type: TaskType;
  name?: string;
  request_params?: TaskRequestParams;
  created_at?: number;
}): Task {
  const { outcome, ...taskArgs } = args;
  const submission = getRequiredExecutionSubmission(outcome);
  return createTaskFromSubmissionReceipt({
    ...taskArgs,
    receipt: submission,
  });
}

export function getRequiredExecutionSubmission(
  value: ExecutionOutcome,
): TaskExecutionSubmission {
  return value.submission;
}

export function getExecutionSubmission(
  value: ExecutionOutcome,
): TaskExecutionSubmission {
  return getRequiredExecutionSubmission(value);
}
