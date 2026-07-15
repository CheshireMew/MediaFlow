import type { DesktopRuntimeInfo } from "../../types/electron-api";
import type { Task } from "../../types/task";

export type RuntimeExecutionSummary = {
  taskSubmission: number;
};

export function createDesktopRuntimeDiagnostic(runtimeInfo: DesktopRuntimeInfo) {
  return {
    contract_version: runtimeInfo.contract_version,
    bridge_version: runtimeInfo.bridge_version,
    capabilities: runtimeInfo.capabilities,
    backend: runtimeInfo.backend,
  };
}

export function createTaskDiagnostic(
  task: Task,
  executionSummary: RuntimeExecutionSummary,
) {
  return {
    task_source: task.task_source,
    primary_operation: task.primary_operation,
    lifecycle: task.lifecycle,
    task_contract_version: task.task_contract_version,
    persistence_scope: task.persistence_scope,
    queue_state: task.queue_state,
    queue_position: task.queue_position ?? null,
    type: task.type,
    status: task.status,
    params_keys: Object.keys(task.request_params || {}),
    result_outputs: task.result?.outputs,
    artifacts: task.artifacts,
    runtime_execution_summary: executionSummary,
  };
}
