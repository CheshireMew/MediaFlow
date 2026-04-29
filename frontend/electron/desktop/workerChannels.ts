import { BrowserWindow } from "electron";

import {
  DESKTOP_TASK_EVENT_CHANNEL,
} from "./bridgeContract";

export class DesktopWorkerChannels {
  emitTask(message: unknown) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(DESKTOP_TASK_EVENT_CHANNEL, message);
    }
  }
}
