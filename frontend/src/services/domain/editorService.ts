import { fileService } from "../fileService";
import { requireExecutionMediaReference } from "./executionPayload";
import type { MediaReference } from "../ui/mediaReference";
import type {
  ImagePreviewResponse,
  TranscribeSegmentResponse,
  TranslateRequest,
  TranslateResponse,
} from "../../types/api";
import { isDesktopRuntime } from "../desktop";
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
      desktopMethod: "desktopTranscribeSegment",
      desktopUnavailableMessage: "Desktop segment transcription is unavailable.",
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
      desktopMethod: "desktopTranslateSegment",
      desktopUnavailableMessage: "Desktop segment translation is unavailable.",
      backendCall: (nextPayload) =>
        import("../../api/client").then(({ apiClient }) => apiClient.translateSegments(nextPayload)),
    });
  },

  async uploadWatermark(file: File): Promise<ImagePreviewResponse> {
    if (isDesktopRuntime()) {
      const filePath = fileService.getPathForFile(file);
      return await executeBackendDirectCall({
        payload: filePath,
        desktopMethod: "uploadDesktopWatermark",
        desktopUnavailableMessage: "Desktop watermark upload is unavailable.",
        mapDesktopArgs: (nextFilePath) => [{ file_path: nextFilePath }] as [{ file_path: string }],
        backendCall: async () =>
          await import("../../api/client").then(({ apiClient }) => apiClient.uploadWatermark(file)),
      });
    }

    return await import("../../api/client").then(({ apiClient }) => apiClient.uploadWatermark(file));
  },

  async getLatestWatermark(): Promise<ImagePreviewResponse | null> {
    return await executeBackendDirectCall({
      payload: undefined,
      desktopMethod: "getDesktopLatestWatermark",
      desktopUnavailableMessage: "Desktop watermark loading is unavailable.",
      mapDesktopArgs: () => [] as [],
      backendCall: () =>
        import("../../api/client").then(({ apiClient }) => apiClient.getLatestWatermark()),
    });
  },
};
