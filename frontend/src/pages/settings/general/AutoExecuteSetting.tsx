import { MonitorPlay } from "lucide-react";
import type { SettingsController, SettingsT } from "../settingsTypes";
import { SettingCard } from "./SettingCard";

type AutoExecuteSettingProps = {
  controller: SettingsController;
  t: SettingsT;
};

export function AutoExecuteSetting({ controller, t }: AutoExecuteSettingProps) {
  const { settings, updateSettingsField } = controller;

  return (
    <SettingCard
      icon={<MonitorPlay size={18} className="text-indigo-400" />}
      title={t("general.autoExecute")}
      description={t("general.autoExecuteDesc")}
      actions={
        <button
          onClick={async () => {
            if (!settings) return;
            const newVal = !settings.auto_execute_flow;
            await updateSettingsField(
              { ...settings, auto_execute_flow: newVal },
              newVal ? t("general.autoExecuteEnabled") : t("general.autoExecuteDisabled"),
            );
          }}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#1a1a1a] ${
            settings?.auto_execute_flow ? "bg-indigo-600" : "bg-white/10"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings?.auto_execute_flow ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      }
    />
  );
}
