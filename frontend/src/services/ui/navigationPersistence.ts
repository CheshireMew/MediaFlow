import type { NavigationDestination } from "./navigation";

const LAST_ROUTE_KEY = "mediaflow:last-route";

const RESTORABLE_DESTINATIONS = new Set<NavigationDestination>([
  "dashboard",
  "downloader",
  "transcriber",
  "translator",
  "editor",
  "preprocessing",
  "settings",
]);

export const DEFAULT_LAUNCH_DESTINATION: NavigationDestination = "downloader";

export function normalizeRestorableDestination(
  value: string | null | undefined,
): NavigationDestination | null {
  if (!value) {
    return null;
  }

  return RESTORABLE_DESTINATIONS.has(value as NavigationDestination)
    ? (value as NavigationDestination)
    : null;
}

export function readLastNavigationDestination(): NavigationDestination | null {
  return normalizeRestorableDestination(localStorage.getItem(LAST_ROUTE_KEY));
}

export function resolveLaunchDestination(): NavigationDestination {
  return readLastNavigationDestination() ?? DEFAULT_LAUNCH_DESTINATION;
}

export function persistNavigationDestination(pathname: string) {
  const normalizedPath = pathname.replace(/^\/+/, "");
  const destination = normalizeRestorableDestination(normalizedPath);

  if (!destination) {
    return;
  }

  localStorage.setItem(LAST_ROUTE_KEY, destination);
}
