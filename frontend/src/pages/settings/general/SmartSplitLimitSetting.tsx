import { Scissors } from "lucide-react";
import {
  DEFAULT_SMART_SPLIT_TEXT_LIMIT,
  normalizeSmartSplitTextLimit,
} from "../../../utils/subtitleSmartSplit";
import type { SettingsController, SettingsT } from "../settingsTypes";
import { SettingCard } from "./SettingCard";
import { SettingsActionButton } from "./SettingsActionButton";

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
    updatePreferences,
  } = controller;

  return (
    <SettingCard
      icon={<Scissors size={18} className="text-indigo-400" />}
      title={t("general.smartSplitTextLimit")}
      description={t("general.smartSplitTextLimitDesc")}
      contentClassName="flex-1"
      actions={
        <>
          <SettingsActionButton
            onClick={async () => {
              if (!settings) return;
              const nextValue = Number.parseInt(smartSplitTextLimitInput, 10);
              if (!Number.isFinite(nextValue) || nextValue < 1) {
                showNotification(t("general.smartSplitTextLimitInvalid"), "error");
                return;
              }
              await updatePreferences({
                smart_split_text_limit: normalizeSmartSplitTextLimit(nextValue),
              });
            }}
          >
            {t("general.saveSmartSplitLimit")}
          </SettingsActionButton>
          <SettingsActionButton
            variant="quiet"
            onClick={async () => {
              if (!settings) return;
              setSmartSplitTextLimitInput(String(DEFAULT_SMART_SPLIT_TEXT_LIMIT));
              await updatePreferences({
                smart_split_text_limit: DEFAULT_SMART_SPLIT_TEXT_LIMIT,
              });
            }}
          >
            {t("general.restoreDefault")}
          </SettingsActionButton>
        </>
      }
    >
      <div className="mt-3 flex items-center gap-3">
        <input
          aria-label={t("general.smartSplitTextLimit")}
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
