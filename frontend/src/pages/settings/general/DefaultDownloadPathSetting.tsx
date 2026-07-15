import { HardDrive } from "lucide-react";
import { fileService } from "../../../services/fileService";
import type { SettingsController, SettingsT } from "../settingsTypes";
import { SettingCard } from "./SettingCard";
import { SettingsActionButton } from "./SettingsActionButton";

type DefaultDownloadPathSettingProps = {
  controller: SettingsController;
  t: SettingsT;
};

export function DefaultDownloadPathSetting({ controller, t }: DefaultDownloadPathSettingProps) {
  const { settings, updatePreferences } = controller;

  return (
    <SettingCard
      icon={<HardDrive size={18} className="text-indigo-400" />}
      title={t("general.defaultDownloadPath")}
      description={t("general.defaultDownloadPathDesc")}
      actions={
        <>
          <SettingsActionButton
            onClick={async () => {
              const dir = await fileService.selectDirectory({ access: "write" });
              if (!settings || !dir) return;
              await updatePreferences({ default_download_path: dir });
            }}
          >
            {t("general.chooseFolder")}
          </SettingsActionButton>
          <SettingsActionButton
            variant="quiet"
            onClick={async () => {
              if (!settings) return;
              await updatePreferences({ default_download_path: null });
            }}
          >
            {t("general.clearFolder")}
          </SettingsActionButton>
        </>
      }
    >
      <p className="text-xs text-slate-400 font-mono break-all">
        {settings?.default_download_path || t("general.defaultDownloadPathUnset")}
      </p>
    </SettingCard>
  );
}
