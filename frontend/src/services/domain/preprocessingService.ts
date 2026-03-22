import { apiClient } from "../../api/client";
import type { OCRExtractRequest, OCRTextEvent } from "../../types/api";
import { isDesktopRuntime, requireDesktopApiMethod } from "../desktop/bridge";
import { createDesktopTaskSubmissionReceipt } from "./taskSubmission";
import type { MediaReference } from "../ui/mediaReference";
import { resolveMediaInputPath } from "./mediaInput";
import { normalizeExecutionPayload } from "./executionPayload";

export const preprocessingService = {
  async extractText(
    payload: Omit<OCRExtractRequest, "video_path"> & {
      video_path?: string | null;
      video_ref?: MediaReference | null;
    },
  ) {
    const normalizedPayload = normalizeExecutionPayload(payload, [
      {
        pathKey: "video_path",
        refKey: "video_ref",
        label: "Preprocessing video",
        required: true,
      },
    ]);

    if (isDesktopRuntime()) {
      const taskId =
        typeof normalizedPayload.task_id === "string" && normalizedPayload.task_id.length > 0
          ? normalizedPayload.task_id
          : `desktop-extract-${Date.now()}`;
      void requireDesktopApiMethod(
        "desktopExtract",
        "Desktop preprocessing worker is unavailable.",
      )({
        ...normalizedPayload,
        task_id: taskId,
      }).catch((error) => {
        console.error("Desktop OCR failed", error);
      });
      return createDesktopTaskSubmissionReceipt(taskId, "OCR task started");
    }
    return apiClient.extractText(normalizedPayload);
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

    if (isDesktopRuntime()) {
      return await requireDesktopApiMethod(
        "getDesktopOcrResults",
        "Desktop preprocessing worker is unavailable.",
      )(videoPath);
    }
    return apiClient.getOcrResults(videoPath);
  },

  async enhanceVideo(payload: {
    video_path?: string | null;
    video_ref?: MediaReference | null;
    model?: string;
    scale?: string;
    method?: string;
    task_id?: string;
  }) {
    const normalizedPayload = normalizeExecutionPayload(payload, [
      {
        pathKey: "video_path",
        refKey: "video_ref",
        label: "Preprocessing video",
        required: true,
      },
    ]);

    if (isDesktopRuntime()) {
      const taskId =
        typeof normalizedPayload.task_id === "string" && normalizedPayload.task_id.length > 0
          ? normalizedPayload.task_id
          : `desktop-enhance-${Date.now()}`;
      void requireDesktopApiMethod(
        "desktopEnhance",
        "Desktop preprocessing worker is unavailable.",
      )({
        ...normalizedPayload,
        task_id: taskId,
      }).catch((error) => {
        console.error("Desktop enhancement failed", error);
      });
      return createDesktopTaskSubmissionReceipt(taskId, "Enhancement started");
    }
    return apiClient.enhanceVideo(normalizedPayload);
  },

  async cleanVideo(payload: {
    video_path?: string | null;
    video_ref?: MediaReference | null;
    roi: [number, number, number, number];
    method?: string;
    task_id?: string;
  }) {
    const normalizedPayload = normalizeExecutionPayload(payload, [
      {
        pathKey: "video_path",
        refKey: "video_ref",
        label: "Preprocessing video",
        required: true,
      },
    ]);

    if (isDesktopRuntime()) {
      const taskId =
        typeof normalizedPayload.task_id === "string" && normalizedPayload.task_id.length > 0
          ? normalizedPayload.task_id
          : `desktop-clean-${Date.now()}`;
      void requireDesktopApiMethod(
        "desktopClean",
        "Desktop preprocessing worker is unavailable.",
      )({
        ...normalizedPayload,
        task_id: taskId,
      }).catch((error) => {
        console.error("Desktop cleanup failed", error);
      });
      return createDesktopTaskSubmissionReceipt(taskId, "Cleanup started");
    }
    return apiClient.cleanVideo(normalizedPayload);
  },
};
