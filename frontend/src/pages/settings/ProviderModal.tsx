import { useId } from "react";
import { X } from "lucide-react";
import {
  CUSTOM_LLM_PROVIDER_PRESET_KEY,
  LLM_PROVIDER_PRESETS,
} from "../../config/llmProviderPresets";
import type { SettingsController, SettingsT } from "./settingsTypes";
import { Dialog } from "../../components/ui/Dialog";

type ProviderModalProps = {
  controller: SettingsController;
  t: SettingsT;
  cancelLabel: string;
};

export function ProviderModal({ controller, t, cancelLabel }: ProviderModalProps) {
  const titleId = useId();
  const reasoningLabelId = useId();
  const displayNameId = useId();
  const baseUrlId = useId();
  const apiKeyId = useId();
  const modelNameId = useId();
  const {
    applyProviderPreset,
    deepSeekReasoningMode,
    editingProvider,
    formData,
    handleBaseUrlChange,
    handleModelChange,
    handleSaveProvider,
    handleTestConnection,
    isTestingConnection,
    selectedProviderPreset,
    setDeepSeekReasoning,
    setFormData,
    setOpenModal,
  } = controller;

  return (
    <Dialog
      open
      onClose={() => setOpenModal(false)}
      ariaLabelledBy={titleId}
      overlayClassName="z-50 bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      className="bg-[#1a1a1a] rounded-lg border border-white/10 shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-white/5 animate-in zoom-in-95 duration-200"
    >
        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
          <h2 id={titleId} className="text-lg font-bold text-white">
            {editingProvider ? t("llm.editProvider") : t("addProvider")}
          </h2>
          <button
            type="button"
            aria-label={cancelLabel}
            onClick={() => setOpenModal(false)}
            className="text-slate-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t("llm.providerPreset")}</label>
            <div className="grid grid-cols-2 gap-2">
              {LLM_PROVIDER_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyProviderPreset(preset.key)}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    selectedProviderPreset === preset.key
                      ? "border-indigo-500/50 bg-indigo-500/10 text-white"
                      : "border-white/10 bg-black/20 text-slate-300 hover:border-white/20 hover:bg-white/5"
                  }`}
                >
                  <div className="text-sm font-medium">
                    {t(`llm.presets.${preset.key}`)}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {preset.key === CUSTOM_LLM_PROVIDER_PRESET_KEY
                      ? t("llm.presetCustomDesc")
                      : preset.defaultModel}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedProviderPreset === "deepseek" && (
            <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <div>
                <div id={reasoningLabelId} className="text-sm font-medium text-slate-200">{t("llm.reasoningMode")}</div>
                <div className="text-xs text-slate-400">
                  {deepSeekReasoningMode ? "deepseek-reasoner" : "deepseek-chat"}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={deepSeekReasoningMode}
                aria-labelledby={reasoningLabelId}
                onClick={() => setDeepSeekReasoning(!deepSeekReasoningMode)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  deepSeekReasoningMode ? "bg-indigo-500" : "bg-white/10"
                }`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                    deepSeekReasoningMode ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor={displayNameId} className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t("llm.displayName")}</label>
            <input
              id={displayNameId}
              data-dialog-initial-focus
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all placeholder-slate-400"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t("llm.displayNamePlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={baseUrlId} className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t("llm.baseUrl")}</label>
            <input
              id={baseUrlId}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all font-mono placeholder-slate-400"
              value={formData.base_url}
              onChange={(e) => handleBaseUrlChange(e.target.value)}
              placeholder={t("llm.baseUrlPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={apiKeyId} className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t("llm.apiKey")}</label>
            <input
              id={apiKeyId}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all font-mono placeholder-slate-400"
              type="password"
              value={formData.api_key}
              onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
              placeholder={t("llm.apiKeyPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor={modelNameId} className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t("llm.modelName")}</label>
            <input
              id={modelNameId}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all font-mono placeholder-slate-400"
              value={formData.model}
              onChange={(e) => handleModelChange(e.target.value)}
              placeholder={t("llm.modelNamePlaceholder")}
            />
          </div>
        </div>

        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5 flex justify-end gap-3">
          <button
            onClick={() => setOpenModal(false)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleTestConnection}
            disabled={isTestingConnection}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-200 bg-white/5 hover:bg-white/10 disabled:opacity-50 transition-colors"
          >
            {isTestingConnection ? t("llm.testingConnection") : t("llm.testConnection")}
          </button>
          <button
            onClick={handleSaveProvider}
            className="px-6 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
          >
            {t("llm.saveChanges")}
          </button>
        </div>
    </Dialog>
  );
}
