import type { DesktopRuntimeInfo } from "../../types/electron-api";
import type { Task } from "../../types/task";

export type RuntimeExecutionSummary = {
  taskSubmission: number;
  directResult: number;
};

function getTaskDiagnosticMediaRefs(task: Task) {
  const requestParams = task.request_params as Record<string, unknown> | undefined;
  const resultMeta = task.result?.meta as Record<string, unknown> | undefined;

  return {
    request: {
      video_ref:
        requestParams?.video_ref && typeof requestParams.video_ref === "object"
          ? requestParams.video_ref
          : null,
      subtitle_ref:
        requestParams?.subtitle_ref && typeof requestParams.subtitle_ref === "object"
          ? requestParams.subtitle_ref
          : null,
      context_ref:
        requestParams?.context_ref && typeof requestParams.context_ref === "object"
          ? requestParams.context_ref
          : null,
    },
    result: {
      video_ref:
        resultMeta?.video_ref && typeof resultMeta.video_ref === "object"
          ? resultMeta.video_ref
          : null,
      subtitle_ref:
        resultMeta?.subtitle_ref && typeof resultMeta.subtitle_ref === "object"
          ? resultMeta.subtitle_ref
          : null,
      context_ref:
        resultMeta?.context_ref && typeof resultMeta.context_ref === "object"
          ? resultMeta.context_ref
          : null,
      output_ref:
        resultMeta?.output_ref && typeof resultMeta.output_ref === "object"
          ? resultMeta.output_ref
          : null,
    },
  };
}

export function createDesktopRuntimeDiagnostic(runtimeInfo: DesktopRuntimeInfo) {
  return {
    contract_version: runtimeInfo.contract_version,
    bridge_version: runtimeInfo.bridge_version,
    task_owner_mode: runtimeInfo.task_owner_mode,
    worker_protocol_version: runtimeInfo.worker.protocol_version,
    capabilities: runtimeInfo.capabilities,
  };
}

export function createTaskDiagnostic(
  task: Task,
  executionSummary: RuntimeExecutionSummary,
) {
  const mediaRefs = getTaskDiagnosticMediaRefs(task);

  return {
    task_source: task.task_source ?? null,
    lifecycle: task.lifecycle ?? null,
    task_contract_version: task.task_contract_version ?? null,
    task_contract_normalized_from_legacy: task.task_contract_normalized_from_legacy ?? false,
    persistence_scope: task.persistence_scope ?? null,
    queue_state: task.queue_state ?? null,
    queue_position: task.queue_position ?? null,
    type: task.type,
    status: task.status,
    params_keys: Object.keys(task.request_params || {}),
    request_media_refs: mediaRefs.request,
    result_files: task.result?.files,
    result_meta: task.result?.meta,
    result_media_refs: mediaRefs.result,
    runtime_execution_summary: executionSummary,
  };
}
