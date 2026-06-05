import type { TranslateRequest, TranslateResponse } from "../../types/api";
import type { Task } from "../../types/task";

export const translationService = {
  async startTranslation(req: TranslateRequest): Promise<TranslateResponse> {
    return await import("../../api/client").then(({ apiClient }) => apiClient.startTranslation(req));
  },

  async getTaskStatus(taskId: string): Promise<Task> {
    return await import("../../api/client").then(({ apiClient }) => apiClient.getTaskStatus(taskId));
  },
};
