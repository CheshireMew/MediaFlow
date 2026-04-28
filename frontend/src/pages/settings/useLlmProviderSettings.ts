import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { LLMProvider, UserSettings } from "../../types/api";
import { settingsService } from "../../services/domain";
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
import type { ShowSettingsNotification } from "./useSettingsData";

type UseLlmProviderSettingsArgs = {
  fetchSettings: () => Promise<void>;
  settings: UserSettings | null;
  setSettings: Dispatch<SetStateAction<UserSettings | null>>;
  showNotification: ShowSettingsNotification;
  t: TFunction<"settings">;
};

export function useLlmProviderSettings({
  fetchSettings,
  settings,
  setSettings,
  showNotification,
  t,
}: UseLlmProviderSettingsArgs) {
  const [openModal, setOpenModal] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [selectedProviderPreset, setSelectedProviderPreset] = useState<LLMProviderPresetKey>(
    DEFAULT_LLM_PROVIDER_PRESET_KEY,
  );
  const [deepSeekReasoningMode, setDeepSeekReasoningMode] = useState(false);
  const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null);
  const [formData, setFormData] = useState<Partial<LLMProvider>>({
    name: "DeepSeek",
    base_url: "https://api.deepseek.com/v1",
    api_key: "",
    model: "deepseek-chat",
  });

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

  return {
    applyProviderPreset,
    deepSeekReasoningMode,
    editingProvider,
    formData,
    handleBaseUrlChange,
    handleDelete,
    handleModelChange,
    handleSaveProvider,
    handleSetActive,
    handleTestConnection,
    isTestingConnection,
    openAdd,
    openEdit,
    openModal,
    selectedProviderPreset,
    setDeepSeekReasoning,
    setFormData,
    setOpenModal,
  };
}
