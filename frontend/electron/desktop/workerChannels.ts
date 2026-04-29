import { BrowserWindow } from "electron";

import {
  DESKTOP_TASK_EVENT_CHANNEL,
  DESKTOP_WORKER_PROGRESS_CHANNEL,
} from "./bridgeContract";

export class DesktopWorkerChannels {
  emitTask(message: unknown) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(DESKTOP_TASK_EVENT_CHANNEL, message);
    }
  }

  emitWorkerEvent(event: string, payload: unknown, requestId: string | null) {
    if (!payload || typeof payload !== "object" || !("progress" in payload)) {
      return false;
    }

    const progressPayload = {
      ...(payload as Record<string, unknown>),
      event,
      task_id: requestId,
    };
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(DESKTOP_WORKER_PROGRESS_CHANNEL, progressPayload);
    }
    return true;
  }
}
