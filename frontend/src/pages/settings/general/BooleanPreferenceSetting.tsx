import type { ReactNode } from "react";

import type { SettingsController } from "../settingsTypes";
import { SettingCard } from "./SettingCard";

type BooleanPreferenceKey = "auto_execute_flow" | "auto_trim_silence";

type BooleanPreferenceSettingProps = {
  controller: SettingsController;
  preferenceKey: BooleanPreferenceKey;
  icon: ReactNode;
  title: string;
  description: string;
  enabledMessage: string;
  disabledMessage: string;
};

export function BooleanPreferenceSetting({
  controller,
  preferenceKey,
  icon,
  title,
  description,
  enabledMessage,
  disabledMessage,
}: BooleanPreferenceSettingProps) {
  const { settings, updatePreferences } = controller;
  const enabled = settings?.[preferenceKey] ?? false;

  return (
    <SettingCard
      icon={icon}
      title={title}
      description={description}
      actions={
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={title}
          onClick={async () => {
            if (!settings) return;
            const nextValue = !enabled;
            const patch = preferenceKey === "auto_execute_flow"
              ? { auto_execute_flow: nextValue }
              : { auto_trim_silence: nextValue };
            await updatePreferences(
              patch,
              nextValue ? enabledMessage : disabledMessage,
            );
          }}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#1a1a1a] ${
            enabled ? "bg-indigo-600" : "bg-white/10"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      }
    />
  );
}
