import runtimeContract from "../../../contracts/runtime-contract.json";

export type TaskOwnerMode = "desktop" | "backend" | "hybrid";
export type TaskLifecycle = "runtime-only" | "history-only" | "resumable" | "ephemeral-ui";

type RuntimeContractShape = {
  task_contract_version: number;
  desktop_bridge_contract_version: number;
  desktop_worker_protocol_version: number;
  desktop_task_owner_mode: TaskOwnerMode;
  web_task_owner_mode: TaskOwnerMode;
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
export const DESKTOP_WORKER_PROTOCOL_VERSION = contract.desktop_worker_protocol_version;
export const DESKTOP_TASK_OWNER_MODE = contract.desktop_task_owner_mode;
export const WEB_TASK_OWNER_MODE = contract.web_task_owner_mode;
export const TASK_LIFECYCLE = contract.task_lifecycle;

export function getRuntimeTaskOwnerMode(desktopRuntime: boolean): TaskOwnerMode {
  return desktopRuntime ? DESKTOP_TASK_OWNER_MODE : WEB_TASK_OWNER_MODE;
}

export function getTaskLifecycle(args: {
  taskSource: "desktop" | "backend";
  persistenceScope?: "runtime" | "history";
  status: string;
}): TaskLifecycle {
  const { taskSource, persistenceScope, status } = args;

  if (persistenceScope === "history") {
    return TASK_LIFECYCLE.history_only;
  }

  if (taskSource === "desktop") {
    return TASK_LIFECYCLE.runtime_only;
  }

  if (status === "pending" || status === "running" || status === "paused" || status === "processing_result") {
    return TASK_LIFECYCLE.resumable;
  }

  return TASK_LIFECYCLE.history_only;
}
