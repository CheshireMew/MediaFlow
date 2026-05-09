import { useEffect, useMemo, useState } from "react";
import App from "../../App";
import {
  getDesktopRuntimeInfo,
  hasDesktopCapability,
  isDesktopRuntime,
} from "../../services/desktop";
import { settingsService } from "../../services/domain/settingsService";
import { windowService } from "../../services/desktop";
import { createDesktopRuntimeDiagnostic } from "../../services/debug/runtimeDiagnostics";
import { DESKTOP_BRIDGE_CONTRACT_VERSION } from "../../contracts/runtimeContracts";
import i18n from "../../i18n";
import { resolveCurrentPresentationRoute } from "../../services/ui/pagePresentation";
import { probeBackendHealth } from "../../startup/backendHealthProbe";
import { initializeUiStateSettings } from "../../services/persistence/uiStateSettings";
import { configureApiRuntime } from "../../api/runtime";

type StartupState = {
  appReady: boolean;
  remoteBackendReady: boolean;
  message: string;
};

const REQUIRED_DESKTOP_CAPABILITIES = [
  "getDesktopRuntimeInfo",
] as const;

const STARTUP_HEALTH_RETRY_DELAY_MS = 150;
const STARTUP_HEALTH_TIMEOUT_MS = 60_000;

const STARTUP_TEXT_FALLBACKS = {
  retryingHealth: "后端正在启动中，正在重试健康检查...",
  checkingHealth: "已发现后端，正在检查服务健康状态...",
  retryingGeneric: "启动检查失败，正在重试...",
  ready: "后端已就绪。",
  webMode: "当前以无 Electron 后端引导的模式运行。",
} as const;

let startupBootstrapPromise: Promise<Partial<StartupState>> | null = null;
let rendererReadyNotificationSent = false;
const startupProgressListeners = new Set<(next: Partial<StartupState>) => void>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getStartupText = (key: keyof typeof STARTUP_TEXT_FALLBACKS) => {
  const translated = i18n.t(`startup.status.${key}`);
  return translated === `startup.status.${key}`
    ? STARTUP_TEXT_FALLBACKS[key]
    : translated;
};

function publishStartupProgress(next: Partial<StartupState>) {
  for (const listener of startupProgressListeners) {
    listener(next);
  }
}

function subscribeStartupProgress(listener: (next: Partial<StartupState>) => void) {
  startupProgressListeners.add(listener);
  return () => {
    startupProgressListeners.delete(listener);
  };
}

async function waitForBackendHealth() {
  let retryMessageShown = false;
  const deadline = Date.now() + STARTUP_HEALTH_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const health = await probeBackendHealth();
    if (health.ok) {
      return true;
    }

    if (!retryMessageShown) {
      retryMessageShown = true;
      publishStartupProgress({ message: getStartupText("retryingHealth") });
    }

    await sleep(STARTUP_HEALTH_RETRY_DELAY_MS);
  }

  throw new Error("Backend did not become healthy within 60000ms.");
}

async function loadUserSettings() {
  try {
    const settings = await settingsService.getSettings();
    initializeUiStateSettings(settings);
    if (settings?.language) {
      await i18n.changeLanguage(settings.language);
    }
    return settings;
  } catch (error) {
    console.warn("[Init] Failed to load user settings during startup.", error);
    initializeUiStateSettings(null);
    return null;
  }
}

async function bootstrapStartup(): Promise<Partial<StartupState>> {
  const desktopRuntime = isDesktopRuntime();
  let runtimeInfo: Awaited<ReturnType<typeof getDesktopRuntimeInfo>> | null = null;

  try {
    if (desktopRuntime) {
      runtimeInfo = await getDesktopRuntimeInfo();
      const resolvedRuntimeInfo = runtimeInfo;
      if (resolvedRuntimeInfo.contract_version < DESKTOP_BRIDGE_CONTRACT_VERSION) {
        throw new Error(
          `Desktop bridge contract mismatch. Required >= ${DESKTOP_BRIDGE_CONTRACT_VERSION}, received ${resolvedRuntimeInfo.contract_version}.`,
        );
      }

      const missingCapabilities = REQUIRED_DESKTOP_CAPABILITIES.filter(
        (capability) => !hasDesktopCapability(resolvedRuntimeInfo, capability),
      );
      if (missingCapabilities.length > 0) {
        throw new Error(
          `Desktop bridge capability mismatch. Missing: ${missingCapabilities.join(", ")}.`,
        );
      }

      if (resolvedRuntimeInfo.backend.status === "failed") {
        throw new Error(resolvedRuntimeInfo.backend.error || "Desktop backend failed to start.");
      }

      configureApiRuntime({
        apiBaseUrl: resolvedRuntimeInfo.backend.api_base_url,
        wsBaseUrl: resolvedRuntimeInfo.backend.ws_base_url,
      });

      console.log(
        "[Init] Desktop runtime contract ready",
        createDesktopRuntimeDiagnostic(resolvedRuntimeInfo),
      );
    }

    const backendHealthReady = desktopRuntime && runtimeInfo?.backend.health_status === "ready";
    if (!backendHealthReady) {
      await waitForBackendHealth();
    }

    if (!desktopRuntime) {
      await loadUserSettings();
      return {
        appReady: true,
        remoteBackendReady: true,
        message: getStartupText("webMode"),
      };
    }

    await loadUserSettings();
    return {
      appReady: true,
      remoteBackendReady: true,
      message: getStartupText("ready"),
    };
  } catch (error) {
    console.error("Failed to bootstrap desktop runtime", error);
    return {
      message:
        error instanceof Error && /mismatch/i.test(error.message)
          ? error.message
          : getStartupText("retryingGeneric"),
    };
  }
}

export function resetBootAppStartupForTests() {
  startupBootstrapPromise = null;
  rendererReadyNotificationSent = false;
  startupProgressListeners.clear();
}

export function BootApp() {
  const [startupState, setStartupState] = useState<StartupState>({
    appReady: false,
    remoteBackendReady: false,
    message: getStartupText("checkingHealth"),
  });

  const startupVariant = useMemo(() => {
    const destination = resolveCurrentPresentationRoute();

    switch (destination) {
      case "dashboard":
      case "editor":
      case "downloader":
      case "transcriber":
      case "translator":
      case "preprocessing":
      case "settings":
        return destination;
      default:
        return "downloader";
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const updateState = (next: Partial<StartupState>) => {
      if (cancelled) return;
      setStartupState((prev) => ({ ...prev, ...next }));
    };

    const unsubscribe = subscribeStartupProgress(updateState);
    startupBootstrapPromise ??= bootstrapStartup();
    void startupBootstrapPromise.then(updateState);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [startupVariant]);

  useEffect(() => {
    if (rendererReadyNotificationSent) {
      return;
    }

    let frameId = 0;
    frameId = window.requestAnimationFrame(() => {
      rendererReadyNotificationSent = true;
      windowService.notifyRendererReady();
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <App
      appReady={startupState.appReady}
      remoteBackendReady={startupState.remoteBackendReady}
      startupMessage={startupState.message}
    />
  );
}
