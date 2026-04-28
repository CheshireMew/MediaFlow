import React from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { GeneralSettingsPanel } from "./settings/GeneralSettingsPanel";
import { LlmProvidersPanel } from "./settings/LlmProvidersPanel";
import { ProviderModal } from "./settings/ProviderModal";
import { SettingsHeader } from "./settings/SettingsHeader";
import { SettingsNotification } from "./settings/SettingsNotification";
import { SettingsTabs } from "./settings/SettingsTabs";
import { useSettingsController } from "./settings/useSettingsController";

const SettingsPage: React.FC = () => {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const location = useLocation();
  const controller = useSettingsController(location.search, t);
  const { activeTab, notification, openAdd, openModal, setActiveTab } = controller;

  return (
    <div className="h-full w-full bg-[#0a0a0a] text-slate-200 overflow-y-auto overflow-x-hidden relative p-8 fade-in">
      <SettingsHeader activeTab={activeTab} onAddProvider={openAdd} t={t} />

      <div className="bg-[#161616] rounded-2xl border border-white/5 overflow-hidden shadow-xl ring-1 ring-white/5 mx-auto max-w-5xl">
        <SettingsTabs activeTab={activeTab} onChange={setActiveTab} t={t} />

        <div className="p-0 min-h-[400px]">
          {activeTab === "llm" ? (
            <LlmProvidersPanel controller={controller} t={t} tc={tc} />
          ) : (
            <GeneralSettingsPanel controller={controller} t={t} />
          )}
        </div>
      </div>

      {openModal && (
        <ProviderModal controller={controller} t={t} cancelLabel={tc("cancel")} />
      )}

      {notification && <SettingsNotification notification={notification} />}
    </div>
  );
};

export default SettingsPage;
