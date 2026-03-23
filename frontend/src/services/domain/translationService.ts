import { callBackendFallback } from "./backendFallback";
import type { TranslateRequest, TranslateResponse, TranslationTaskStatus } from "../../types/api";

export const translationService = {
  async startTranslation(req: TranslateRequest): Promise<TranslateResponse> {
    return await callBackendFallback("translationService", "startTranslation", () =>
      import("../../api/client").then(({ apiClient }) => apiClient.startTranslation(req)),
    );
  },

  async getTaskStatus(taskId: string): Promise<TranslationTaskStatus> {
    return await callBackendFallback("translationService", "getTaskStatus", () =>
      import("../../api/client").then(({ apiClient }) => apiClient.getTaskStatus(taskId)),
    );
  },
};
