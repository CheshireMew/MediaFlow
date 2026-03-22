import {
  createMediaReference,
  type MediaReference,
} from "./mediaReference";

const PENDING_MEDIA_KEY = "mediaflow:pending_file";

export interface PendingMediaNavigationPayload {
  target?: "editor" | "translator" | "transcriber" | "preprocessing";
  video_path?: string | null;
  subtitle_path?: string | null;
  video_ref?: MediaReference | null;
  subtitle_ref?: MediaReference | null;
}

function normalizePendingMediaNavigationPayload(
  payload: PendingMediaNavigationPayload,
): PendingMediaNavigationPayload {
  const videoRef = payload.video_ref
    ? createMediaReference({
        path: payload.video_ref.path,
        name: payload.video_ref.name,
        size: payload.video_ref.size,
        type: payload.video_ref.type,
        media_id: payload.video_ref.media_id,
        media_kind: payload.video_ref.media_kind,
        role: payload.video_ref.role,
        origin: payload.video_ref.origin,
      })
    : payload.video_path
      ? createMediaReference({ path: payload.video_path })
      : null;
  const subtitleRef = payload.subtitle_ref
    ? createMediaReference({
        path: payload.subtitle_ref.path,
        name: payload.subtitle_ref.name,
        size: payload.subtitle_ref.size,
        type: payload.subtitle_ref.type,
        media_id: payload.subtitle_ref.media_id,
        media_kind: payload.subtitle_ref.media_kind,
        role: payload.subtitle_ref.role,
        origin: payload.subtitle_ref.origin,
      })
    : payload.subtitle_path
      ? createMediaReference({ path: payload.subtitle_path })
      : null;

  return {
    target: payload.target,
    video_path: videoRef ? null : payload.video_path ?? null,
    subtitle_path: subtitleRef ? null : payload.subtitle_path ?? null,
    video_ref: videoRef,
    subtitle_ref: subtitleRef,
  };
}

export function writePendingMediaNavigation(
  payload: PendingMediaNavigationPayload,
): void {
  sessionStorage.setItem(
    PENDING_MEDIA_KEY,
    JSON.stringify(normalizePendingMediaNavigationPayload(payload)),
  );
}

export function consumePendingMediaNavigation(
  payload?: PendingMediaNavigationPayload | null,
): PendingMediaNavigationPayload | null {
  const candidate = payload ?? readPendingMediaNavigation();
  if (!candidate) {
    return null;
  }
  clearPendingMediaNavigation();
  return candidate;
}

export function readPendingMediaNavigation(): PendingMediaNavigationPayload | null {
  const raw = sessionStorage.getItem(PENDING_MEDIA_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PendingMediaNavigationPayload;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (
      (!parsed.video_ref || typeof parsed.video_ref !== "object") &&
      (!parsed.subtitle_ref || typeof parsed.subtitle_ref !== "object")
    ) {
      return null;
    }
    return normalizePendingMediaNavigationPayload(parsed);
  } catch {
    return null;
  }
}

export function clearPendingMediaNavigation(): void {
  sessionStorage.removeItem(PENDING_MEDIA_KEY);
}
