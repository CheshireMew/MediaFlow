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
}

export interface NavigationEventDetail {
  destination: NavigationDestination;
  payload?: NavigationPayload;
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
    destination === "transcriber"
  ) {
    writePendingMediaNavigation({
      target: destination,
      video_path: payload.video_path ?? null,
      subtitle_path: payload.subtitle_path ?? null,
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
