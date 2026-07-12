import { requireExecutionMediaReference } from "./executionPayload";
import type { MediaReference } from "../ui/mediaReference";
import type {
  ClipExportRequest,
  EditorPreviewMediaResponse,
  HighlightDetectionRequest,
  HighlightDetectionResponse,
  ImagePreviewResponse,
  MediaVisibleStartResponse,
  TranscribeSegmentResponse,
  TranslationRequest,
  TranslateResponse,
} from "../../types/api";
import { executeBackendDirectCall, executeTaskSubmission } from "./executionExecutor";
import type { ExecutionOutcome } from "./taskSubmission";
import {
  ensureAiTranslationConfigured,
  ensureCliTranscriptionConfigured,
} from "./executionAccess";
import { apiClient } from "../../api/client";

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
      backendCall: (normalizedPayload) => apiClient.transcribeSegment(normalizedPayload),
    });
  },

  async translateSegments(payload: TranslationRequest): Promise<TranslateResponse> {
    await ensureAiTranslationConfigured();

    return await executeBackendDirectCall({
      payload,
      backendCall: (nextPayload) => apiClient.translateSegments(nextPayload),
    });
  },

  async uploadWatermark(file: File): Promise<ImagePreviewResponse> {
    return await apiClient.uploadWatermark(file);
  },

  async getLatestWatermark(): Promise<ImagePreviewResponse | null> {
    return await executeBackendDirectCall({
      payload: undefined,
      backendCall: () => apiClient.getLatestWatermark(),
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
      backendCall: (normalizedPayload) => apiClient.getMediaVisibleStart(normalizedPayload),
    });
  },

  async resolvePreviewMediaSource(payload: {
    video_ref: MediaReference;
  }): Promise<EditorPreviewMediaResponse> {
    return await executeBackendDirectCall({
      payload,
      normalizePayload: (nextPayload) => ({
        ...nextPayload,
        video_ref: requireExecutionMediaReference(nextPayload.video_ref, "Video"),
      }),
      backendCall: (normalizedPayload) =>
        apiClient.resolveEditorPreviewMediaSource(normalizedPayload),
    });
  },

  async detectHighlightCandidates(
    payload: HighlightDetectionRequest,
  ): Promise<HighlightDetectionResponse> {
    await ensureAiTranslationConfigured();

    return await executeBackendDirectCall({
      payload,
      normalizePayload: (nextPayload) => ({
        ...nextPayload,
        video_ref: requireExecutionMediaReference(nextPayload.video_ref, "Video"),
      }),
      backendCall: (normalizedPayload) =>
        apiClient.detectHighlightCandidates(normalizedPayload),
    });
  },

  async exportClipSegments(
    payload: ClipExportRequest,
  ): Promise<ExecutionOutcome> {
    return await executeTaskSubmission({
      payload,
      normalizePayload: (nextPayload) => ({
        ...nextPayload,
        video_ref: requireExecutionMediaReference(nextPayload.video_ref, "Video"),
        srt_ref: nextPayload.srt_ref
          ? requireExecutionMediaReference(nextPayload.srt_ref, "Subtitle")
          : null,
        watermark_ref: nextPayload.watermark_ref
          ? requireExecutionMediaReference(nextPayload.watermark_ref, "Watermark")
          : null,
      }),
      backendSubmit: (normalizedPayload) => apiClient.exportClipSegments(normalizedPayload),
    });
  },
};
