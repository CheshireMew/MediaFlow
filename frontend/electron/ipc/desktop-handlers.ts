import { app, ipcMain } from "electron";
import {
  DESKTOP_BRIDGE_CAPABILITIES,
  DESKTOP_WORKER_PROTOCOL_VERSION,
  DESKTOP_WORKER_INVOCATIONS,
} from "../desktop/bridgeContract";
import { DesktopWorkerSupervisor } from "../desktop/workerSupervisor";
import {
  DESKTOP_BRIDGE_CONTRACT_VERSION,
  DESKTOP_TASK_OWNER_MODE,
} from "../../src/contracts/runtimeContracts";
import { desktopFileAccess } from "./file-access";

export function registerDesktopHandlers(supervisor: DesktopWorkerSupervisor) {
  for (const descriptor of Object.values(DESKTOP_WORKER_INVOCATIONS)) {
    ipcMain.handle(descriptor.ipcChannel, async (_event, payload) => {
      const normalizedPayload =
        payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
      if (descriptor.workerCommand !== DESKTOP_WORKER_INVOCATIONS.desktopPing.workerCommand) {
        desktopFileAccess.assertWorkerPayloadAccess(normalizedPayload);
      }
      return await supervisor.request(descriptor.workerCommand, normalizedPayload);
    });
  }

  ipcMain.handle("desktop:get-runtime-info", async () => {
    const worker = await supervisor.request<{
      status?: string;
      protocol_version?: number;
      app_version?: string | null;
    }>(DESKTOP_WORKER_INVOCATIONS.desktopPing.workerCommand, {});

    if (worker.status !== "pong") {
      throw new Error("Desktop worker ping returned an invalid status.");
    }
    if (worker.protocol_version !== DESKTOP_WORKER_PROTOCOL_VERSION) {
      throw new Error(
        `Desktop worker protocol mismatch. Required ${DESKTOP_WORKER_PROTOCOL_VERSION}, received ${worker.protocol_version}.`,
      );
    }

    return {
      status: "pong" as const,
      contract_version: DESKTOP_BRIDGE_CONTRACT_VERSION,
      bridge_version: app.getVersion(),
      task_owner_mode: DESKTOP_TASK_OWNER_MODE,
      capabilities: [...DESKTOP_BRIDGE_CAPABILITIES],
      worker: {
        protocol_version: worker.protocol_version,
        app_version: worker.app_version ?? null,
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
