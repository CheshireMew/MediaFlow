import { CheckCircle, Edit2, Shield, Trash2 } from "lucide-react";
import type { CommonT, SettingsController, SettingsT } from "./settingsTypes";

type LlmProvidersPanelProps = {
  controller: SettingsController;
  t: SettingsT;
  tc: CommonT;
};

export function LlmProvidersPanel({ controller, t, tc }: LlmProvidersPanelProps) {
  const { handleDelete, handleSetActive, openEdit, settings } = controller;

  return (
    <div className="w-full">
      <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-[#1a1a1a] border-b border-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
        <div className="col-span-2">{t("llm.status")}</div>
        <div className="col-span-3">{t("llm.name")}</div>
        <div className="col-span-3">{t("llm.model")}</div>
        <div className="col-span-3">{t("llm.baseUrl")}</div>
        <div className="col-span-1 text-right">{t("llm.actions")}</div>
      </div>

      <div className="divide-y divide-white/5">
        {settings?.llm_providers.map((provider) => (
          <div
            key={provider.id}
            className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-white/[0.02] transition-colors group"
          >
            <div className="col-span-2">
              {provider.is_active ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                  <CheckCircle size={12} /> {tc("active")}
                </span>
              ) : (
                <button
                  onClick={() => handleSetActive(provider.id)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all"
                >
                  {tc("setActive")}
                </button>
              )}
            </div>
            <div className="col-span-3 font-medium text-slate-200">{provider.name}</div>
            <div className="col-span-3 font-mono text-xs text-indigo-300/80 bg-indigo-500/5 px-2 py-1 rounded w-fit border border-indigo-500/10">
              {provider.model}
            </div>
            <div className="col-span-3 text-xs text-slate-500 truncate font-mono" title={provider.base_url}>
              {provider.base_url}
            </div>
            <div className="col-span-1 flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => openEdit(provider)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                title="Edit"
              >
                <Edit2 size={16} />
              </button>
              <button
                onClick={() => handleDelete(provider.id)}
                className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

        {(!settings?.llm_providers || settings.llm_providers.length === 0) && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Shield size={48} className="opacity-20 mb-4" />
            <p className="text-sm">{t("llm.noProviders")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
