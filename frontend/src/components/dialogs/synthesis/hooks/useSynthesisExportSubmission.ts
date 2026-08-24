import { useCallback, useState } from "react";

import {
  buildSynthesisOptionsFromPreferences,
  resolveSynthesisWatermarkReference,
  type VideoExportScope,
  type VideoExportSubmission,
} from "../../../../services/domain";
import { mediaReferenceFromPath, type MediaReference } from "../../../../services/ui/mediaReference";
import type { SynthesisExecutionPreferences } from "../../../../services/persistence/synthesisExecutionPreferences";
import type { MediaExportTimelineResponse } from "../../../../types/api";
import type { CropState } from "./useCrop";
import type { OutputSettingsState } from "./useOutputSettings";
import type { SubtitleStyleState } from "./useSubtitleStyle";
import type { WatermarkState } from "./useWatermark";

type PreviewRange = { start: number; end: number } | null;

type ExportSubmissionOptions = {
  videoPath: string | null;
  videoSize: { w: number; h: number };
  exportScope: VideoExportScope;
  subtitleAvailable: boolean;
  subtitleEnabled: boolean;
  watermarkEnabled: boolean;
  persistedPreferences: SynthesisExecutionPreferences;
  style: SubtitleStyleState;
  watermark: WatermarkState;
  output: OutputSettingsState;
  crop: CropState;
  automaticTrimStart: number;
  fullVideoPreviewRange: PreviewRange;
  timeline: MediaExportTimelineResponse | null;
  onExport: (submission: VideoExportSubmission) => Promise<boolean>;
  onClose: () => void;
};

export function useSynthesisExportSubmission(options: ExportSubmissionOptions) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const handleExport = useCallback(async () => {
    if (!options.videoPath || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const effectiveSubtitleEnabled = options.subtitleAvailable && options.subtitleEnabled;
      const preferences: SynthesisExecutionPreferences = {
        ...options.persistedPreferences,
        subtitleEnabled: effectiveSubtitleEnabled,
        watermarkEnabled: options.watermarkEnabled,
        quality: options.output.quality,
        useGpu: options.output.useGpu,
        targetResolution: options.output.targetResolution,
        lastOutputDir: options.output.outputDir,
        subtitleStyle: {
          ...options.persistedPreferences.subtitleStyle,
          fontName: options.style.fontName,
          fontSize: options.style.fontSize,
          fontColor: options.style.fontColor,
          isBold: options.style.isBold,
          isItalic: options.style.isItalic,
          outlineSize: options.style.outlineSize,
          shadowSize: options.style.shadowSize,
          outlineColor: options.style.outlineColor,
          bgEnabled: options.style.bgEnabled,
          bgColor: options.style.bgColor,
          bgOpacity: options.style.bgOpacity,
          bgPadding: options.style.bgPadding,
          alignment: options.style.alignment,
          multilineAlign: options.style.multilineAlign,
          subPos: options.style.subPos,
          customPresets: options.style.customPresets,
        },
        watermark: {
          ...options.persistedPreferences.watermark,
          wmScale: options.watermark.wmScale,
          wmOpacity: options.watermark.wmOpacity,
          wmPos: options.watermark.wmPos,
          hasCustomLayout: true,
        },
      };
      const isClipExport = options.exportScope.kind === "clips";
      const synthesisOptions = buildSynthesisOptionsFromPreferences(preferences, {
        targetResolution: options.output.targetResolution,
        trimStart: isClipExport ? undefined : options.fullVideoPreviewRange?.start
          ?? Math.max(options.output.trimStart, options.automaticTrimStart),
        trimEnd: isClipExport ? undefined
          : options.output.trimEnd > 0 || options.timeline?.has_trailing_no_speech
            ? options.fullVideoPreviewRange?.end
            : undefined,
        crop: options.crop.isEnabled ? options.crop.crop : null,
        videoSize: options.videoSize,
      });
      let outputRef: MediaReference | null = null;
      if (!isClipExport && options.output.outputDir && options.output.outputFilename) {
        const separator = options.output.outputDir.includes("\\") ? "\\" : "/";
        const directory = options.output.outputDir.endsWith(separator)
          ? options.output.outputDir.slice(0, -1)
          : options.output.outputDir;
        outputRef = mediaReferenceFromPath(
          `${directory}${separator}${options.output.outputFilename}`,
          { type: "video/mp4", media_kind: "video", role: "output", origin: "task" },
        );
      }
      const watermarkRef = options.watermarkEnabled
        ? options.watermark.watermarkRef ?? await resolveSynthesisWatermarkReference(preferences)
        : null;
      const submitted = await options.onExport({
        options: synthesisOptions,
        outputRef,
        outputDir: options.output.outputDir,
        watermarkRef,
        subtitleEnabled: effectiveSubtitleEnabled,
        watermarkEnabled: options.watermarkEnabled,
      });
      if (submitted) options.onClose();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, options]);

  return { isSubmitting, handleExport };
}
