import type { TFunction } from "i18next";
import { useGeneralSettingsActions } from "./useGeneralSettingsActions";
import { useLlmProviderSettings } from "./useLlmProviderSettings";
import { resolveSettingsTab, useSettingsData } from "./useSettingsData";

export { resolveSettingsTab };

export function useSettingsController(search: string, t: TFunction<"settings">) {
  const settingsData = useSettingsData(search, t);
  const providerSettings = useLlmProviderSettings({
    fetchSettings: settingsData.fetchSettings,
    settings: settingsData.settings,
    setSettings: settingsData.setSettings,
    showNotification: settingsData.showNotification,
    t,
  });
  const generalSettings = useGeneralSettingsActions({
    fetchSettings: settingsData.fetchSettings,
    settings: settingsData.settings,
    setSettings: settingsData.setSettings,
    showNotification: settingsData.showNotification,
    t,
    updateSettingsField: settingsData.updateSettingsField,
  });

  return {
    activeTab: settingsData.activeTab,
    applyProviderPreset: providerSettings.applyProviderPreset,
    changeLanguage: generalSettings.changeLanguage,
    deepSeekReasoningMode: providerSettings.deepSeekReasoningMode,
    editingProvider: providerSettings.editingProvider,
    fasterWhisperCliInstallProgress: generalSettings.fasterWhisperCliInstallProgress,
    formData: providerSettings.formData,
    handleBaseUrlChange: providerSettings.handleBaseUrlChange,
    handleDelete: providerSettings.handleDelete,
    handleInstallFasterWhisperCli: generalSettings.handleInstallFasterWhisperCli,
    handleModelChange: providerSettings.handleModelChange,
    handleSaveProvider: providerSettings.handleSaveProvider,
    handleSetActive: providerSettings.handleSetActive,
    handleTestConnection: providerSettings.handleTestConnection,
    handleUpdateYtDlp: generalSettings.handleUpdateYtDlp,
    isInstallingFasterWhisperCli: generalSettings.isInstallingFasterWhisperCli,
    isTestingConnection: providerSettings.isTestingConnection,
    isUpdatingYtDlp: generalSettings.isUpdatingYtDlp,
    notification: settingsData.notification,
    openAdd: providerSettings.openAdd,
    openEdit: providerSettings.openEdit,
    openModal: providerSettings.openModal,
    selectedProviderPreset: providerSettings.selectedProviderPreset,
    setActiveTab: settingsData.setActiveTab,
    setDeepSeekReasoning: providerSettings.setDeepSeekReasoning,
    setFormData: providerSettings.setFormData,
    setOpenModal: providerSettings.setOpenModal,
    setSettings: settingsData.setSettings,
    setSmartSplitTextLimitInput: settingsData.setSmartSplitTextLimitInput,
    settings: settingsData.settings,
    showNotification: settingsData.showNotification,
    smartSplitTextLimitInput: settingsData.smartSplitTextLimitInput,
    updateSettingsField: settingsData.updateSettingsField,
    ytDlpUpdateInfo: generalSettings.ytDlpUpdateInfo,
  };
}
