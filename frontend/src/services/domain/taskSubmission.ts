import type { TaskResponse, TaskSubmissionReceipt } from "../../types/api";
import type { Task, TaskRequestParams, TaskType } from "../../types/task";
import { getTaskLifecycle, TASK_CONTRACT_VERSION } from "../../contracts/runtimeContracts";

export const TASK_SUBMISSION_CONTRACT_VERSION = TASK_CONTRACT_VERSION;

export interface TaskExecutionSubmission extends TaskSubmissionReceipt {
  execution_mode: "task_submission";
}

export interface ExecutionOutcome<TResult> {
  execution_mode: "task_submission" | "direct_result";
  result: TResult | null;
  submission: TaskExecutionSubmission | null;
}

export type ExecutionOutcomeBranch<TResult> =
  | {
      kind: "result";
      executionMode: "direct_result";
      result: TResult;
    }
  | {
      kind: "submission";
      executionMode: "task_submission";
      submission: TaskExecutionSubmission;
    };

export type ExecutionMode = ExecutionOutcome<unknown>["execution_mode"];
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

export function createDesktopTaskSubmissionReceipt(
  taskId: string,
  message: string,
): TaskExecutionSubmission {
  return {
    execution_mode: "task_submission",
    task_id: taskId,
    status: "queued",
    message,
    task_source: "desktop",
    task_contract_version: TASK_SUBMISSION_CONTRACT_VERSION,
    persistence_scope: "runtime",
    lifecycle: getTaskLifecycle({
      taskSource: "desktop",
      persistenceScope: "runtime",
      status: "pending",
    }),
    queue_state: "queued",
    queue_position: null,
  };
}

export function createExecutionOutcomeFromSubmission<TResult = never>(
  submission: TaskExecutionSubmission,
): ExecutionOutcome<TResult> {
  return {
    execution_mode: "task_submission",
    result: null,
    submission,
  };
}

export function createTaskExecutionSubmissionReceipt(
  response: TaskResponse,
  taskSource: "desktop" | "backend",
): TaskExecutionSubmission {
  if (!response.task_id) {
    throw new Error("Task submission did not return a task_id");
  }

  return {
    execution_mode: "task_submission",
    task_id: response.task_id,
    status: response.status,
    message: response.message,
    task_source: taskSource,
    task_contract_version: TASK_SUBMISSION_CONTRACT_VERSION,
    persistence_scope: "runtime",
    lifecycle: getTaskLifecycle({
      taskSource,
      persistenceScope: "runtime",
      status: response.status,
    }),
    queue_state:
      response.status === "pending"
        ? "queued"
        : response.status === "running"
          ? "running"
          : response.status === "paused"
            ? "paused"
            : response.status === "cancelled"
              ? "cancelled"
              : response.status === "completed"
                ? "completed"
                : response.status === "failed"
                  ? "failed"
                  : "idle",
    queue_position: null,
  };
}

export function createTaskExecutionOutcome<TResult = never>(
  response: TaskResponse,
  taskSource: "desktop" | "backend",
): ExecutionOutcome<TResult> {
  return createExecutionOutcomeFromSubmission<TResult>(
    createTaskExecutionSubmissionReceipt(response, taskSource),
  );
}

export function createDesktopTaskExecutionOutcome<TResult = never>(
  taskId: string,
  message: string,
): ExecutionOutcome<TResult> {
  return createExecutionOutcomeFromSubmission<TResult>(
    createDesktopTaskSubmissionReceipt(taskId, message),
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
  const taskSource = receipt.task_source ?? "backend";

  return {
    id: receipt.task_id,
    type,
    status: mapSubmissionStatusToTaskStatus(receipt),
    task_source: taskSource,
    task_contract_version: receipt.task_contract_version ?? TASK_SUBMISSION_CONTRACT_VERSION,
    persistence_scope: receipt.persistence_scope ?? "runtime",
    lifecycle:
      receipt.lifecycle ??
      getTaskLifecycle({
        taskSource,
        persistenceScope: receipt.persistence_scope ?? "runtime",
        status: mapSubmissionStatusToTaskStatus(receipt),
      }),
    progress: 0,
    name,
    message: receipt.message,
    request_params: {
      ...(taskSource === "desktop" ? { __desktop_worker: true } : {}),
      ...request_params,
    },
    created_at: created_at ?? Date.now(),
    queue_state: receipt.queue_state,
    queue_position: receipt.queue_position ?? null,
  };
}

export function createTaskFromExecutionOutcome<TResult>(args: {
  outcome: ExecutionOutcome<TResult>;
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

export function createDirectExecutionOutcome<TResult>(
  result: TResult,
): ExecutionOutcome<TResult> {
  return {
    execution_mode: "direct_result",
    result,
    submission: null,
  };
}

export function createDirectExecutionResult<TResult>(
  result: TResult,
): ExecutionOutcome<TResult> {
  return createDirectExecutionOutcome(result);
}

export function isTaskExecutionSubmission(
  value: unknown,
): value is TaskExecutionSubmission {
  return Boolean(
    value &&
      typeof value === "object" &&
      "execution_mode" in value &&
      (value as { execution_mode?: unknown }).execution_mode === "task_submission",
  );
}

export function hasExecutionSubmission<TResult>(
  value: ExecutionOutcome<TResult>,
): value is ExecutionOutcome<TResult> & { submission: TaskExecutionSubmission } {
  return value.submission !== null;
}

export function hasExecutionResult<TResult>(
  value: ExecutionOutcome<TResult>,
): value is ExecutionOutcome<TResult> & { result: TResult } {
  return value.result !== null;
}

export function getRequiredExecutionSubmission<TResult>(
  value: ExecutionOutcome<TResult>,
): TaskExecutionSubmission {
  if (!value.submission) {
    throw new Error("Execution outcome did not return a task submission");
  }
  return value.submission;
}

export function getRequiredExecutionResult<TResult>(
  value: ExecutionOutcome<TResult>,
): TResult {
  if (value.result === null) {
    throw new Error("Execution outcome did not return a direct result");
  }
  return value.result;
}

export function resolveExecutionOutcomeBranch<TResult>(
  value: ExecutionOutcome<TResult>,
): ExecutionOutcomeBranch<TResult> {
  if (hasExecutionResult(value)) {
    return {
      kind: "result",
      executionMode: "direct_result",
      result: value.result,
    };
  }

  return {
    kind: "submission",
    executionMode: "task_submission",
    submission: getRequiredExecutionSubmission(value),
  };
}
