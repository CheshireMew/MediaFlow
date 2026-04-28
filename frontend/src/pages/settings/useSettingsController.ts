import { useEffect, useState } from "react";
import i18n from "i18next";
import type { TFunction } from "i18next";
import type { LLMProvider, UserSettings, ToolUpdateResponse } from "../../types/api";
import { settingsService } from "../../services/domain";
import { getDesktopApi } from "../../services/desktop/bridge";
import {
  CUSTOM_LLM_PROVIDER_PRESET_KEY,
  DEFAULT_LLM_PROVIDER_PRESET_KEY,
  LLM_PROVIDER_PRESETS,
  detectLlmProviderPreset,
  getLlmProviderPreset,
  isDeepSeekReasoningModel,
  resolveLlmProviderModel,
  supportsReasoningMode,
  type LLMProviderPresetKey,
} from "../../config/llmProviderPresets";
import {
  DEFAULT_SMART_SPLIT_TEXT_LIMIT,
  normalizeSmartSplitTextLimit,
} from "../../utils/subtitleSmartSplit";

export interface Notification {
  message: string;
  type: "success" | "error";
}

export function resolveSettingsTab(search: string): "llm" | "general" {
  const tab = new URLSearchParams(search).get("tab");
  return tab === "general" ? "general" : "llm";
}

export function useSettingsController(search: string, t: TFunction<"settings">) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);
  const [activeTab, setActiveTab] = useState<"llm" | "general">(() => resolveSettingsTab(search));
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isUpdatingYtDlp, setIsUpdatingYtDlp] = useState(false);
  const [isInstallingFasterWhisperCli, setIsInstallingFasterWhisperCli] = useState(false);
  const [fasterWhisperCliInstallProgress, setFasterWhisperCliInstallProgress] = useState<{
    progress: number;
    message: string;
  } | null>(null);
  const [ytDlpUpdateInfo, setYtDlpUpdateInfo] = useState<ToolUpdateResponse | null>(null);
  const [selectedProviderPreset, setSelectedProviderPreset] = useState<LLMProviderPresetKey>(DEFAULT_LLM_PROVIDER_PRESET_KEY);
  const [deepSeekReasoningMode, setDeepSeekReasoningMode] = useState(false);
  const [smartSplitTextLimitInput, setSmartSplitTextLimitInput] = useState(String(DEFAULT_SMART_SPLIT_TEXT_LIMIT));
  const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null);
  const [formData, setFormData] = useState<Partial<LLMProvider>>({
    name: "DeepSeek",
    base_url: "https://api.deepseek.com/v1",
    api_key: "",
    model: "deepseek-chat",
  });

  const showNotification = (message: string, type: "success" | "error" = "success") => {
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

  useEffect(() => {
    const unsubscribe = getDesktopApi()?.onDesktopSettingsProgress?.((payload) => {
      setFasterWhisperCliInstallProgress(payload);
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  const handleSaveProvider = async () => {
    if (!settings) return;

    const preset = getLlmProviderPreset(selectedProviderPreset);
    const normalizedProvider = {
      name: formData.name?.trim() || preset.label,
      base_url: formData.base_url?.trim() || "",
      api_key: formData.api_key?.trim() || "",
      model: formData.model?.trim() || "",
    };

    if (!normalizedProvider.base_url || !normalizedProvider.api_key || !normalizedProvider.model) {
      showNotification(t("llm.testMissingFields"), "error");
      return;
    }

    const newProviders = [...settings.llm_providers];
    if (editingProvider) {
      const index = newProviders.findIndex((provider) => provider.id === editingProvider.id);
      if (index !== -1) {
        newProviders[index] = { ...editingProvider, ...normalizedProvider } as LLMProvider;
      }
    } else {
      newProviders.push({
        id: `custom_${Date.now()}`,
        is_active: false,
        ...normalizedProvider,
      } as LLMProvider);
    }

    try {
      const res = await settingsService.updateSettings({ ...settings, llm_providers: newProviders });
      setSettings(res);
      setOpenModal(false);
      showNotification(t("llm.providerSaved"));
    } catch (error) {
      showNotification(t("llm.saveFailed"), "error");
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!settings) return;
    const provider = settings.llm_providers.find((item) => item.id === id);
    if (!provider) return;

    const remainingProviders = settings.llm_providers.filter((item) => item.id !== id);
    const nextProvider = remainingProviders[0];
    const confirmMessage = provider.is_active
      ? nextProvider
        ? t("llm.confirmDeleteActiveWithFallback", { name: nextProvider.name })
        : t("llm.confirmDeleteActiveWithoutFallback")
      : t("llm.confirmDelete");

    if (!confirm(confirmMessage)) return;

    try {
      const res = await settingsService.updateSettings({ ...settings, llm_providers: remainingProviders });
      setSettings(res);
      if (provider.is_active) {
        showNotification(
          nextProvider
            ? t("llm.activeProviderDeletedFallback", { name: nextProvider.name })
            : t("llm.activeProviderDeletedEmpty"),
        );
      } else {
        showNotification(t("llm.providerDeleted"));
      }
    } catch {
      showNotification(t("llm.deleteFailed"), "error");
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      await settingsService.setActiveProvider(id);
      await fetchSettings();
      showNotification(t("llm.activeUpdated"));
    } catch {
      showNotification(t("llm.activeFailed"), "error");
    }
  };

  const applyProviderPreset = (presetKey: LLMProviderPresetKey, reasoningMode = false) => {
    const preset = getLlmProviderPreset(presetKey);
    const nextReasoningMode = supportsReasoningMode(presetKey) && reasoningMode;

    setSelectedProviderPreset(presetKey);
    setDeepSeekReasoningMode(nextReasoningMode);
    setFormData((prev) => ({
      ...prev,
      name:
        preset.key === CUSTOM_LLM_PROVIDER_PRESET_KEY
          ? prev.name?.trim() && !LLM_PROVIDER_PRESETS.some((item) => item.label === prev.name?.trim())
            ? prev.name
            : preset.label
          : preset.label,
      base_url: preset.baseUrl,
      model: resolveLlmProviderModel(presetKey, nextReasoningMode),
    }));
  };

  const setDeepSeekReasoning = (enabled: boolean) => {
    setDeepSeekReasoningMode(enabled);
    setFormData((prev) => ({
      ...prev,
      model: resolveLlmProviderModel("deepseek", enabled),
    }));
  };

  const handleBaseUrlChange = (base_url: string) => {
    const nextPreset = detectLlmProviderPreset(base_url);
    setSelectedProviderPreset(nextPreset);
    if (nextPreset === "deepseek") {
      setDeepSeekReasoningMode(isDeepSeekReasoningModel(formData.model));
    } else if (!supportsReasoningMode(nextPreset)) {
      setDeepSeekReasoningMode(false);
    }
    setFormData((prev) => ({ ...prev, base_url }));
  };

  const handleModelChange = (model: string) => {
    setFormData((prev) => ({ ...prev, model }));
    if (selectedProviderPreset === "deepseek") {
      setDeepSeekReasoningMode(isDeepSeekReasoningModel(model));
    }
  };

  const openAdd = () => {
    const preset = getLlmProviderPreset(DEFAULT_LLM_PROVIDER_PRESET_KEY);
    setEditingProvider(null);
    setSelectedProviderPreset(DEFAULT_LLM_PROVIDER_PRESET_KEY);
    setDeepSeekReasoningMode(false);
    setFormData({
      name: preset.label,
      base_url: preset.baseUrl,
      api_key: "",
      model: preset.defaultModel,
    });
    setOpenModal(true);
  };

  const openEdit = (provider: LLMProvider) => {
    const presetKey = detectLlmProviderPreset(provider.base_url);
    setEditingProvider(provider);
    setSelectedProviderPreset(presetKey);
    setDeepSeekReasoningMode(presetKey === "deepseek" && isDeepSeekReasoningModel(provider.model));
    setFormData(provider);
    setOpenModal(true);
  };

  const handleTestConnection = async () => {
    const base_url = formData.base_url?.trim() || "";
    const api_key = formData.api_key?.trim() || "";
    const model = formData.model?.trim() || "";
    const name = formData.name?.trim();

    if (!base_url || !api_key || !model) {
      showNotification(t("llm.testMissingFields"), "error");
      return;
    }

    setIsTestingConnection(true);
    try {
      const res = await settingsService.testProviderConnection({
        name,
        base_url,
        api_key,
        model,
      });
      showNotification(res.message || t("llm.testSucceeded"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("llm.testFailed");
      showNotification(message, "error");
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleUpdateYtDlp = async () => {
    setIsUpdatingYtDlp(true);
    try {
      const result = await settingsService.updateYtDlp();
      setYtDlpUpdateInfo(result);
      showNotification(t("general.ytDlpUpdateSuccess"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("general.ytDlpUpdateFailed");
      showNotification(message, "error");
    } finally {
      setIsUpdatingYtDlp(false);
    }
  };

  const handleInstallFasterWhisperCli = async () => {
    setIsInstallingFasterWhisperCli(true);
    setFasterWhisperCliInstallProgress({
      progress: 0,
      message: t("general.cliInstalling"),
    });
    try {
      const result = await settingsService.installFasterWhisperCli();
      setSettings((current) =>
        current
          ? {
              ...current,
              faster_whisper_cli_path: result.cli_path,
            }
          : current,
      );
      await fetchSettings();
      showNotification(t("general.cliInstallSuccess"));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("general.cliInstallFailed");
      showNotification(message, "error");
    } finally {
      setIsInstallingFasterWhisperCli(false);
      setTimeout(() => setFasterWhisperCliInstallProgress(null), 3000);
    }
  };

  const changeLanguage = async (language: string) => {
    if (!settings) return;
    const res = await updateSettingsField({ ...settings, language });
    if (res) {
      i18n.changeLanguage(language);
    }
  };

  return {
    activeTab,
    applyProviderPreset,
    changeLanguage,
    deepSeekReasoningMode,
    editingProvider,
    fasterWhisperCliInstallProgress,
    formData,
    handleBaseUrlChange,
    handleDelete,
    handleInstallFasterWhisperCli,
    handleModelChange,
    handleSaveProvider,
    handleSetActive,
    handleTestConnection,
    handleUpdateYtDlp,
    isInstallingFasterWhisperCli,
    isTestingConnection,
    isUpdatingYtDlp,
    notification,
    openAdd,
    openEdit,
    openModal,
    selectedProviderPreset,
    setActiveTab,
    setDeepSeekReasoning,
    setFormData,
    setOpenModal,
    setSettings,
    setSmartSplitTextLimitInput,
    settings,
    showNotification,
    smartSplitTextLimitInput,
    updateSettingsField,
    ytDlpUpdateInfo,
  };
}
