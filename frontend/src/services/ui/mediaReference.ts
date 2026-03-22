import type { ElectronFile } from "../../types/electron";
import type { MediaKind, MediaOriginKind, MediaRole } from "../../contracts/mediaContracts";

export interface MediaReference {
  path: string;
  name: string;
  size?: number;
  type?: string;
  media_id?: string;
  media_kind?: MediaKind;
  role?: MediaRole;
  origin?: MediaOriginKind;
}

export function getBasenameFromPath(filePath: string, fallbackName?: string) {
  const normalized = typeof filePath === "string" ? filePath.trim() : "";
  if (!normalized) {
    return fallbackName ?? "";
  }

  const segments = normalized.split(/[\\/]/);
  const basename = segments[segments.length - 1];
  return basename || fallbackName || normalized;
}

export function createMediaReference(params: {
  path: string;
  name?: string | null;
  size?: number;
  type?: string;
  media_id?: string;
  media_kind?: MediaKind;
  role?: MediaRole;
  origin?: MediaOriginKind;
}): MediaReference {
  const { path, name, size, type, media_id, media_kind, role, origin } = params;
  return {
    path,
    name: name?.trim() || getBasenameFromPath(path, "media"),
    size,
    type,
    media_id,
    media_kind,
    role,
    origin,
  };
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

export function serializeMediaReference(reference: MediaReference | null) {
  if (!reference) {
    return null;
  }

  return JSON.stringify({
    path: reference.path,
    name: reference.name,
    size: reference.size ?? 0,
    type: reference.type ?? "video/mp4",
    media_id: reference.media_id ?? null,
    media_kind: reference.media_kind ?? null,
    role: reference.role ?? null,
    origin: reference.origin ?? null,
  });
}

export function parseMediaReference(raw: string | null): MediaReference | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<MediaReference>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.path !== "string") {
      return null;
    }

    return createMediaReference({
      path: parsed.path,
      name: parsed.name,
      size: typeof parsed.size === "number" ? parsed.size : undefined,
      type: typeof parsed.type === "string" ? parsed.type : undefined,
      media_id: typeof parsed.media_id === "string" ? parsed.media_id : undefined,
      media_kind: typeof parsed.media_kind === "string" ? (parsed.media_kind as MediaKind) : undefined,
      role: typeof parsed.role === "string" ? (parsed.role as MediaRole) : undefined,
      origin: typeof parsed.origin === "string" ? (parsed.origin as MediaOriginKind) : undefined,
    });
  } catch {
    return null;
  }
}

export function resolveMediaReferencePath(
  reference?: Pick<MediaReference, "path"> | null,
  fallbackPath?: string | null,
) {
  return reference?.path ?? fallbackPath ?? null;
}
