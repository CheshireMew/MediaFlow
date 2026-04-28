import type { TranslateResponse } from "../../types/api";
import type { ElectronFile } from "../../types/electron";
import type { TranscribeResult } from "../../types/transcriber";
import { normalizeMediaReference, type MediaReference } from "../ui/mediaReference";

type MediaSeed = {
  path: string;
  name?: string;
  size?: number;
  type?: string;
  media_id?: MediaReference["media_id"];
  media_kind?: MediaReference["media_kind"];
  role?: MediaReference["role"];
  origin?: MediaReference["origin"];
};

function createFallbackRef(
  preferredRef?: MediaReference | null,
  secondaryRef?: MediaReference | null,
  fallbackPath?: string | null,
  fallbackSeed?: MediaSeed | ElectronFile | MediaReference | null,
): MediaReference | null {
  const seedRef = normalizeMediaReference(fallbackSeed);

  return (
    preferredRef ??
    secondaryRef ??
    seedRef ??
    normalizeMediaReference(fallbackPath)
  );
}

export function normalizeDirectTranscribeResult(
  result: TranscribeResult | null,
  sourceFile?: MediaSeed | ElectronFile | null,
): TranscribeResult | null {
  if (!result) {
    return null;
  }

  return {
    ...result,
    video_ref: createFallbackRef(result.video_ref, null, null, sourceFile),
    subtitle_ref: createFallbackRef(result.subtitle_ref, result.output_ref ?? null, null),
  };
}

export function normalizeDirectTranslateResult(
  result: TranslateResponse | null,
  contextRef?: MediaReference | null,
): TranslateResponse | null {
  if (!result) {
    return null;
  }

  return {
    ...result,
    context_ref: createFallbackRef(result.context_ref ?? null, contextRef ?? null, null),
    subtitle_ref: createFallbackRef(
      result.subtitle_ref ?? null,
      result.output_ref ?? null,
      null,
    ),
  };
}
