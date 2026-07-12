import { useCallback, useEffect, useMemo, useState } from "react";
import App from "../../App";
import {
  getDesktopRuntimeInfo,
  hasDesktopCapability,
  isDesktopRuntime,
  resetDesktopRuntimeInfoCache,
} from "../../services/desktop";
import { settingsService } from "../../services/domain";
import { windowService } from "../../services/desktop";
import { createDesktopRuntimeDiagnostic } from "../../services/debug/runtimeDiagnostics";
import { DESKTOP_BRIDGE_CONTRACT_VERSION } from "../../contracts/runtimeContracts";
import i18n, {
  getStartupStatusFallback,
  type StartupStatusKey,
} from "../../i18n";
import { resolveCurrentPresentationRoute } from "../../services/ui/pagePresentation";
import { probeBackendHealth } from "../../startup/backendHealthProbe";
import { initializeUiStateSettings } from "../../services/persistence/uiStateSettings";
import { initializeWorkspaceState } from "../../services/persistence/workspaceState";
import { configureApiRuntime } from "../../api/runtime";
import {
  clearStartupBootstrap,
  getOrCreateStartupBootstrap,
  isRendererReadyNotificationSent,
  markRendererReadyNotificationSent,
  publishStartupProgress,
  subscribeStartupProgress,
  type StartupSnapshot,
} from "./bootStartupCoordinator";

const REQUIRED_DESKTOP_CAPABILITIES = [
  "getDesktopRuntimeInfo",
  "readWorkspaceState",
  "writeWorkspaceState",
  "writeWorkspaceStateSync",
] as const;

const STARTUP_HEALTH_RETRY_DELAY_MS = 150;
const STARTUP_HEALTH_TIMEOUT_MS = 60_000;
const STARTUP_AUTO_RETRY_DELAY_MS = 5_000;

class PermanentStartupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentStartupError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getStartupText = (key: StartupStatusKey) => {
  const translated = i18n.t(`startup.status.${key}`);
  return translated === `startup.status.${key}`
    ? getStartupStatusFallback(key)
    : translated;
};

async function waitForBackendHealth() {
  let retryMessageShown = false;
  const deadline = Date.now() + STARTUP_HEALTH_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const health = await probeBackendHealth();
      if (health.ok) {
        return;
      }
    } catch (error) {
      console.warn("[Init] Backend health probe failed.", error);
    }

    if (!retryMessageShown) {
      retryMessageShown = true;
      publishStartupProgress({ message: getStartupText("retryingHealth") });
    }

    await sleep(STARTUP_HEALTH_RETRY_DELAY_MS);
  }

  throw new Error(
    `Backend did not become healthy within ${STARTUP_HEALTH_TIMEOUT_MS}ms.`,
  );
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

async function initializePersistentState() {
  await Promise.all([loadUserSettings(), initializeWorkspaceState()]);
}

async function bootstrapStartup(forceRuntimeRefresh: boolean): Promise<StartupSnapshot> {
  const desktopRuntime = isDesktopRuntime();
  let runtimeInfo: Awaited<ReturnType<typeof getDesktopRuntimeInfo>> | null = null;

  if (desktopRuntime) {
      runtimeInfo = await getDesktopRuntimeInfo(forceRuntimeRefresh);
      const resolvedRuntimeInfo = runtimeInfo;
      if (resolvedRuntimeInfo.contract_version < DESKTOP_BRIDGE_CONTRACT_VERSION) {
        throw new PermanentStartupError(
          `Desktop bridge contract mismatch. Required >= ${DESKTOP_BRIDGE_CONTRACT_VERSION}, received ${resolvedRuntimeInfo.contract_version}.`,
        );
      }

      const missingCapabilities = REQUIRED_DESKTOP_CAPABILITIES.filter(
        (capability) => !hasDesktopCapability(resolvedRuntimeInfo, capability),
      );
      if (missingCapabilities.length > 0) {
        throw new PermanentStartupError(
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
    await initializePersistentState();
    return {
      appReady: true,
      remoteBackendReady: true,
      message: getStartupText("webMode"),
      phase: "ready",
    };
  }

  await initializePersistentState();
  return {
    appReady: true,
    remoteBackendReady: true,
    message: getStartupText("ready"),
    phase: "ready",
  };
}

export function BootApp() {
  const [startupState, setStartupState] = useState<StartupSnapshot>({
    appReady: false,
    remoteBackendReady: false,
    message: getStartupText("checkingHealth"),
    phase: "starting",
  });
  const [retryGeneration, setRetryGeneration] = useState(0);

  const startupVariant = useMemo(() => {
    const destination = resolveCurrentPresentationRoute();

    switch (destination) {
      case "dashboard":
      case "editor":
      case "downloader":
      case "transcriber":
      case "translator":
      case "settings":
        return destination;
      default:
        return "downloader";
    }
  }, []);

  const retryStartup = useCallback(() => {
    clearStartupBootstrap();
    resetDesktopRuntimeInfoCache();
    setStartupState({
      appReady: false,
      remoteBackendReady: false,
      message: getStartupText("checkingHealth"),
      phase: "starting",
    });
    setRetryGeneration((generation) => generation + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;

    const updateState = (next: Partial<StartupSnapshot>) => {
      if (cancelled) return;
      setStartupState((prev) => ({ ...prev, ...next }));
    };

    const unsubscribe = subscribeStartupProgress(updateState);
    const startupBootstrap = getOrCreateStartupBootstrap(
      () => bootstrapStartup(retryGeneration > 0),
    );
    void startupBootstrap
      .then(updateState)
      .catch((error: unknown) => {
        if (cancelled) return;

        console.error("Failed to bootstrap desktop runtime", error);
        if (error instanceof PermanentStartupError) {
          updateState({
            appReady: false,
            remoteBackendReady: false,
            phase: "fatal-error",
            message: `${getStartupText("fatalContract")} ${error.message}`,
          });
          return;
        }

        updateState({
          appReady: false,
          remoteBackendReady: false,
          phase: "retryable-error",
          message: `${getStartupText("retryingGeneric")} ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
        retryTimer = window.setTimeout(retryStartup, STARTUP_AUTO_RETRY_DELAY_MS);
      });

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      unsubscribe();
    };
  }, [retryGeneration, retryStartup, startupVariant]);

  useEffect(() => {
    if (isRendererReadyNotificationSent()) {
      return;
    }

    let frameId = 0;
    frameId = window.requestAnimationFrame(() => {
      markRendererReadyNotificationSent();
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
      startupStatus={
        startupState.phase === "fatal-error"
          ? "fatal-error"
          : startupState.phase === "retryable-error"
            ? "retryable-error"
            : "loading"
      }
      onRetryStartup={retryStartup}
    />
  );
}
