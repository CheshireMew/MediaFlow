import { Globe } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "../../../i18n";
import type { SettingsController, SettingsT } from "../settingsTypes";
import { SettingCard } from "./SettingCard";

type LanguageSettingProps = {
  controller: SettingsController;
  t: SettingsT;
};

export function LanguageSetting({ controller, t }: LanguageSettingProps) {
  const { changeLanguage, settings } = controller;

  return (
    <SettingCard
      icon={<Globe size={18} className="text-indigo-400" />}
      title={t("general.language")}
      description={t("general.languageDesc")}
      actions={
        <select
          value={settings?.language || "zh"}
          onChange={(event) => void changeLanguage(event.target.value)}
          className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
      }
    />
  );
}
