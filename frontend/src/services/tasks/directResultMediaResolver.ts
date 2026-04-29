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

function chooseResultMediaRef(
  preferredRef?: MediaReference | null,
  secondaryRef?: MediaReference | null,
  seed?: MediaSeed | ElectronFile | MediaReference | null,
): MediaReference | null {
  const seedRef = normalizeMediaReference(seed);

  return (
    preferredRef ??
    secondaryRef ??
    seedRef
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
    video_ref: chooseResultMediaRef(result.video_ref, null, sourceFile),
    subtitle_ref: chooseResultMediaRef(result.subtitle_ref, result.output_ref ?? null),
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
    context_ref: chooseResultMediaRef(result.context_ref ?? null, contextRef ?? null),
    subtitle_ref: chooseResultMediaRef(
      result.subtitle_ref ?? null,
      result.output_ref ?? null,
    ),
  };
}
