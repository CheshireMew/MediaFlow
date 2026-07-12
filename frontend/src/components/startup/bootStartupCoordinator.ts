export type StartupSnapshot = {
  appReady: boolean;
  remoteBackendReady: boolean;
  message: string;
  phase: "starting" | "ready" | "retryable-error" | "fatal-error";
};

let startupBootstrapPromise: Promise<StartupSnapshot> | null = null;
let rendererReadyNotificationSent = false;
const startupProgressListeners = new Set<
  (next: Partial<StartupSnapshot>) => void
>();

export function getOrCreateStartupBootstrap(
  factory: () => Promise<StartupSnapshot>,
) {
  startupBootstrapPromise ??= factory();
  return startupBootstrapPromise;
}

export function clearStartupBootstrap() {
  startupBootstrapPromise = null;
}

export function publishStartupProgress(next: Partial<StartupSnapshot>) {
  for (const listener of startupProgressListeners) {
    listener(next);
  }
}

export function subscribeStartupProgress(
  listener: (next: Partial<StartupSnapshot>) => void,
) {
  startupProgressListeners.add(listener);
  return () => {
    startupProgressListeners.delete(listener);
  };
}

export function isRendererReadyNotificationSent() {
  return rendererReadyNotificationSent;
}

export function markRendererReadyNotificationSent() {
  rendererReadyNotificationSent = true;
}

export function resetBootAppStartupForTests() {
  startupBootstrapPromise = null;
  rendererReadyNotificationSent = false;
  startupProgressListeners.clear();
}
