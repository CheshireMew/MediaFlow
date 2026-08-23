import { requireExecutionMediaReference } from "./executionPayload";
import type { MediaReference } from "../ui/mediaReference";
import type {
  EditorPreviewMediaResponse,
  EditorWaveformPeaksResponse,
  HighlightDetectionRequest,
  HighlightDetectionResponse,
  ImagePreviewResponse,
  MediaExportTimelineResponse,
  TranscribeSegmentResponse,
  TranslationRequest,
  ImmediateTranslationResponse,
} from "../../types/api";
import { executeBackendDirectCall } from "./executionExecutor";
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

  async translateSegments(payload: TranslationRequest): Promise<ImmediateTranslationResponse> {
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

  async getMediaExportTimeline(payload: {
    video_ref: MediaReference;
    speech_segments: import("../../types/task").SubtitleSegment[];
  }): Promise<MediaExportTimelineResponse> {
    return await executeBackendDirectCall({
      payload,
      normalizePayload: (nextPayload) => ({
        ...nextPayload,
        video_ref: requireExecutionMediaReference(nextPayload.video_ref, "Video"),
      }),
      backendCall: (normalizedPayload) => apiClient.getMediaExportTimeline(normalizedPayload),
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

  async getWaveformPeaks(payload: {
    video_ref: MediaReference;
  }): Promise<EditorWaveformPeaksResponse> {
    return await executeBackendDirectCall({
      payload,
      normalizePayload: (nextPayload) => ({
        ...nextPayload,
        video_ref: requireExecutionMediaReference(nextPayload.video_ref, "Video"),
      }),
      backendCall: (normalizedPayload) =>
        apiClient.getEditorWaveformPeaks(normalizedPayload),
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
};
