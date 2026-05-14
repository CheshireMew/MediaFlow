import React from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { CudaReadinessPanel } from "./settings/CudaReadinessPanel";
import { GeneralSettingsPanel } from "./settings/GeneralSettingsPanel";
import { LlmProvidersPanel } from "./settings/LlmProvidersPanel";
import { ProviderModal } from "./settings/ProviderModal";
import { SettingsHeader } from "./settings/SettingsHeader";
import { SettingsNotification } from "./settings/SettingsNotification";
import { SettingsTabs } from "./settings/SettingsTabs";
import { useSettingsController } from "./settings/useSettingsController";
import { PageContent, PageShell, WorkPanel } from "../components/ui/PageChrome";

const SettingsPage: React.FC = () => {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const location = useLocation();
  const controller = useSettingsController(location.search, t);
  const { activeTab, notification, openAdd, openModal, setActiveTab } = controller;

  return (
    <PageShell padded={false} className="relative fade-in flex flex-col">
      <SettingsHeader activeTab={activeTab} onAddProvider={openAdd} t={t} />

      <PageContent scroll>
      <WorkPanel className="w-full bg-[#161616] ring-1 ring-white/5">
        <SettingsTabs activeTab={activeTab} onChange={setActiveTab} t={t} />

        <div className="p-0 min-h-[400px]">
          {activeTab === "general" ? (
            <GeneralSettingsPanel controller={controller} t={t} />
          ) : activeTab === "llm" ? (
            <LlmProvidersPanel controller={controller} t={t} tc={tc} />
          ) : (
            <CudaReadinessPanel controller={controller} t={t} />
          )}
        </div>
      </WorkPanel>

      {openModal && (
        <ProviderModal controller={controller} t={t} cancelLabel={tc("cancel")} />
      )}

      {notification && <SettingsNotification notification={notification} />}
      </PageContent>
    </PageShell>
  );
};

export default SettingsPage;
