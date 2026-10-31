import { CheckCircle, Edit2, Shield, Trash2 } from "lucide-react";
import type { CommonT, SettingsController, SettingsT } from "./settingsTypes";

type LlmProvidersPanelProps = {
  controller: SettingsController;
  t: SettingsT;
  tc: CommonT;
};

export function LlmProvidersPanel({ controller, t, tc }: LlmProvidersPanelProps) {
  const { handleDelete, handleSetActive, openEdit, settings } = controller;
  const providers = settings?.llm_providers ?? [];

  return (
    <div className="w-full overflow-x-auto">
      <table aria-label={t("tabs.llm")} className="w-full min-w-[620px] table-fixed border-collapse text-left text-sm">
        <colgroup>
          <col className="w-[17%]" />
          <col className="w-[23%]" />
          <col className="w-[22%]" />
          <col className="w-[24%]" />
          <col className="w-[14%]" />
        </colgroup>
        <thead className="border-b border-[var(--border-subtle)] text-xs font-medium text-slate-400">
          <tr>
            <th scope="col" className="px-4 py-3">{t("llm.status")}</th>
            <th scope="col" className="px-3 py-3">{t("llm.name")}</th>
            <th scope="col" className="px-3 py-3">{t("llm.model")}</th>
            <th scope="col" className="px-3 py-3">{t("llm.baseUrl")}</th>
            <th scope="col" className="px-4 py-3 text-right">{t("llm.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((provider) => (
            <tr key={provider.id} className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.02] focus-within:bg-white/[0.02]">
              <td className="px-4 py-4 align-top">
                {provider.is_active ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
                    <CheckCircle size={12} className="shrink-0" /> {tc("active")}
                  </span>
                ) : (
                  <button type="button" onClick={() => handleSetActive(provider.id)} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white">
                    {tc("setActive")}
                  </button>
                )}
              </td>
              <td className="px-3 py-4 align-top font-medium text-slate-200 [overflow-wrap:anywhere]">{provider.name}</td>
              <td className="px-3 py-4 align-top font-mono text-xs leading-6 text-indigo-200 [overflow-wrap:anywhere]">{provider.model}</td>
              <td className="px-3 py-4 align-top">
                <span className="block truncate font-mono text-xs leading-6 text-slate-400" title={provider.base_url}>{provider.base_url}</span>
              </td>
              <td className="px-3 py-4 align-top">
                <div className="flex justify-end gap-1">
                  <button type="button" aria-label={tc("edit")} onClick={() => openEdit(provider)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/10 hover:text-white" title={tc("edit")}>
                    <Edit2 size={16} />
                  </button>
                  <button type="button" aria-label={tc("delete")} onClick={() => handleDelete(provider.id)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300" title={tc("delete")}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {providers.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-slate-400">
          <Shield size={36} className="text-slate-400" />
          <p className="text-sm">{t("llm.noProviders")}</p>
        </div>
      )}
    </div>
  );
}
