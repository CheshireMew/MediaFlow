import { requireExecutionMediaReference } from "./executionPayload";
import type { MediaReference } from "../ui/mediaReference";
import type {
  ImagePreviewResponse,
  MediaVisibleStartResponse,
  TranscribeSegmentResponse,
  TranslateRequest,
  TranslateResponse,
} from "../../types/api";
import { executeBackendDirectCall } from "./executionExecutor";
import {
  ensureAiTranslationConfigured,
  ensureCliTranscriptionConfigured,
} from "./executionAccess";

export const editorService = {
  async transcribeSegment(payload: {
    audio_ref: MediaReference;
    start: number;
    end: number;
    engine?: "builtin" | "cli";
    model?: string;
    device?: string;
    language?: string;
    initial_prompt?: string;
  }): Promise<TranscribeSegmentResponse> {
    await ensureCliTranscriptionConfigured(payload.engine);

    return await executeBackendDirectCall({
      payload,
      normalizePayload: (nextPayload) => ({
        ...nextPayload,
        audio_ref: requireExecutionMediaReference(nextPayload.audio_ref, "Audio"),
      }),
      backendCall: (normalizedPayload) =>
        import("../../api/client").then(({ apiClient }) =>
          apiClient.transcribeSegment(normalizedPayload),
        ),
    });
  },

  async translateSegments(payload: TranslateRequest): Promise<TranslateResponse> {
    await ensureAiTranslationConfigured();

    return await executeBackendDirectCall({
      payload,
      backendCall: (nextPayload) =>
        import("../../api/client").then(({ apiClient }) => apiClient.translateSegments(nextPayload)),
    });
  },

  async uploadWatermark(file: File): Promise<ImagePreviewResponse> {
    return await import("../../api/client").then(({ apiClient }) => apiClient.uploadWatermark(file));
  },

  async getLatestWatermark(): Promise<ImagePreviewResponse | null> {
    return await executeBackendDirectCall({
      payload: undefined,
      backendCall: () =>
        import("../../api/client").then(({ apiClient }) => apiClient.getLatestWatermark()),
    });
  },

  async getMediaVisibleStart(payload: {
    video_ref: MediaReference;
  }): Promise<MediaVisibleStartResponse> {
    return await executeBackendDirectCall({
      payload,
      normalizePayload: (nextPayload) => ({
        ...nextPayload,
        video_ref: requireExecutionMediaReference(nextPayload.video_ref, "Video"),
      }),
      backendCall: (normalizedPayload) =>
        import("../../api/client").then(({ apiClient }) =>
          apiClient.getMediaVisibleStart(normalizedPayload),
        ),
    });
  },
};
