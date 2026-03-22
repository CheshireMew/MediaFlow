import type { TranslateResponse } from "../../types/api";
import type { ElectronFile } from "../../types/electron";
import type { TranscribeResult } from "../../types/transcriber";
import { createMediaReference, type MediaReference } from "../ui/mediaReference";

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

function normalizeMediaSeed(seed?: MediaSeed | ElectronFile | MediaReference | null): MediaSeed | null {
  if (!seed || typeof seed !== "object" || typeof seed.path !== "string" || !seed.path.trim()) {
    return null;
  }

  return {
    path: seed.path,
    name: "name" in seed ? seed.name : undefined,
    size: "size" in seed ? seed.size : undefined,
    type: "type" in seed ? seed.type : undefined,
    media_id: "media_id" in seed ? seed.media_id : undefined,
    media_kind: "media_kind" in seed ? seed.media_kind : undefined,
    role: "role" in seed ? seed.role : undefined,
    origin: "origin" in seed ? seed.origin : undefined,
  };
}

function createFallbackRef(
  preferredRef?: MediaReference | null,
  secondaryRef?: MediaReference | null,
  fallbackPath?: string | null,
  fallbackSeed?: MediaSeed | ElectronFile | MediaReference | null,
): MediaReference | null {
  const seed = normalizeMediaSeed(fallbackSeed);

  return (
    preferredRef ??
    secondaryRef ??
    (seed
      ? createMediaReference({
          path: seed.path,
          name: seed.name,
          size: seed.size,
          type: seed.type,
          media_id: seed.media_id,
          media_kind: seed.media_kind,
          role: seed.role,
          origin: seed.origin,
        })
      : null) ??
    (fallbackPath ? createMediaReference({ path: fallbackPath }) : null)
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
