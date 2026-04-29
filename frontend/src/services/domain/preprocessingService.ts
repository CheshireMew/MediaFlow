import type { OCRExtractRequest, OCRTextEvent } from "../../types/api";
import type { ExecutionOutcome } from "./taskSubmission";
import type { MediaReference } from "../ui/mediaReference";
import { requireExecutionMediaReference } from "./executionPayload";
import {
  executeBackendDirectCall,
  executeDesktopTaskSubmission,
} from "./executionExecutor";

export const preprocessingService = {
  async extractText(payload: OCRExtractRequest & { task_id?: string }): Promise<ExecutionOutcome> {
    return await executeDesktopTaskSubmission({
      payload,
      normalizePayload: (nextPayload) => ({
        ...nextPayload,
        video_ref: requireExecutionMediaReference(nextPayload.video_ref, "Preprocessing video"),
      }),
      desktopMethod: "desktopExtract",
      desktopUnavailableMessage: "Desktop preprocessing worker is unavailable.",
      desktopTaskIdPrefix: "desktop-extract",
      backendSubmit: (normalizedPayload) =>
        import("../../api/client").then(({ apiClient }) =>
          apiClient.extractText(normalizedPayload),
        ),
    });
  },

  async getOcrResults(payload: { video_ref: MediaReference }): Promise<{ events: OCRTextEvent[] }> {
    const videoRef = requireExecutionMediaReference(payload.video_ref, "Preprocessing video");

    return await executeBackendDirectCall({
      payload: videoRef,
      desktopMethod: "getDesktopOcrResults",
      desktopUnavailableMessage: "Desktop preprocessing worker is unavailable.",
      backendCall: (resolvedVideoRef) =>
        import("../../api/client").then(({ apiClient }) => apiClient.getOcrResults(resolvedVideoRef)),
    });
  },

  async enhanceVideo(payload: {
    video_ref: MediaReference;
    model?: string;
    scale?: string;
    method?: string;
    task_id?: string;
  }): Promise<ExecutionOutcome> {
    return await executeDesktopTaskSubmission({
      payload,
      normalizePayload: (nextPayload) => ({
        ...nextPayload,
        video_ref: requireExecutionMediaReference(nextPayload.video_ref, "Preprocessing video"),
      }),
      desktopMethod: "desktopEnhance",
      desktopUnavailableMessage: "Desktop preprocessing worker is unavailable.",
      desktopTaskIdPrefix: "desktop-enhance",
      backendSubmit: (normalizedPayload) =>
        import("../../api/client").then(({ apiClient }) =>
          apiClient.enhanceVideo(normalizedPayload),
        ),
    });
  },

  async cleanVideo(payload: {
    video_ref: MediaReference;
    roi: [number, number, number, number];
    method?: string;
    task_id?: string;
  }): Promise<ExecutionOutcome> {
    return await executeDesktopTaskSubmission({
      payload,
      normalizePayload: (nextPayload) => ({
        ...nextPayload,
        video_ref: requireExecutionMediaReference(nextPayload.video_ref, "Preprocessing video"),
      }),
      desktopMethod: "desktopClean",
      desktopUnavailableMessage: "Desktop preprocessing worker is unavailable.",
      desktopTaskIdPrefix: "desktop-clean",
      backendSubmit: (normalizedPayload) =>
        import("../../api/client").then(({ apiClient }) =>
          apiClient.cleanVideo(normalizedPayload),
        ),
    });
  },
};
