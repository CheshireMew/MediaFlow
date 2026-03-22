import { useEffect, useState } from "react";
import App from "../../App";
import { apiClient } from "../../api/client";
import { isDesktopRuntime, settingsService } from "../../services/domain";
import { getDesktopRuntimeInfo, hasDesktopCapability } from "../../services/desktop";
import { createDesktopRuntimeDiagnostic } from "../../services/debug/runtimeDiagnostics";
import { DESKTOP_BRIDGE_CONTRACT_VERSION, DESKTOP_TASK_OWNER_MODE } from "../../contracts/runtimeContracts";
import i18n from "../../i18n";

type StartupState = {
  appReady: boolean;
  remoteBackendReady: boolean;
  message: string;
};

const REQUIRED_DESKTOP_CAPABILITIES = [
  "listDesktopTasks",
  "onDesktopTaskEvent",
  "desktopTranscribe",
] as const;

export function BootApp() {
  const getStartupText = (key: string) => i18n.t(`startup.status.${key}`);
  const [startupState, setStartupState] = useState<StartupState>({
    appReady: false,
    remoteBackendReady: false,
    message: getStartupText("checkingHealth"),
  });

  useEffect(() => {
    let cancelled = false;

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

            await loadUserSettings();
            updateState({
              appReady: true,
              message: getStartupText("checkingHealth"),
            });
            break;
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

      while (!cancelled) {
        try {
          await apiClient.checkHealth();
          console.log("[Init] Backend is ready!");
          updateState({
            appReady: true,
            remoteBackendReady: true,
            message: getStartupText("ready"),
          });
          return;
        } catch (error) {
          console.log("[Init] Backend not healthy yet...", error);
          updateState({ message: getStartupText("retryingHealth") });
        }

        await sleep(1000);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
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
