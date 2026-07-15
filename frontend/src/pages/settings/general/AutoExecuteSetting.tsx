import { MonitorPlay } from "lucide-react";
import type { SettingsController, SettingsT } from "../settingsTypes";
import { BooleanPreferenceSetting } from "./BooleanPreferenceSetting";

type AutoExecuteSettingProps = {
  controller: SettingsController;
  t: SettingsT;
};

export function AutoExecuteSetting({ controller, t }: AutoExecuteSettingProps) {
  return (
    <BooleanPreferenceSetting
      controller={controller}
      preferenceKey="auto_execute_flow"
      icon={<MonitorPlay size={18} className="text-indigo-400" />}
      title={t("general.autoExecute")}
      description={t("general.autoExecuteDesc")}
      enabledMessage={t("general.autoExecuteEnabled")}
      disabledMessage={t("general.autoExecuteDisabled")}
    />
  );
}
