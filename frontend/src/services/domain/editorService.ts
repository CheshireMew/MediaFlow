import { fileService } from "../fileService";
import type { MediaReference } from "../ui/mediaReference";
import { resolveMediaInputPath } from "./mediaInput";
import { prepareExecutionPayload } from "./executionPayload";
import type {
  DetectSilenceResponse,
  ImagePreviewResponse,
  TranscribeSegmentResponse,
  TranslateRequest,
  TranslateResponse,
} from "../../types/api";
import { isDesktopRuntime } from "../desktop/bridge";
import { executeBackendDirectCall } from "./executionExecutor";

export const editorService = {
  async detectSilence(payload: {
    file_path: string;
    threshold: string;
    min_duration: number;
  }): Promise<DetectSilenceResponse> {
    return await executeBackendDirectCall({
      payload,
      desktopMethod: "detectDesktopSilence",
      desktopUnavailableMessage: "Desktop silence detection is unavailable.",
      backendCall: (nextPayload) =>
        import("../../api/client").then(({ apiClient }) => apiClient.detectSilence(nextPayload)),
    });
  },

  async getPeaks(payload: {
    video_path?: string | null;
    video_ref?: MediaReference | null;
  }): Promise<ArrayBuffer> {
    const videoPath = resolveMediaInputPath(
      {
        path: payload.video_path,
        ref: payload.video_ref,
      },
      "Waveform video",
    );

    const buffer = await executeBackendDirectCall({
      payload: videoPath,
      desktopMethod: "getDesktopPeaks",
      desktopUnavailableMessage: "Desktop peaks loading is unavailable.",
      backendCall: (resolvedVideoPath) =>
        import("../../api/client").then(({ apiClient }) => apiClient.getPeaks(resolvedVideoPath)),
    });
    if (!buffer) {
      throw new Error("Failed to load peaks");
    }
    return buffer;
  },

  async transcribeSegment(payload: {
    audio_path?: string | null;
    audio_ref?: MediaReference | null;
    start: number;
    end: number;
    model?: string;
    device?: string;
    language?: string;
    initial_prompt?: string;
  }): Promise<TranscribeSegmentResponse> {
    return await executeBackendDirectCall({
      payload,
      normalizePayload: (nextPayload) =>
        prepareExecutionPayload({
          payload: nextPayload,
          specs: [
            {
              pathKey: "audio_path",
              refKey: "audio_ref",
              label: "Audio",
              required: true,
            },
          ],
        }),
      desktopMethod: "desktopTranscribeSegment",
      desktopUnavailableMessage: "Desktop segment transcription is unavailable.",
      backendCall: (normalizedPayload) =>
        import("../../api/client").then(({ apiClient }) =>
          apiClient.transcribeSegment({
            ...normalizedPayload,
            video_path: "",
            srt_path: "",
            watermark_path: null,
            options: {},
          }),
        ),
    });
  },

  async translateSegments(payload: TranslateRequest): Promise<TranslateResponse> {
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
      mapDesktopArgs: () => [],
      backendCall: () =>
        import("../../api/client").then(({ apiClient }) => apiClient.getLatestWatermark()),
    });
  },
};
