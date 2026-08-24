import type { ElectronFile } from "../../types/electron";
import type { MediaReference as GeneratedMediaReference } from "../../types/generatedApi";
import { getMediaExtensionsWithDot } from "../../contracts/openFileContract";

export type MediaReference = GeneratedMediaReference;

const VIDEO_EXTENSIONS = new Set(getMediaExtensionsWithDot("video"));
const AUDIO_EXTENSIONS = new Set(getMediaExtensionsWithDot("audio"));

type MediaReferenceDefaults = {
  name?: string | null;
  size?: number | null;
  type?: string | null;
  media_id?: string;
  media_kind?: string | null;
  role?: string | null;
  origin?: string | null;
};

function getBasenameFromPath(filePath: string, defaultName?: string) {
  const normalized = typeof filePath === "string" ? filePath.trim() : "";
  if (!normalized) {
    return defaultName ?? "";
  }

  const segments = normalized.split(/[\\/]/);
  const basename = segments[segments.length - 1];
  return basename || defaultName || normalized;
}

function isMediaReferenceCandidate(
  value: unknown,
): value is Partial<MediaReference> & { path: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "path" in value &&
      typeof (value as { path?: unknown }).path === "string",
  );
}

function createMediaReference(params: {
  path: string;
  name?: string | null;
  size?: number | null;
  type?: string | null;
  media_id?: string;
  media_kind?: string | null;
  role?: string | null;
  origin?: string | null;
}): MediaReference {
  const { path, name, size, type, media_id, media_kind, role, origin } = params;
  const reference: MediaReference = {
    path,
    name: name?.trim() || getBasenameFromPath(path, "media"),
  };
  if (size !== undefined) reference.size = size;
  if (type !== undefined) reference.type = type;
  if (media_id !== undefined) reference.media_id = media_id;
  if (media_kind !== undefined) reference.media_kind = media_kind;
  if (role !== undefined) reference.role = role;
  if (origin !== undefined) reference.origin = origin;
  return reference;
}

export function normalizeMediaReference(
  value: unknown,
  defaults: MediaReferenceDefaults = {},
): MediaReference | null {
  if (!isMediaReferenceCandidate(value)) {
    return null;
  }

  const path = value.path.trim();
  if (!path) {
    return null;
  }

  return createMediaReference({
    path,
    name: typeof value.name === "string" ? value.name : defaults.name,
    size: typeof value.size === "number" ? value.size : defaults.size,
    type: typeof value.type === "string" ? value.type : defaults.type,
    media_id: typeof value.media_id === "string" ? value.media_id : defaults.media_id,
    media_kind: typeof value.media_kind === "string" ? value.media_kind : defaults.media_kind,
    role: typeof value.role === "string" ? value.role : defaults.role,
    origin: typeof value.origin === "string" ? value.origin : defaults.origin,
  });
}

export function mediaReferenceFromPath(
  pathValue: string,
  defaults: MediaReferenceDefaults = {},
): MediaReference | null {
  const path = pathValue.trim();
  if (!path) {
    return null;
  }
  return createMediaReference({ path, ...defaults });
}

export function mediaReferenceFromElectronFile(
  file: ElectronFile | null | undefined,
): MediaReference | null {
  if (!file?.path) {
    return null;
  }

  return createMediaReference({
    path: file.path,
    name: file.name,
    size: typeof file.size === "number" ? file.size : undefined,
    type: file.type,
    origin: "file-selection",
  });
}

export function toElectronFile(reference: MediaReference): ElectronFile {
  return {
    name: reference.name,
    path: reference.path,
    size: reference.size ?? 0,
    type: reference.type ?? "video/mp4",
  } as ElectronFile;
}

export function resolveMediaReferencePath(
  reference?: Pick<MediaReference, "path"> | null,
) {
  return reference?.path ?? null;
}

export function resolveMediaReferenceKind(
  reference?: Pick<MediaReference, "media_kind" | "type" | "path"> | null,
): "video" | "audio" | null {
  if (!reference) return null;

  const explicitKind = reference.media_kind?.trim().toLowerCase();
  if (explicitKind === "video" || explicitKind === "audio") {
    return explicitKind;
  }

  const mimeType = reference.type?.trim().toLowerCase();
  if (mimeType?.startsWith("video/")) return "video";
  if (mimeType?.startsWith("audio/")) return "audio";

  const lowerPath = reference.path.toLowerCase();
  if ([...VIDEO_EXTENSIONS].some((extension) => lowerPath.endsWith(extension))) {
    return "video";
  }
  if ([...AUDIO_EXTENSIONS].some((extension) => lowerPath.endsWith(extension))) {
    return "audio";
  }
  return null;
}

export function isVideoMediaReference(
  reference?: Pick<MediaReference, "media_kind" | "type" | "path"> | null,
) {
  return resolveMediaReferenceKind(reference) === "video";
}
