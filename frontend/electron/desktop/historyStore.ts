import { app } from "electron";
import fs from "fs";
import path from "path";

import type { Task } from "../../src/types/task";
import {
  normalizePersistedDesktopTaskHistory,
  parsePersistedDesktopTaskHistory,
  serializePersistedDesktopTaskHistory,
} from "../desktopTaskPersistence";


export class DesktopTaskHistoryStore {
  private loaded = false;
  private tasks: Task[] = [];

  private getHistoryPath() {
    return path.join(app.getPath("userData"), "desktop-task-history.json");
  }

  ensureLoaded() {
    if (this.loaded) {
      return;
    }

    this.loaded = true;
    try {
      const historyPath = this.getHistoryPath();
      if (!fs.existsSync(historyPath)) {
        this.tasks = [];
        return;
      }

      this.tasks = parsePersistedDesktopTaskHistory(fs.readFileSync(historyPath, "utf-8"));
    } catch (error) {
      console.error("[DesktopWorker] Failed to load persisted task history", error);
      this.tasks = [];
    }
  }

  list() {
    this.ensureLoaded();
    return [...this.tasks];
  }

  upsert(task: Task) {
    this.ensureLoaded();
    this.tasks = normalizePersistedDesktopTaskHistory([
      task,
      ...this.tasks.filter((existingTask) => existingTask.id !== task.id),
    ]);
    this.save();
  }

  remove(taskId: string) {
    this.ensureLoaded();
    const nextHistory = this.tasks.filter((task) => task.id !== taskId);
    if (nextHistory.length === this.tasks.length) {
      return false;
    }

    this.tasks = nextHistory;
    this.save();
    return true;
  }

  private save() {
    try {
      const historyPath = this.getHistoryPath();
      fs.mkdirSync(path.dirname(historyPath), { recursive: true });
      fs.writeFileSync(historyPath, serializePersistedDesktopTaskHistory(this.tasks), "utf-8");
    } catch (error) {
      console.error("[DesktopWorker] Failed to save task history", error);
    }
  }
}
