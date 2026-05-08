import type { NavigationDestination } from "./navigation";
import { readUiStateValue, writeUiStateValue } from "../persistence/uiStateSettings";

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

let launchNavigationWasExplicit = false;
let deferredLaunchNavigationConsumed = false;
let deferredLaunchNavigationTarget: NavigationDestination | null = null;

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
  return normalizeRestorableDestination(readUiStateValue<string>(LAST_ROUTE_KEY));
}

export function readHashNavigationDestination(
  hash: string = window.location.hash,
): NavigationDestination | null {
  const route = hash.replace(/^#\/?/, "").split("?")[0] ?? "";
  return normalizeRestorableDestination(route);
}

export function resolveCurrentNavigationDestination(
  hash: string = window.location.hash,
): NavigationDestination {
  return readHashNavigationDestination(hash) ?? DEFAULT_LAUNCH_DESTINATION;
}

export function resolveCurrentNavigationPath(
  hash: string = window.location.hash,
): string {
  return `/${resolveCurrentNavigationDestination(hash)}`;
}

export function ensureLaunchHash() {
  if (readHashNavigationDestination()) {
    launchNavigationWasExplicit = true;
    return;
  }

  const targetHash = `#${resolveCurrentNavigationPath("")}`;
  window.history.replaceState(
    window.history.state,
    document.title,
    `${window.location.pathname}${window.location.search}${targetHash}`,
  );
}

export function resolveDeferredLaunchDestination(): NavigationDestination | null {
  if (launchNavigationWasExplicit || deferredLaunchNavigationConsumed) {
    return null;
  }

  return readLastNavigationDestination();
}

export function consumeDeferredLaunchDestination(): NavigationDestination | null {
  const destination = resolveDeferredLaunchDestination();
  deferredLaunchNavigationConsumed = true;
  deferredLaunchNavigationTarget = destination;
  return destination;
}

export function resetNavigationPersistenceForTests() {
  launchNavigationWasExplicit = false;
  deferredLaunchNavigationConsumed = false;
  deferredLaunchNavigationTarget = null;
}

export function persistNavigationDestination(pathname: string) {
  const normalizedPath = pathname.replace(/^\/+/, "");
  const destination = normalizeRestorableDestination(normalizedPath);

  if (!destination) {
    return;
  }

  if (deferredLaunchNavigationTarget) {
    if (destination !== deferredLaunchNavigationTarget) {
      return;
    }
    deferredLaunchNavigationTarget = null;
  }

  if (readLastNavigationDestination() === destination) {
    return;
  }

  writeUiStateValue(LAST_ROUTE_KEY, destination);
}
