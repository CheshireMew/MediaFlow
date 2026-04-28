import { Wrench } from "lucide-react";
import type { SettingsController, SettingsT } from "../settingsTypes";
import { SettingCard } from "./SettingCard";

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
        <button
          onClick={handleUpdateYtDlp}
          disabled={isUpdatingYtDlp}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {isUpdatingYtDlp ? t("general.ytDlpUpdating") : t("general.ytDlpUpdate")}
        </button>
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
