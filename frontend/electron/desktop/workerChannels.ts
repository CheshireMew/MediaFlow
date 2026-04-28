import { BrowserWindow } from "electron";

import {
  DESKTOP_TASK_EVENT_CHANNEL,
  DESKTOP_WORKER_EVENT_CHANNELS,
} from "./bridgeContract";

export class DesktopWorkerChannels {
  emitTask(message: unknown) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(DESKTOP_TASK_EVENT_CHANNEL, message);
    }
  }

  emitWorkerEvent(event: string, payload: unknown) {
    const channel =
      DESKTOP_WORKER_EVENT_CHANNELS[event as keyof typeof DESKTOP_WORKER_EVENT_CHANNELS];
    if (channel) {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(channel, payload);
      }
      return true;
    }
    return false;
  }
}
