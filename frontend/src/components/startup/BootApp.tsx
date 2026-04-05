import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { HashRouter } from "react-router-dom";
import { Layout } from "../layout/Layout";
import { StartupPlaceholderPage } from "./StartupPlaceholderPage";
import { isDesktopRuntime, settingsService } from "../../services/domain";
import { getDesktopRuntimeInfo, hasDesktopCapability } from "../../services/desktop";
import { windowService } from "../../services/desktop";
import { createDesktopRuntimeDiagnostic } from "../../services/debug/runtimeDiagnostics";
import { DESKTOP_BRIDGE_CONTRACT_VERSION, DESKTOP_TASK_OWNER_MODE } from "../../contracts/runtimeContracts";
import i18n from "../../i18n";
import { resolveCurrentPresentationRoute } from "../../services/ui/pagePresentation";

type StartupState = {
  appReady: boolean;
  remoteBackendReady: boolean;
  message: string;
};

type AppShellProps = {
  appReady: boolean;
  remoteBackendReady: boolean;
  startupMessage: string;
};

const REQUIRED_DESKTOP_CAPABILITIES = [
  "listDesktopTasks",
  "onDesktopTaskEvent",
  "desktopTranscribe",
] as const;

const STARTUP_TEXT_FALLBACKS = {
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
  const [LoadedApp, setLoadedApp] = useState<ComponentType<AppShellProps> | null>(null);
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

    window.requestAnimationFrame(() => {
      void import("../../App").then((module) => {
        if (!cancelled) {
          setLoadedApp(() => module.default);
        }
      });
    });

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const updateState = (next: Partial<StartupState>) => {
      if (cancelled) return;
      setStartupState((prev) => ({ ...prev, ...next }));
    };

    const bootstrap = async () => {
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

      while (!cancelled) {
        try {
          if (!isDesktopRuntime()) {
            console.warn("[Init] Electron API not found, assuming web mode.");
            updateState({
              appReady: true,
              remoteBackendReady: true,
              message: getStartupText("webMode"),
            });
            return;
          }

          try {
            const runtimeInfo = await getDesktopRuntimeInfo();
            if (runtimeInfo.contract_version < DESKTOP_BRIDGE_CONTRACT_VERSION) {
              throw new Error(
                `Desktop bridge contract mismatch. Required >= ${DESKTOP_BRIDGE_CONTRACT_VERSION}, received ${runtimeInfo.contract_version}.`,
              );
            }
            if (runtimeInfo.task_owner_mode !== DESKTOP_TASK_OWNER_MODE) {
              throw new Error(
                `Desktop task owner mismatch. Required ${DESKTOP_TASK_OWNER_MODE}, received ${runtimeInfo.task_owner_mode}.`,
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

            updateState({
              appReady: true,
              remoteBackendReady: true,
              message: getStartupText("ready"),
            });
            window.requestAnimationFrame(() => {
              void loadUserSettings();
            });
            return;
          } catch (error) {
            console.log("[Init] Desktop worker not ready yet...", error);
            updateState({
              message:
                error instanceof Error && /mismatch/i.test(error.message)
                  ? error.message
                  : getStartupText("retryingGeneric"),
            });
          }
        } catch (error) {
          console.error("Failed to bootstrap desktop worker", error);
          updateState({
            message:
              error instanceof Error && /mismatch/i.test(error.message)
                ? error.message
                : getStartupText("retryingGeneric"),
          });
        }

        await sleep(1000);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let frameId = 0;
    frameId = window.requestAnimationFrame(() => {
      windowService.notifyRendererReady();
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  if (!LoadedApp) {
    return (
      <HashRouter>
        <Layout>
          <StartupPlaceholderPage
            variant={startupVariant}
            message={startupState.message}
          />
        </Layout>
      </HashRouter>
    );
  }

  return (
    <LoadedApp
      appReady={startupState.appReady}
      remoteBackendReady={startupState.remoteBackendReady}
      startupMessage={startupState.message}
    />
  );
}
