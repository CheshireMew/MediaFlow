import type { SettingsController, SettingsT } from "./settingsTypes";
import { AutoExecuteSetting } from "./general/AutoExecuteSetting";
import { DefaultDownloadPathSetting } from "./general/DefaultDownloadPathSetting";
import { FasterWhisperCliSetting } from "./general/FasterWhisperCliSetting";
import { LanguageSetting } from "./general/LanguageSetting";
import { SmartSplitLimitSetting } from "./general/SmartSplitLimitSetting";
import { YtDlpSetting } from "./general/YtDlpSetting";

type GeneralSettingsPanelProps = {
  controller: SettingsController;
  t: SettingsT;
};

export function GeneralSettingsPanel({ controller, t }: GeneralSettingsPanelProps) {
  return (
    <div className="p-8">
      <h3 className="text-lg font-medium text-slate-200 mb-6">{t("general.title")}</h3>

      <div className="space-y-6 max-w-2xl">
        <LanguageSetting controller={controller} t={t} />
        <AutoExecuteSetting controller={controller} t={t} />
        <SmartSplitLimitSetting controller={controller} t={t} />
        <DefaultDownloadPathSetting controller={controller} t={t} />
        <FasterWhisperCliSetting controller={controller} t={t} />
        <YtDlpSetting controller={controller} t={t} />
      </div>
    </div>
  );
}
