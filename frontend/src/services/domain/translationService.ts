import type { TaskResponse, TranslationRequest } from "../../types/api";
import type { Task } from "../../types/task";
import { apiClient } from "../../api/client";

export const translationService = {
  async startTranslation(req: TranslationRequest): Promise<TaskResponse> {
    return await apiClient.startTranslation(req);
  },

  async getTaskStatus(taskId: string): Promise<Task> {
    return await apiClient.getTaskStatus(taskId);
  },
};
