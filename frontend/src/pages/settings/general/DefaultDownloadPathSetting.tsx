import { HardDrive } from "lucide-react";
import { fileService } from "../../../services/fileService";
import type { SettingsController, SettingsT } from "../settingsTypes";
import { SettingCard } from "./SettingCard";

type DefaultDownloadPathSettingProps = {
  controller: SettingsController;
  t: SettingsT;
};

export function DefaultDownloadPathSetting({ controller, t }: DefaultDownloadPathSettingProps) {
  const { settings, updateSettingsField } = controller;

  return (
    <SettingCard
      icon={<HardDrive size={18} className="text-indigo-400" />}
      title={t("general.defaultDownloadPath")}
      description={t("general.defaultDownloadPathDesc")}
      actions={
        <>
          <button
            onClick={async () => {
              const dir = await fileService.selectDirectory({ access: "write" });
              if (!settings || !dir) return;
              await updateSettingsField({ ...settings, default_download_path: dir });
            }}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 transition-colors"
          >
            {t("general.chooseFolder")}
          </button>
          <button
            onClick={async () => {
              if (!settings) return;
              await updateSettingsField({ ...settings, default_download_path: null });
            }}
            className="px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            {t("general.clearFolder")}
          </button>
        </>
      }
    >
      <p className="text-xs text-slate-400 font-mono break-all">
        {settings?.default_download_path || t("general.defaultDownloadPathUnset")}
      </p>
    </SettingCard>
  );
}
