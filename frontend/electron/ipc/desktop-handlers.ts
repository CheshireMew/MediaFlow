import { app, ipcMain } from "electron";
import {
  DESKTOP_BRIDGE_CAPABILITIES,
  DESKTOP_WORKER_INVOCATIONS,
} from "../desktop/bridgeContract";
import { DesktopWorkerSupervisor } from "../desktop/workerSupervisor";
import {
  DESKTOP_BRIDGE_CONTRACT_VERSION,
  DESKTOP_TASK_OWNER_MODE,
  DESKTOP_WORKER_PROTOCOL_VERSION,
} from "../../src/contracts/runtimeContracts";

export function registerDesktopHandlers(supervisor: DesktopWorkerSupervisor) {
  for (const descriptor of Object.values(DESKTOP_WORKER_INVOCATIONS)) {
    ipcMain.handle(descriptor.ipcChannel, async (_event, payload) => {
      const normalizedPayload =
        payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      return await supervisor.request(descriptor.workerCommand, normalizedPayload);
    });
  }

  ipcMain.handle("desktop:get-runtime-info", async () => {
    return {
      status: "pong" as const,
      contract_version: DESKTOP_BRIDGE_CONTRACT_VERSION,
      bridge_version: app.getVersion(),
      task_owner_mode: DESKTOP_TASK_OWNER_MODE,
      capabilities: [...DESKTOP_BRIDGE_CAPABILITIES],
      worker: {
        protocol_version: DESKTOP_WORKER_PROTOCOL_VERSION,
        app_version: null,
      },
    };
  });
  ipcMain.handle("desktop:list-tasks", async () => supervisor.listTasks());
  ipcMain.handle("desktop:pause-task", async (_event, payload) => {
    return await supervisor.pauseTask(String(payload.task_id));
  });
  ipcMain.handle("desktop:resume-task", async (_event, payload) => {
    return await supervisor.resumeTask(String(payload.task_id));
  });
  ipcMain.handle("desktop:cancel-task", async (_event, payload) => {
    return await supervisor.cancelTask(String(payload.task_id));
  });
}
