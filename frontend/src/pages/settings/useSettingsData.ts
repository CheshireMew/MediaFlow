import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import type { UserSettings } from "../../types/api";
import { settingsService } from "../../services/domain";
import {
  DEFAULT_SMART_SPLIT_TEXT_LIMIT,
  normalizeSmartSplitTextLimit,
} from "../../utils/subtitleSmartSplit";

export type SettingsTab = "llm" | "general";

export interface Notification {
  message: string;
  type: "success" | "error";
}

export type ShowSettingsNotification = (
  message: string,
  type?: Notification["type"],
) => void;

export function resolveSettingsTab(search: string): SettingsTab {
  const tab = new URLSearchParams(search).get("tab");
  return tab === "general" ? "general" : "llm";
}

export function useSettingsData(search: string, t: TFunction<"settings">) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => resolveSettingsTab(search));
  const [smartSplitTextLimitInput, setSmartSplitTextLimitInput] = useState(
    String(DEFAULT_SMART_SPLIT_TEXT_LIMIT),
  );

  const showNotification: ShowSettingsNotification = (message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const updateSettingsField = async (nextSettings: UserSettings, successMessage?: string) => {
    try {
      const res = await settingsService.updateSettings(nextSettings);
      setSettings(res);
      showNotification(successMessage || t("general.updateSuccess"));
      return res;
    } catch {
      showNotification(t("general.updateFailed"), "error");
      return null;
    }
  };

  const fetchSettings = async () => {
    try {
      const data = await settingsService.getSettings();
      setSettings(data);
    } catch (error) {
      console.error("Failed to load settings:", error);
      showNotification(t("loadFailed"), "error");
    }
  };

  useEffect(() => {
    let cancelled = false;
    settingsService
      .getSettings()
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load settings:", error);
        showNotification(t("loadFailed"), "error");
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    setActiveTab(resolveSettingsTab(search));
  }, [search]);

  useEffect(() => {
    if (!settings) return;
    setSmartSplitTextLimitInput(String(normalizeSmartSplitTextLimit(settings.smart_split_text_limit)));
  }, [settings]);

  return {
    activeTab,
    fetchSettings,
    notification,
    setActiveTab,
    setSettings,
    setSmartSplitTextLimitInput,
    settings,
    showNotification,
    smartSplitTextLimitInput,
    updateSettingsField,
  };
}
