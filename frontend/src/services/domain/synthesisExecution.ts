import { hexToAss } from "../../components/dialogs/synthesis/types";
import { computeSynthesisFontSize } from "../../components/dialogs/synthesis/textShaper";
import type { SynthesizeOptions } from "../../types/api";
import { editorService } from "./editorService";
import type { SynthesisExecutionPreferences } from "../persistence/synthesisExecutionPreferences";

type SynthesisExecutionOverrides = {
  targetResolution?: string;
  trimStart?: number;
  trimEnd?: number;
  crop?:
    | {
        x: number;
        y: number;
        w: number;
        h: number;
      }
    | null;
  videoSize?:
    | {
        w: number;
        h: number;
      }
    | null;
};

function resolveQualityOptions(
  quality: SynthesisExecutionPreferences["quality"],
): Pick<SynthesizeOptions, "crf" | "preset"> {
  if (quality === "high") {
    return { crf: 17, preset: "slow" };
  }

  if (quality === "small") {
    return { crf: 26, preset: "fast" };
  }

  return { crf: 20, preset: "medium" };
}

export function buildSynthesisOptionsFromPreferences(
  preferences: SynthesisExecutionPreferences,
  overrides?: SynthesisExecutionOverrides,
): SynthesizeOptions {
  const subtitleStyle = preferences.subtitleStyle;
  const bgAlphaHex = Math.round((1 - subtitleStyle.bgOpacity) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  const assBackgroundColor = hexToAss(subtitleStyle.bgColor, bgAlphaHex);

  const options: SynthesizeOptions = {
    ...resolveQualityOptions(preferences.quality),
    use_gpu: preferences.useGpu,
    target_resolution: overrides?.targetResolution ?? "original",
  };

  if ((overrides?.trimStart ?? 0) > 0) {
    options.trim_start = overrides?.trimStart;
  }

  if ((overrides?.trimEnd ?? 0) > 0) {
    options.trim_end = overrides?.trimEnd;
  }

  if (preferences.subtitleEnabled) {
    Object.assign(options, {
      font_name: subtitleStyle.fontName,
      font_size: computeSynthesisFontSize(subtitleStyle.fontSize),
      font_color: hexToAss(subtitleStyle.fontColor),
      bold: subtitleStyle.isBold,
      italic: subtitleStyle.isItalic,
      outline: subtitleStyle.bgEnabled
        ? subtitleStyle.bgPadding
        : subtitleStyle.outlineSize,
      shadow: subtitleStyle.shadowSize,
      outline_color: subtitleStyle.bgEnabled
        ? assBackgroundColor
        : hexToAss(subtitleStyle.outlineColor),
      back_color: subtitleStyle.bgEnabled
        ? assBackgroundColor
        : hexToAss(subtitleStyle.bgColor, bgAlphaHex),
      border_style: subtitleStyle.bgEnabled ? 3 : 1,
      alignment: subtitleStyle.alignment,
      multiline_align: subtitleStyle.multilineAlign,
      subtitle_position_y: subtitleStyle.subPos.y,
    });
  } else {
    options.skip_subtitles = true;
  }

  if (preferences.watermarkEnabled) {
    Object.assign(options, {
      wm_relative_width: preferences.watermark.wmScale,
      wm_opacity: preferences.watermark.wmOpacity,
      wm_pos_x: preferences.watermark.wmPos.x,
      wm_pos_y: preferences.watermark.wmPos.y,
    });
  }

  if (
    overrides?.crop &&
    overrides.videoSize &&
    overrides.videoSize.w > 0 &&
    overrides.videoSize.h > 0
  ) {
    Object.assign(options, {
      crop_x: Math.round(overrides.crop.x * overrides.videoSize.w),
      crop_y: Math.round(overrides.crop.y * overrides.videoSize.h),
      crop_w: Math.round(overrides.crop.w * overrides.videoSize.w),
      crop_h: Math.round(overrides.crop.h * overrides.videoSize.h),
    });
  }

  return options;
}

export async function resolveSynthesisWatermarkPath(
  preferences: SynthesisExecutionPreferences,
) {
  if (!preferences.watermarkEnabled) {
    return null;
  }

  try {
    const latestWatermark = await editorService.getLatestWatermark();
    return latestWatermark?.png_path ?? null;
  } catch {
    return null;
  }
}
