import { Wrench } from "lucide-react";
import type { SettingsController, SettingsT } from "../settingsTypes";
import { SettingCard } from "./SettingCard";
import { SettingsActionButton } from "./SettingsActionButton";

type YtDlpSettingProps = {
  controller: SettingsController;
  t: SettingsT;
};

export function YtDlpSetting({ controller, t }: YtDlpSettingProps) {
  const { handleUpdateYtDlp, isUpdatingYtDlp, ytDlpUpdateInfo } = controller;

  return (
    <SettingCard
      icon={<Wrench size={18} className="text-indigo-400" />}
      title={t("general.ytDlpTitle")}
      description={t("general.ytDlpDesc")}
      actions={
        <SettingsActionButton
          onClick={handleUpdateYtDlp}
          disabled={isUpdatingYtDlp}
          className="shrink-0"
        >
          {isUpdatingYtDlp ? t("general.ytDlpUpdating") : t("general.ytDlpUpdate")}
        </SettingsActionButton>
      }
    >
      {ytDlpUpdateInfo && (
        <p className="text-xs text-slate-400 font-mono break-all">
          {t("general.ytDlpVersionInfo", {
            previous: ytDlpUpdateInfo.previous_version || "unknown",
            current: ytDlpUpdateInfo.current_version || "unknown",
          })}
        </p>
      )}
    </SettingCard>
  );
}
