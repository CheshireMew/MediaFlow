import type { DesktopRuntimeInfo, ElectronAPI } from "../../types/electron-api";

let desktopRuntimeInfoPromise: Promise<DesktopRuntimeInfo> | null = null;

export function getDesktopApi(): ElectronAPI | null {
  if (typeof window === "undefined") {
    return null;
  }
  const target = window as Window & { electronAPI?: ElectronAPI };
  return target.electronAPI ?? null;
}

export function isDesktopRuntime() {
  return Boolean(getDesktopApi());
}

export function requireDesktopApiMethod<K extends keyof ElectronAPI>(
  method: K,
  unavailableMessage: string,
): NonNullable<ElectronAPI[K]> {
  const api = getDesktopApi();
  const fn = api?.[method];
  if (!fn) {
    throw new Error(unavailableMessage);
  }
  return fn as NonNullable<ElectronAPI[K]>;
}

export async function getDesktopRuntimeInfo(forceRefresh: boolean = false) {
  if (!desktopRuntimeInfoPromise || forceRefresh) {
    desktopRuntimeInfoPromise = requireDesktopApiMethod(
      "getDesktopRuntimeInfo",
      "Desktop runtime handshake is unavailable.",
    )();
  }

  return await desktopRuntimeInfoPromise;
}

export function hasDesktopCapability(
  runtimeInfo: DesktopRuntimeInfo,
  capability: keyof ElectronAPI,
) {
  return runtimeInfo.capabilities.includes(capability);
}

export function resetDesktopRuntimeInfoCache() {
  desktopRuntimeInfoPromise = null;
}
