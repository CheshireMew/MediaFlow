import { apiClient } from "../api/client";
import type {
  OCRExtractRequest,
  OCRExtractResponse,
  TaskResponse,
  TextEvent,
} from "../api/client";

export type { TextEvent, OCRExtractRequest, OCRExtractResponse };

export const ocrService = {
  extractText: async (params: OCRExtractRequest): Promise<TaskResponse> => {
    return apiClient.extractText(params);
  },
};
