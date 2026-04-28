import { Scissors } from "lucide-react";
import {
  DEFAULT_SMART_SPLIT_TEXT_LIMIT,
  normalizeSmartSplitTextLimit,
} from "../../../utils/subtitleSmartSplit";
import type { SettingsController, SettingsT } from "../settingsTypes";
import { SettingCard } from "./SettingCard";

type SmartSplitLimitSettingProps = {
  controller: SettingsController;
  t: SettingsT;
};

export function SmartSplitLimitSetting({ controller, t }: SmartSplitLimitSettingProps) {
  const {
    setSmartSplitTextLimitInput,
    settings,
    showNotification,
    smartSplitTextLimitInput,
    updateSettingsField,
  } = controller;

  return (
    <SettingCard
      icon={<Scissors size={18} className="text-indigo-400" />}
      title={t("general.smartSplitTextLimit")}
      description={t("general.smartSplitTextLimitDesc")}
      contentClassName="flex-1"
      actions={
        <>
          <button
            onClick={async () => {
              if (!settings) return;
              const nextValue = Number.parseInt(smartSplitTextLimitInput, 10);
              if (!Number.isFinite(nextValue) || nextValue < 1) {
                showNotification(t("general.smartSplitTextLimitInvalid"), "error");
                return;
              }
              await updateSettingsField({
                ...settings,
                smart_split_text_limit: normalizeSmartSplitTextLimit(nextValue),
              });
            }}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 transition-colors"
          >
            {t("general.savePath")}
          </button>
          <button
            onClick={async () => {
              if (!settings) return;
              setSmartSplitTextLimitInput(String(DEFAULT_SMART_SPLIT_TEXT_LIMIT));
              await updateSettingsField({
                ...settings,
                smart_split_text_limit: DEFAULT_SMART_SPLIT_TEXT_LIMIT,
              });
            }}
            className="px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            {t("general.restoreDefault")}
          </button>
        </>
      }
    >
      <div className="mt-3 flex items-center gap-3">
        <input
          type="number"
          min={1}
          step={1}
          value={smartSplitTextLimitInput}
          onChange={(event) => setSmartSplitTextLimitInput(event.target.value)}
          placeholder={String(DEFAULT_SMART_SPLIT_TEXT_LIMIT)}
          className="w-32 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
        />
        <span className="text-sm text-slate-400">{t("general.smartSplitTextLimitUnit")}</span>
      </div>
    </SettingCard>
  );
}
