import { MicOff } from "lucide-react";

import type { SettingsController, SettingsT } from "../settingsTypes";
import { BooleanPreferenceSetting } from "./BooleanPreferenceSetting";

type AutoTrimSilenceSettingProps = {
  controller: SettingsController;
  t: SettingsT;
};

export function AutoTrimSilenceSetting({
  controller,
  t,
}: AutoTrimSilenceSettingProps) {
  return (
    <BooleanPreferenceSetting
      controller={controller}
      preferenceKey="auto_trim_silence"
      icon={<MicOff size={18} className="text-indigo-400" />}
      title={t("general.autoTrimSilence")}
      description={t("general.autoTrimSilenceDesc")}
      enabledMessage={t("general.autoTrimSilenceEnabled")}
      disabledMessage={t("general.autoTrimSilenceDisabled")}
    />
  );
}
