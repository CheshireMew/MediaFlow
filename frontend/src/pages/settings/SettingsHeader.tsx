import { Plus, Settings } from "lucide-react";
import { PageHeader, ToolbarButton } from "../../components/ui/PageChrome";
import type { SettingsT } from "./settingsTypes";
import type { SettingsTab } from "./settingsTabModel";

type SettingsHeaderProps = {
  activeTab: SettingsTab;
  onAddProvider: () => void;
  t: SettingsT;
};

export function SettingsHeader({ activeTab, onAddProvider, t }: SettingsHeaderProps) {
  return (
    <PageHeader
      icon={Settings}
      title={t("title")}
      subtitle={t("description")}
      actions={activeTab === "llm" && (
        <ToolbarButton
          onClick={onAddProvider}
          icon={Plus}
          variant="primary"
        >
          <span>{t("addProvider")}</span>
        </ToolbarButton>
      )}
    />
  );
}
