import { Plus, Settings } from "lucide-react";
import type { SettingsT } from "./settingsTypes";

type SettingsHeaderProps = {
  activeTab: "llm" | "general";
  onAddProvider: () => void;
  t: SettingsT;
};

export function SettingsHeader({ activeTab, onAddProvider, t }: SettingsHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-8">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
          <Settings className="text-indigo-500" size={28} />
          {t("title")}
        </h2>
        <p className="text-slate-500 text-sm mt-1 ml-10">{t("description")}</p>
      </div>

      {activeTab === "llm" && (
        <button
          onClick={onAddProvider}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
        >
          <Plus size={18} />
          <span>{t("addProvider")}</span>
        </button>
      )}
    </div>
  );
}
