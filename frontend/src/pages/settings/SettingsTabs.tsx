import { Cpu, HardDrive } from "lucide-react";
import type { SettingsT } from "./settingsTypes";

type SettingsTabsProps = {
  activeTab: "llm" | "general";
  onChange: (tab: "llm" | "general") => void;
  t: SettingsT;
};

export function SettingsTabs({ activeTab, onChange, t }: SettingsTabsProps) {
  const tabClass = (tab: "llm" | "general") =>
    `flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 ${
      activeTab === tab
        ? "border-indigo-500 text-white bg-white/[0.02]"
        : "border-transparent text-slate-400 hover:text-white hover:bg-white/[0.01]"
    }`;

  return (
    <div className="flex border-b border-white/5 bg-white/[0.02]">
      <button onClick={() => onChange("llm")} className={tabClass("llm")}>
        <Cpu size={18} className={activeTab === "llm" ? "text-indigo-400" : ""} />
        {t("tabs.llm")}
      </button>
      <button onClick={() => onChange("general")} className={tabClass("general")}>
        <HardDrive size={18} className={activeTab === "general" ? "text-indigo-400" : ""} />
        {t("tabs.general")}
      </button>
    </div>
  );
}
