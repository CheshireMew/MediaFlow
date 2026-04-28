import {
  normalizeMediaReference,
  type MediaReference,
} from "./mediaReference";

const PENDING_MEDIA_KEY = "mediaflow:pending_file";

export interface PendingMediaNavigationPayload {
  target?: "editor" | "translator" | "transcriber" | "preprocessing";
  video_ref?: MediaReference | null;
  subtitle_ref?: MediaReference | null;
}

function normalizePendingMediaNavigationPayload(
  payload: PendingMediaNavigationPayload,
): PendingMediaNavigationPayload {
  const videoRef =
    normalizeMediaReference(payload.video_ref);
  const subtitleRef =
    normalizeMediaReference(payload.subtitle_ref);

  return {
    target: payload.target,
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
