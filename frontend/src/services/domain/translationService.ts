import type { TranslationRequest, TranslateResponse } from "../../types/api";
import type { Task } from "../../types/task";
import { apiClient } from "../../api/client";

export const translationService = {
  async startTranslation(req: TranslationRequest): Promise<TranslateResponse> {
    return await apiClient.startTranslation(req);
  },

  async getTaskStatus(taskId: string): Promise<Task> {
    return await apiClient.getTaskStatus(taskId);
  },
};
