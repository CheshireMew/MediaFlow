import { apiClient } from "../../api/client";
import type { TranslateRequest, TranslateResponse, TranslationTaskStatus } from "../../types/api";

export const translationService = {
  async startTranslation(req: TranslateRequest): Promise<TranslateResponse> {
    return await apiClient.startTranslation(req);
  },

  async getTaskStatus(taskId: string): Promise<TranslationTaskStatus> {
    return await apiClient.getTaskStatus(taskId);
  },
};
