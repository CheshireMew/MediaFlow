import { requireDesktopApiMethod } from "./bridge";

export const desktopTaskService = {
  async listTasks() {
    return await requireDesktopApiMethod(
      "listDesktopTasks",
      "Desktop task listing is unavailable.",
    )();
  },

  async pauseTask(taskId: string) {
    return await requireDesktopApiMethod(
      "pauseDesktopTask",
      "Desktop task pause is unavailable.",
    )(taskId);
  },

  async resumeTask(taskId: string) {
    return await requireDesktopApiMethod(
      "resumeDesktopTask",
      "Desktop task resume is unavailable.",
    )(taskId);
  },

  async cancelTask(taskId: string) {
    return await requireDesktopApiMethod(
      "cancelDesktopTask",
      "Desktop task cancel is unavailable.",
    )(taskId);
  },
};
