import { useEffect, useMemo, useState } from "react";
import App from "../../App";
import { isDesktopRuntime, settingsService } from "../../services/domain";
import { getDesktopRuntimeInfo, hasDesktopCapability } from "../../services/desktop";
import { windowService } from "../../services/desktop";
import { createDesktopRuntimeDiagnostic } from "../../services/debug/runtimeDiagnostics";
import { DESKTOP_BRIDGE_CONTRACT_VERSION, TASK_OWNER_MODE } from "../../contracts/runtimeContracts";
import i18n, { ensureI18nNamespaces } from "../../i18n";
import { resolveCurrentPresentationRoute } from "../../services/ui/pagePresentation";
import { probeBackendHealth } from "../../startup/backendHealthProbe";
import { ROUTE_PAGE_MODULES } from "../../startup/routePageDefinitions";

type StartupState = {
  appReady: boolean;
  remoteBackendReady: boolean;
  message: string;
};

const REQUIRED_DESKTOP_CAPABILITIES = [
  "getDesktopRuntimeInfo",
] as const;

const STARTUP_HEALTH_RETRY_DELAY_MS = 150;

const STARTUP_TEXT_FALLBACKS = {
  retryingHealth: "后端正在启动中，正在重试健康检查...",
  checkingHealth: "已发现后端，正在检查服务健康状态...",
  retryingGeneric: "启动检查失败，正在重试...",
  ready: "后端已就绪。",
  webMode: "当前以无 Electron 后端引导的模式运行。",
} as const;

export function BootApp() {
  const getStartupText = (key: keyof typeof STARTUP_TEXT_FALLBACKS) => {
    const translated = i18n.t(`startup.status.${key}`);
    return translated === `startup.status.${key}`
      ? STARTUP_TEXT_FALLBACKS[key]
      : translated;
  };
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

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const updateState = (next: Partial<StartupState>) => {
      if (cancelled) return;
      setStartupState((prev) => ({ ...prev, ...next }));
    };

    const preloadStartupRoute = async () => {
      const routeModule = ROUTE_PAGE_MODULES[startupVariant];
      await Promise.all([
        routeModule.load(),
        ensureI18nNamespaces(routeModule.namespaces),
      ]);
    };

    const startStartupRoutePreload = () =>
      preloadStartupRoute().then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );

    const waitForStartupRoutePreload = async (
      preload: ReturnType<typeof startStartupRoutePreload>,
    ) => {
      const result = await preload;
      if (!result.ok) {
        throw result.error;
      }
    };

    const waitForBackendHealth = async () => {
      let retryMessageShown = false;

      while (!cancelled) {
        const health = await probeBackendHealth();
        if (health.ok) {
          return true;
        }

        if (!retryMessageShown) {
          retryMessageShown = true;
          updateState({ message: getStartupText("retryingHealth") });
        }

        await sleep(STARTUP_HEALTH_RETRY_DELAY_MS);
      }

      return false;
    };

    const bootstrap = async () => {
      const startupRoutePreload = startStartupRoutePreload();
      const desktopRuntime = isDesktopRuntime();
      const runtimeInfoPromise = desktopRuntime
        ? getDesktopRuntimeInfo().then(
            (runtimeInfo) => ({ runtimeInfo, error: null }),
            (error: unknown) => ({ runtimeInfo: null, error }),
          )
        : null;

      const loadUserSettings = async () => {
        try {
          const settings = await settingsService.getSettings();
          if (settings?.language) {
            await i18n.changeLanguage(settings.language);
          }
        } catch (error) {
          console.warn("[Init] Failed to load user settings during startup.", error);
        }
      };

      try {
        const backendReady = await waitForBackendHealth();
        if (!backendReady) {
          return;
        }

        if (!desktopRuntime) {
          await waitForStartupRoutePreload(startupRoutePreload);
          updateState({
            appReady: true,
            remoteBackendReady: true,
            message: getStartupText("webMode"),
          });
          return;
        }

        const runtimeInfoResult = await runtimeInfoPromise;
        if (!runtimeInfoResult || runtimeInfoResult.error || !runtimeInfoResult.runtimeInfo) {
          throw runtimeInfoResult?.error ?? new Error("Desktop runtime handshake is unavailable.");
        }
        const { runtimeInfo } = runtimeInfoResult;
        if (runtimeInfo.contract_version < DESKTOP_BRIDGE_CONTRACT_VERSION) {
          throw new Error(
            `Desktop bridge contract mismatch. Required >= ${DESKTOP_BRIDGE_CONTRACT_VERSION}, received ${runtimeInfo.contract_version}.`,
          );
        }
        if (runtimeInfo.task_owner_mode !== TASK_OWNER_MODE) {
          throw new Error(
            `Task owner mismatch. Required ${TASK_OWNER_MODE}, received ${runtimeInfo.task_owner_mode}.`,
          );
        }

        const missingCapabilities = REQUIRED_DESKTOP_CAPABILITIES.filter(
          (capability) => !hasDesktopCapability(runtimeInfo, capability),
        );
        if (missingCapabilities.length > 0) {
          throw new Error(
            `Desktop bridge capability mismatch. Missing: ${missingCapabilities.join(", ")}.`,
          );
        }

        console.log(
          "[Init] Desktop runtime contract ready",
          createDesktopRuntimeDiagnostic(runtimeInfo),
        );

        await waitForStartupRoutePreload(startupRoutePreload);
        updateState({
          appReady: true,
          remoteBackendReady: true,
          message: getStartupText("ready"),
        });
        window.requestAnimationFrame(() => {
          void loadUserSettings();
        });
      } catch (error) {
        console.error("Failed to bootstrap desktop worker", error);
        updateState({
          message:
            error instanceof Error && /mismatch/i.test(error.message)
              ? error.message
              : getStartupText("retryingGeneric"),
        });
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [startupVariant]);

  useEffect(() => {
    let frameId = 0;
    frameId = window.requestAnimationFrame(() => {
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
