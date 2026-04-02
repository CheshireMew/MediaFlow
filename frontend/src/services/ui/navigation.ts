import {
  createMediaReference,
  type MediaReference,
} from "./mediaReference";
import { writePendingMediaNavigation } from "./pendingMediaNavigation";

export type NavigationDestination =
  | "dashboard"
  | "downloader"
  | "transcriber"
  | "translator"
  | "editor"
  | "preprocessing"
  | "settings"
  | "home";

export interface NavigationPayload {
  video_path?: string | null;
  subtitle_path?: string | null;
  video_ref?: MediaReference | null;
  subtitle_ref?: MediaReference | null;
  settings_tab?: "llm" | "general";
}

export interface NavigationEventDetail {
  destination: NavigationDestination;
  payload?: NavigationPayload;
}

export function resolveNavigationPath(detail: NavigationEventDetail): string {
  if (
    detail.destination === "settings" &&
    detail.payload?.settings_tab
  ) {
    return `/${detail.destination}?tab=${detail.payload.settings_tab}`;
  }

  return `/${detail.destination}`;
}

function normalizeNavigationMediaRef(
  reference?: MediaReference | null,
): MediaReference | null {
  if (!reference?.path) {
    return null;
  }

  return createMediaReference({
    path: reference.path,
    name: reference.name,
    size: reference.size,
    type: reference.type,
    media_id: reference.media_id,
    media_kind: reference.media_kind,
    role: reference.role,
    origin: reference.origin,
  });
}

export function createNavigationMediaPayload(params: {
  videoPath?: string | null;
  subtitlePath?: string | null;
  videoRef?: MediaReference | null;
  subtitleRef?: MediaReference | null;
  videoMeta?: Partial<Pick<MediaReference, "name" | "size" | "type">>;
  subtitleMeta?: Partial<Pick<MediaReference, "name" | "size" | "type">>;
}): NavigationPayload {
  const {
    videoPath,
    subtitlePath,
    videoRef,
    subtitleRef,
    videoMeta,
    subtitleMeta,
  } = params;

  const resolvedVideoRef =
    normalizeNavigationMediaRef(videoRef) ??
    (videoPath
      ? createMediaReference({
        path: videoPath,
        ...videoMeta,
      })
      : null);
  const resolvedSubtitleRef =
    normalizeNavigationMediaRef(subtitleRef) ??
    (subtitlePath
      ? createMediaReference({
        path: subtitlePath,
        ...subtitleMeta,
      })
      : null);

  return {
    video_path: resolvedVideoRef ? null : videoPath ?? null,
    subtitle_path: resolvedSubtitleRef ? null : subtitlePath ?? null,
    video_ref: resolvedVideoRef,
    subtitle_ref: resolvedSubtitleRef,
  };
}

export function resolveNavigationMediaPayload(
  payload?: NavigationPayload | null,
) {
  const videoRef = normalizeNavigationMediaRef(payload?.video_ref);
  const subtitleRef = normalizeNavigationMediaRef(payload?.subtitle_ref);

  return {
    videoPath: videoRef?.path ?? payload?.video_path ?? null,
    subtitlePath: subtitleRef?.path ?? payload?.subtitle_path ?? null,
    videoRef,
    subtitleRef,
  };
}

function persistNavigationPayload(
  destination: NavigationDestination,
  payload?: NavigationPayload,
) {
  if (!payload) {
    return;
  }

  if (
    destination === "editor" ||
    destination === "translator" ||
    destination === "transcriber" ||
    destination === "preprocessing"
  ) {
    writePendingMediaNavigation({
      target: destination,
      video_path: payload.video_ref ? null : payload.video_path ?? null,
      subtitle_path: payload.subtitle_ref ? null : payload.subtitle_path ?? null,
      video_ref: payload.video_ref ?? null,
      subtitle_ref: payload.subtitle_ref ?? null,
    });
  }
}

export const NavigationService = {
  eventName: "mediaflow:navigate",

  navigate: (
    destination: NavigationDestination,
    payload?: NavigationPayload,
  ) => {
    persistNavigationPayload(destination, payload);
    const event = new CustomEvent(NavigationService.eventName, {
      detail: {
        destination,
        payload,
      } satisfies NavigationEventDetail,
    });
    window.dispatchEvent(event);
  },

  subscribe: (callback: (detail: NavigationEventDetail) => void) => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<NavigationEventDetail>).detail;
      if (!detail || typeof detail !== "object") {
        return;
      }
      callback(detail);
    };
    window.addEventListener(
      NavigationService.eventName,
      handler as EventListener,
    );
    return () =>
      window.removeEventListener(
        NavigationService.eventName,
        handler as EventListener,
      );
  },
};
