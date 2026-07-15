import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  editorService,
  isAiTranslationSetupRequiredError,
} from "../../services/domain";
import { restoreStoredAsrExecutionPreferences } from "../../services/persistence/asrExecutionPreferences";
import { restoreStoredTranslationPreferences } from "../../services/persistence/translationPreferences";
import type { MediaReference } from "../../services/ui/mediaReference";
import type { TranscribeSegmentResponse } from "../../types/api";
import type { SubtitleSegment } from "../../types/task";
import { toast } from "../../utils/toast";

type SegmentTranscriptionPayload = {
  segments?: Array<Pick<SubtitleSegment, "start" | "end" | "text">>;
  text?: string;
};

export function useSegmentProcessingActions({
  video,
  addSegments,
}: {
  video: MediaReference | null;
  addSegments: (segments: SubtitleSegment[]) => void;
}) {
  const { t } = useTranslation("editor");
  const videoReferenceRef = useRef(video);
  videoReferenceRef.current = video;

  const buildSegmentsFromTranscription = useCallback(
    (
      payload: SegmentTranscriptionPayload,
      fallbackRegion: { start: number; end: number },
    ): SubtitleSegment[] => {
      if (payload.segments && payload.segments.length > 0) {
        return payload.segments.map((segment, index) => ({
          id: String(Date.now() + index),
          start: segment.start,
          end: segment.end,
          text: String(segment.text || "").trim(),
        }));
      }
      return [{
        id: String(Date.now()),
        start: fallbackRegion.start,
        end: fallbackRegion.end,
        text: (payload.text || "").trim() || t("contextMenu.noSpeechFallback"),
      }];
    },
    [t],
  );

  const translateSegments = useCallback(async (segments: SubtitleSegment[]) => {
    const { targetLanguage, mode } = restoreStoredTranslationPreferences();
    try {
      const response = await editorService.translateSegments({
        segments,
        target_language: targetLanguage,
        mode,
      });
      return {
        segments: response.segments as SubtitleSegment[],
        targetLanguage,
      };
    } catch (error) {
      console.error(error);
      if (isAiTranslationSetupRequiredError(error)) {
        return { segments: null, targetLanguage, aborted: true };
      }
      throw error;
    }
  }, []);

  const transcribeRegion = useCallback(
    async (region: { start: number; end: number }, translateAfterTranscribe: boolean) => {
      const currentMediaRef = videoReferenceRef.current;
      if (!currentMediaRef) {
        toast.warning(t("contextMenu.mediaRequired"));
        return;
      }

      toast.info(
        translateAfterTranscribe
          ? t("contextMenu.transcribeTranslateStarting")
          : t("contextMenu.transcribeStarting"),
        2000,
      );
      try {
        const preferences = restoreStoredAsrExecutionPreferences();
        const response = (await editorService.transcribeSegment({
          audio_ref: currentMediaRef,
          start: region.start,
          end: region.end,
          engine: preferences.engine,
          model: preferences.model,
          device: preferences.device,
        })) as TranscribeSegmentResponse;
        if (response.status !== "completed" || !response.data) {
          throw new Error(t("contextMenu.noSyncTranscription"));
        }

        const recognized = buildSegmentsFromTranscription(response.data, region);
        if (!translateAfterTranscribe) {
          addSegments(recognized);
          toast.success(
            recognized.length > 1
              ? t("contextMenu.transcribeMultipleSuccess", { count: recognized.length })
              : t("contextMenu.transcribeSuccess"),
          );
          return;
        }

        const translated = await translateSegments(recognized);
        if (translated.segments) {
          addSegments(translated.segments);
          toast.success(t("contextMenu.transcribeTranslateComplete", {
            language: translated.targetLanguage,
          }));
        } else if (!translated.aborted) {
          addSegments(recognized);
          toast.success(t("contextMenu.translateQueued"));
        }
      } catch (error) {
        console.error(error);
        toast.error(t("contextMenu.transcribeFailed", {
          detail: error instanceof Error ? error.message : String(error),
        }));
      }
    },
    [addSegments, buildSegmentsFromTranscription, t, translateSegments],
  );

  return { transcribeRegion, translateSegments };
}
