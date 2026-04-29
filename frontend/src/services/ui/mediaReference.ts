import type { ElectronFile } from "../../types/electron";

export interface MediaReference {
  path: string;
  name: string;
  size?: number | null;
  type?: string | null;
  media_id?: string | null;
  media_kind?: string | null;
  role?: string | null;
  origin?: string | null;
}

type MediaReferenceDefaults = {
  name?: string | null;
  size?: number | null;
  type?: string | null;
  media_id?: string;
  media_kind?: string | null;
  role?: string | null;
  origin?: string | null;
};

export function getBasenameFromPath(filePath: string, defaultName?: string) {
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

export function normalizeMediaReference(
  value: unknown,
  defaults: MediaReferenceDefaults = {},
): MediaReference | null {
  if (typeof value === "string") {
    const path = value.trim();
    if (!path) {
      return null;
    }
    return createMediaReference({
      path,
      ...defaults,
    });
  }

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

    return normalizeMediaReference(parsed);
  } catch {
    return null;
  }
}

export function resolveMediaReferencePath(
  reference?: Pick<MediaReference, "path"> | null,
) {
  return reference?.path ?? null;
}
