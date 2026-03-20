const PENDING_MEDIA_KEY = "mediaflow:pending_file";

export interface PendingMediaNavigationPayload {
  target?: "editor" | "translator" | "transcriber";
  video_path?: string | null;
  subtitle_path?: string | null;
}

export function writePendingMediaNavigation(
  payload: PendingMediaNavigationPayload,
): void {
  sessionStorage.setItem(PENDING_MEDIA_KEY, JSON.stringify(payload));
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
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingMediaNavigation(): void {
  sessionStorage.removeItem(PENDING_MEDIA_KEY);
}
