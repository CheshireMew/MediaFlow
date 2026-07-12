import type { CleanRequest, OCRExtractRequest, OCRResultsResponse } from "../../types/api";
import type { ExecutionOutcome } from "./taskSubmission";
import type { MediaReference } from "../ui/mediaReference";
import { requireExecutionMediaReference } from "./executionPayload";
import {
  executeBackendDirectCall,
  executeTaskSubmission,
} from "./executionExecutor";
import { apiClient } from "../../api/client";

export const preprocessingService = {
  async extractText(payload: OCRExtractRequest & { task_id?: string }): Promise<ExecutionOutcome> {
    return await executeTaskSubmission({
      payload,
      normalizePayload: (nextPayload) => ({
        ...nextPayload,
        video_ref: requireExecutionMediaReference(nextPayload.video_ref, "Preprocessing video"),
      }),
      backendSubmit: (normalizedPayload) => apiClient.extractText(normalizedPayload),
    });
  },

  async getOcrResults(payload: { video_ref: MediaReference }): Promise<OCRResultsResponse> {
    const videoRef = requireExecutionMediaReference(payload.video_ref, "Preprocessing video");

    return await executeBackendDirectCall({
      payload: videoRef,
      backendCall: (resolvedVideoRef) => apiClient.getOcrResults(resolvedVideoRef),
    });
  },

  async enhanceVideo(payload: {
    video_ref: MediaReference;
    model?: string;
    scale?: string;
    method?: string;
    task_id?: string;
  }): Promise<ExecutionOutcome> {
    return await executeTaskSubmission({
      payload,
      normalizePayload: (nextPayload) => ({
        ...nextPayload,
        video_ref: requireExecutionMediaReference(nextPayload.video_ref, "Preprocessing video"),
      }),
      backendSubmit: (normalizedPayload) => apiClient.enhanceVideo(normalizedPayload),
    });
  },

  async cleanVideo(payload: {
    video_ref: MediaReference;
    roi: [number, number, number, number];
    method?: NonNullable<CleanRequest["method"]>;
    task_id?: string;
  }): Promise<ExecutionOutcome> {
    return await executeTaskSubmission({
      payload,
      normalizePayload: (nextPayload) => ({
        ...nextPayload,
        video_ref: requireExecutionMediaReference(nextPayload.video_ref, "Preprocessing video"),
      }),
      backendSubmit: (normalizedPayload) => apiClient.cleanVideo(normalizedPayload),
    });
  },
};
