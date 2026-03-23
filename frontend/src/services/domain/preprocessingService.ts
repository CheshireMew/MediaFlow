import type { OCRExtractRequest, OCRTextEvent } from "../../types/api";
import type { ExecutionOutcome } from "./taskSubmission";
import type { MediaReference } from "../ui/mediaReference";
import { resolveMediaInputPath } from "./mediaInput";
import { prepareExecutionPayload } from "./executionPayload";
import {
  executeBackendDirectCall,
  executeDesktopTaskSubmission,
} from "./executionExecutor";

export const preprocessingService = {
  async extractText(
    payload: Omit<OCRExtractRequest, "video_path"> & {
      video_path?: string | null;
      video_ref?: MediaReference | null;
    },
  ): Promise<ExecutionOutcome<never>> {
    return await executeDesktopTaskSubmission({
      payload,
      normalizePayload: (nextPayload) =>
        prepareExecutionPayload({
          payload: nextPayload,
          specs: [
            {
              pathKey: "video_path",
              refKey: "video_ref",
              label: "Preprocessing video",
              required: true,
            },
          ],
        }),
      desktopMethod: "desktopExtract",
      desktopUnavailableMessage: "Desktop preprocessing worker is unavailable.",
      desktopTaskIdPrefix: "desktop-extract",
      desktopSubmissionMessage: "OCR task started",
      desktopFailureLogLabel: "Desktop OCR failed",
      backendSubmit: (normalizedPayload) =>
        import("../../api/client").then(({ apiClient }) =>
          apiClient.extractText(normalizedPayload),
        ),
    });
  },

  async getOcrResults(payload: {
    video_path?: string | null;
    video_ref?: MediaReference | null;
  }): Promise<{ events: OCRTextEvent[] }> {
    const videoPath = resolveMediaInputPath(
      {
        path: payload.video_path,
        ref: payload.video_ref,
      },
      "Preprocessing video",
    );

    return await executeBackendDirectCall({
      payload: videoPath,
      desktopMethod: "getDesktopOcrResults",
      desktopUnavailableMessage: "Desktop preprocessing worker is unavailable.",
      backendCall: (resolvedVideoPath) =>
        import("../../api/client").then(({ apiClient }) => apiClient.getOcrResults(resolvedVideoPath)),
    });
  },

  async enhanceVideo(payload: {
    video_path?: string | null;
    video_ref?: MediaReference | null;
    model?: string;
    scale?: string;
    method?: string;
    task_id?: string;
  }): Promise<ExecutionOutcome<never>> {
    return await executeDesktopTaskSubmission({
      payload,
      normalizePayload: (nextPayload) =>
        prepareExecutionPayload({
          payload: nextPayload,
          specs: [
            {
              pathKey: "video_path",
              refKey: "video_ref",
              label: "Preprocessing video",
              required: true,
            },
          ],
        }),
      desktopMethod: "desktopEnhance",
      desktopUnavailableMessage: "Desktop preprocessing worker is unavailable.",
      desktopTaskIdPrefix: "desktop-enhance",
      desktopSubmissionMessage: "Enhancement started",
      desktopFailureLogLabel: "Desktop enhancement failed",
      backendSubmit: (normalizedPayload) =>
        import("../../api/client").then(({ apiClient }) =>
          apiClient.enhanceVideo(normalizedPayload),
        ),
    });
  },

  async cleanVideo(payload: {
    video_path?: string | null;
    video_ref?: MediaReference | null;
    roi: [number, number, number, number];
    method?: string;
    task_id?: string;
  }): Promise<ExecutionOutcome<never>> {
    return await executeDesktopTaskSubmission({
      payload,
      normalizePayload: (nextPayload) =>
        prepareExecutionPayload({
          payload: nextPayload,
          specs: [
            {
              pathKey: "video_path",
              refKey: "video_ref",
              label: "Preprocessing video",
              required: true,
            },
          ],
        }),
      desktopMethod: "desktopClean",
      desktopUnavailableMessage: "Desktop preprocessing worker is unavailable.",
      desktopTaskIdPrefix: "desktop-clean",
      desktopSubmissionMessage: "Cleanup started",
      desktopFailureLogLabel: "Desktop cleanup failed",
      backendSubmit: (normalizedPayload) =>
        import("../../api/client").then(({ apiClient }) =>
          apiClient.cleanVideo(normalizedPayload),
        ),
    });
  },
};
