import { apiClient } from "../../api/client";
import { fileService } from "../fileService";
import type { MediaReference } from "../ui/mediaReference";
import { resolveMediaInputPath } from "./mediaInput";
import { normalizeExecutionPayload } from "./executionPayload";
import type {
  DetectSilenceResponse,
  ImagePreviewResponse,
  TranscribeSegmentResponse,
  TranslateRequest,
  TranslateResponse,
} from "../../types/api";
import { isDesktopRuntime, requireDesktopApiMethod } from "../desktop/bridge";

export const editorService = {
  async detectSilence(payload: {
    file_path: string;
    threshold: string;
    min_duration: number;
  }): Promise<DetectSilenceResponse> {
    if (isDesktopRuntime()) {
      return await requireDesktopApiMethod(
        "detectDesktopSilence",
        "Desktop silence detection is unavailable.",
      )(payload);
    }

    return apiClient.detectSilence(payload);
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

    if (isDesktopRuntime()) {
      const buffer = await requireDesktopApiMethod(
        "getDesktopPeaks",
        "Desktop peaks loading is unavailable.",
      )(videoPath);
      if (!buffer) {
        throw new Error("Failed to load peaks");
      }
      return buffer;
    }

    return await apiClient.getPeaks(videoPath);
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
    const normalizedPayload = normalizeExecutionPayload(payload, [
      {
        pathKey: "audio_path",
        refKey: "audio_ref",
        label: "Audio",
        required: true,
      },
    ]);

    if (isDesktopRuntime()) {
      return await requireDesktopApiMethod(
        "desktopTranscribeSegment",
        "Desktop segment transcription is unavailable.",
      )(normalizedPayload);
    }

    return await apiClient.transcribeSegment({
      ...normalizedPayload,
      video_path: "",
      srt_path: "",
      watermark_path: null,
      options: {},
    });
  },

  async translateSegments(payload: TranslateRequest): Promise<TranslateResponse> {
    if (isDesktopRuntime()) {
      return await requireDesktopApiMethod(
        "desktopTranslateSegment",
        "Desktop segment translation is unavailable.",
      )(payload);
    }

    return await apiClient.translateSegments(payload);
  },

  async uploadWatermark(file: File): Promise<ImagePreviewResponse> {
    if (isDesktopRuntime()) {
      const filePath = fileService.getPathForFile(file);
      return await requireDesktopApiMethod(
        "uploadDesktopWatermark",
        "Desktop watermark upload is unavailable.",
      )(filePath);
    }

    return await apiClient.uploadWatermark(file);
  },

  async getLatestWatermark(): Promise<ImagePreviewResponse | null> {
    if (isDesktopRuntime()) {
      return await requireDesktopApiMethod(
        "getDesktopLatestWatermark",
        "Desktop watermark loading is unavailable.",
      )();
    }

    return await apiClient.getLatestWatermark();
  },
};
