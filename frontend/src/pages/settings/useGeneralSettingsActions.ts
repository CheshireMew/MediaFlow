import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import i18n from "i18next";
import type { TFunction } from "i18next";
import type { ToolUpdateResponse, UserPreferencesPatch } from "../../types/api";
import {
  settingsService,
  type ResolvedUserSettings as UserSettings,
} from "../../services/domain";
import type { ShowSettingsNotification } from "./useSettingsData";

type UseGeneralSettingsActionsArgs = {
  fetchSettings: () => Promise<void>;
  settings: UserSettings | null;
  setSettings: Dispatch<SetStateAction<UserSettings | null>>;
  showNotification: ShowSettingsNotification;
  t: TFunction<"settings">;
  updatePreferences: (patch: UserPreferencesPatch, successMessage?: string) => Promise<UserSettings | null>;
};

export function useGeneralSettingsActions({
  fetchSettings,
  settings,
  setSettings,
  showNotification,
  t,
  updatePreferences,
}: UseGeneralSettingsActionsArgs) {
  const [isUpdatingYtDlp, setIsUpdatingYtDlp] = useState(false);
  const [isInstallingFasterWhisperCli, setIsInstallingFasterWhisperCli] = useState(false);
  const [fasterWhisperCliInstallProgress, setFasterWhisperCliInstallProgress] = useState<{
    progress: number;
    message: string;
  } | null>(null);
  const [ytDlpUpdateInfo, setYtDlpUpdateInfo] = useState<ToolUpdateResponse | null>(null);

  const handleUpdateYtDlp = async () => {
    setIsUpdatingYtDlp(true);
    try {
      const result = await settingsService.updateYtDlp();
      setYtDlpUpdateInfo(result);
      showNotification(t("general.ytDlpUpdateSuccess"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("general.ytDlpUpdateFailed");
      showNotification(message, "error");
    } finally {
      setIsUpdatingYtDlp(false);
    }
  };

  const handleInstallFasterWhisperCli = async () => {
    setIsInstallingFasterWhisperCli(true);
    setFasterWhisperCliInstallProgress({
      progress: 0,
      message: t("general.cliInstalling"),
    });
    try {
      const result = await settingsService.installFasterWhisperCli();
      setFasterWhisperCliInstallProgress({
        progress: 100,
        message: t("general.cliInstallSuccess"),
      });
      setSettings((current) =>
        current
          ? {
              ...current,
              faster_whisper_cli_path: result.cli_path,
            }
          : current,
      );
      await fetchSettings();
      showNotification(t("general.cliInstallSuccess"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("general.cliInstallFailed");
      showNotification(message, "error");
    } finally {
      setIsInstallingFasterWhisperCli(false);
      setTimeout(() => setFasterWhisperCliInstallProgress(null), 3000);
    }
  };

  const changeLanguage = async (language: string) => {
    if (!settings) return;
    const res = await updatePreferences({ language });
    if (res) {
      void i18n.changeLanguage(language);
    }
  };

  return {
    changeLanguage,
    fasterWhisperCliInstallProgress,
    handleInstallFasterWhisperCli,
    handleUpdateYtDlp,
    isInstallingFasterWhisperCli,
    isUpdatingYtDlp,
    ytDlpUpdateInfo,
  };
}
