import React from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { fileService } from "../services/fileService";
import { Plus, Edit2, Trash2, CheckCircle, Settings, Cpu, HardDrive, Shield, MonitorPlay, Globe, Scissors, Wrench, Download } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "../i18n";
import {
    DEFAULT_SMART_SPLIT_TEXT_LIMIT,
    normalizeSmartSplitTextLimit,
} from "../utils/subtitleSmartSplit";
import { useSettingsController } from "./settings/useSettingsController";
import { ProviderModal } from "./settings/ProviderModal";
import { SettingsNotification } from "./settings/SettingsNotification";

const SettingsPage: React.FC = () => {
    const { t } = useTranslation('settings');
    const { t: tc } = useTranslation('common');
    const location = useLocation();
    const controller = useSettingsController(location.search, t);
    const {
        activeTab,
        changeLanguage,
        fasterWhisperCliInstallProgress,
        handleDelete,
        handleInstallFasterWhisperCli,
        handleSetActive,
        handleUpdateYtDlp,
        isInstallingFasterWhisperCli,
        isUpdatingYtDlp,
        notification,
        openAdd,
        openEdit,
        openModal,
        setActiveTab,
        setSettings,
        setSmartSplitTextLimitInput,
        settings,
        showNotification,
        smartSplitTextLimitInput,
        updateSettingsField,
        ytDlpUpdateInfo,
    } = controller;

    return (
        <div className="h-full w-full bg-[#0a0a0a] text-slate-200 overflow-y-auto overflow-x-hidden relative p-8 fade-in">
            {/* Context Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                        <Settings className="text-indigo-500" size={28} />
                        {t("title")}
                    </h2>
                    <p className="text-slate-500 text-sm mt-1 ml-10">{t("description")}</p>
                </div>
                
                {activeTab === 'llm' && (
                    <button 
                        onClick={openAdd}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                    >
                        <Plus size={18} /> 
                        <span>{t("addProvider")}</span>
                    </button>
                )}
            </div>

            {/* Config Card */}
            <div className="bg-[#161616] rounded-2xl border border-white/5 overflow-hidden shadow-xl ring-1 ring-white/5 mx-auto max-w-5xl">
                {/* Tabs */}
                <div className="flex border-b border-white/5 bg-white/[0.02]">
                    <button 
                        onClick={() => setActiveTab('llm')}
                        className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'llm' 
                            ? 'border-indigo-500 text-white bg-white/[0.02]' 
                            : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.01]'}`}
                    >
                        <Cpu size={18} className={activeTab === 'llm' ? 'text-indigo-400' : ''} />
                        {t("tabs.llm")}
                    </button>
                    <button 
                        onClick={() => setActiveTab('general')}
                        className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'general' 
                            ? 'border-indigo-500 text-white bg-white/[0.02]' 
                            : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.01]'}`}
                    >
                        <HardDrive size={18} className={activeTab === 'general' ? 'text-indigo-400' : ''} />
                        {t("tabs.general")}
                    </button>
                </div>
                
                {/* Content Area */}
                <div className="p-0 min-h-[400px]">
                    {activeTab === 'llm' ? (
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
                                    <div key={provider.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-white/[0.02] transition-colors group">
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
                    ) : (
                        <div className="p-8">
                            <h3 className="text-lg font-medium text-slate-200 mb-6">{t("general.title")}</h3>

                            <div className="space-y-6 max-w-2xl">
                                {/* Language Selector */}
                                <div className="bg-[#1a1a1a] p-6 rounded-xl border border-white/5 flex items-start justify-between group hover:border-white/10 transition-colors">
                                    <div className="space-y-1">
                                        <h4 className="text-base font-medium text-white flex items-center gap-2">
                                            <Globe size={18} className="text-indigo-400" />
                                            {t("general.language")}
                                        </h4>
                                        <p className="text-sm text-slate-500">
                                            {t("general.languageDesc")}
                                        </p>
                                    </div>
                                    <select
                                        value={settings?.language || 'zh'}
                                        onChange={(e) => void changeLanguage(e.target.value)}
                                        className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer"
                                    >
                                        {SUPPORTED_LANGUAGES.map(lang => (
                                            <option key={lang.code} value={lang.code}>{lang.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Auto-Execute Flow Toggle */}
                                <div className="bg-[#1a1a1a] p-6 rounded-xl border border-white/5 flex items-start justify-between group hover:border-white/10 transition-colors">
                                    <div className="space-y-1">
                                        <h4 className="text-base font-medium text-white flex items-center gap-2">
                                            <MonitorPlay size={18} className="text-indigo-400" />
                                            {t("general.autoExecute")}
                                        </h4>
                                        <p className="text-sm text-slate-500">
                                            {t("general.autoExecuteDesc")}
                                        </p>
                                    </div>
                                    <button 
                                        onClick={async () => {
                                            if (!settings) return;
                                            const newVal = !settings.auto_execute_flow;
                                            await updateSettingsField(
                                                { ...settings, auto_execute_flow: newVal },
                                                newVal ? t("general.autoExecuteEnabled") : t("general.autoExecuteDisabled"),
                                            );
                                        }}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#1a1a1a] ${
                                            settings?.auto_execute_flow ? 'bg-indigo-600' : 'bg-white/10'
                                        }`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                            settings?.auto_execute_flow ? 'translate-x-6' : 'translate-x-1'
                                        }`} />
                                    </button>
                                </div>

                                <div className="bg-[#1a1a1a] p-6 rounded-xl border border-white/5 flex items-start justify-between group hover:border-white/10 transition-colors gap-6">
                                    <div className="space-y-1 min-w-0 flex-1">
                                        <h4 className="text-base font-medium text-white flex items-center gap-2">
                                            <Scissors size={18} className="text-indigo-400" />
                                            {t("general.smartSplitTextLimit")}
                                        </h4>
                                        <p className="text-sm text-slate-500">
                                            {t("general.smartSplitTextLimitDesc")}
                                        </p>
                                        <div className="mt-3 flex items-center gap-3">
                                            <input
                                                type="number"
                                                min={1}
                                                step={1}
                                                value={smartSplitTextLimitInput}
                                                onChange={(e) => setSmartSplitTextLimitInput(e.target.value)}
                                                placeholder={String(DEFAULT_SMART_SPLIT_TEXT_LIMIT)}
                                                className="w-32 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                                            />
                                            <span className="text-sm text-slate-400">
                                                {t("general.smartSplitTextLimitUnit")}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 self-end">
                                        <button
                                            onClick={async () => {
                                                if (!settings) return;
                                                const nextValue = Number.parseInt(smartSplitTextLimitInput, 10);
                                                if (!Number.isFinite(nextValue) || nextValue < 1) {
                                                    showNotification(t("general.smartSplitTextLimitInvalid"), "error");
                                                    return;
                                                }
                                                await updateSettingsField({
                                                    ...settings,
                                                    smart_split_text_limit: normalizeSmartSplitTextLimit(nextValue),
                                                });
                                            }}
                                            className="px-3 py-2 rounded-lg text-sm font-medium bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 transition-colors"
                                        >
                                            {t("general.savePath")}
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!settings) return;
                                                setSmartSplitTextLimitInput(String(DEFAULT_SMART_SPLIT_TEXT_LIMIT));
                                                await updateSettingsField({
                                                    ...settings,
                                                    smart_split_text_limit: DEFAULT_SMART_SPLIT_TEXT_LIMIT,
                                                });
                                            }}
                                            className="px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                                        >
                                            {t("general.restoreDefault")}
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-[#1a1a1a] p-6 rounded-xl border border-white/5 flex items-start justify-between group hover:border-white/10 transition-colors gap-6">
                                    <div className="space-y-1 min-w-0">
                                        <h4 className="text-base font-medium text-white flex items-center gap-2">
                                            <HardDrive size={18} className="text-indigo-400" />
                                            {t("general.defaultDownloadPath")}
                                        </h4>
                                        <p className="text-sm text-slate-500">
                                            {t("general.defaultDownloadPathDesc")}
                                        </p>
                                        <p className="text-xs text-slate-400 font-mono break-all">
                                            {settings?.default_download_path || t("general.defaultDownloadPathUnset")}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={async () => {
                                                const dir = await fileService.selectDirectory();
                                                if (!settings || !dir) return;
                                                await updateSettingsField({
                                                    ...settings,
                                                    default_download_path: dir,
                                                });
                                            }}
                                            className="px-3 py-2 rounded-lg text-sm font-medium bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 transition-colors"
                                        >
                                            {t("general.chooseFolder")}
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!settings) return;
                                                await updateSettingsField({
                                                    ...settings,
                                                    default_download_path: null,
                                                });
                                            }}
                                            className="px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                                        >
                                            {t("general.clearFolder")}
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-[#1a1a1a] p-6 rounded-xl border border-white/5 flex items-start justify-between group hover:border-white/10 transition-colors gap-6">
                                    <div className="space-y-1 min-w-0 flex-1">
                                        <h4 className="text-base font-medium text-white flex items-center gap-2">
                                            <Cpu size={18} className="text-indigo-400" />
                                            {t("general.cliPath")}
                                        </h4>
                                        <p className="text-sm text-slate-500">
                                            {t("general.cliPathDesc")}
                                        </p>
                                        <input
                                            value={settings?.faster_whisper_cli_path || ""}
                                            onChange={(e) => {
                                                if (!settings) return;
                                                setSettings({
                                                    ...settings,
                                                    faster_whisper_cli_path: e.target.value,
                                                });
                                            }}
                                            placeholder={t("general.cliPathPlaceholder")}
                                            className="mt-3 w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                                        />
                                        {fasterWhisperCliInstallProgress && (
                                            <div className="mt-3 space-y-2">
                                                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                                                    <div
                                                        className="h-full bg-indigo-400 transition-all"
                                                        style={{
                                                            width: `${Math.max(0, Math.min(100, fasterWhisperCliInstallProgress.progress))}%`,
                                                        }}
                                                    />
                                                </div>
                                                <p className="text-xs text-slate-400">
                                                    {Math.round(fasterWhisperCliInstallProgress.progress)}% · {fasterWhisperCliInstallProgress.message}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 self-end">
                                        <button
                                            onClick={handleInstallFasterWhisperCli}
                                            disabled={isInstallingFasterWhisperCli}
                                            className="px-3 py-2 rounded-lg text-sm font-medium bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25 border border-indigo-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                        >
                                            <Download size={14} />
                                            {isInstallingFasterWhisperCli && fasterWhisperCliInstallProgress
                                                ? `${Math.round(fasterWhisperCliInstallProgress.progress)}%`
                                                : t("general.cliInstall")}
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!settings) return;
                                                const selected = await fileService.openFile({
                                                    profile: "executable",
                                                });
                                                if (!selected?.path) return;
                                                const nextSettings = {
                                                    ...settings,
                                                    faster_whisper_cli_path: selected.path,
                                                };
                                                setSettings(nextSettings);
                                                await updateSettingsField(nextSettings);
                                            }}
                                            className="px-3 py-2 rounded-lg text-sm font-medium bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 transition-colors"
                                        >
                                            {t("general.chooseFile")}
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!settings) return;
                                                await updateSettingsField({
                                                    ...settings,
                                                    faster_whisper_cli_path: settings.faster_whisper_cli_path?.trim() || null,
                                                });
                                            }}
                                            className="px-3 py-2 rounded-lg text-sm font-medium bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 transition-colors"
                                        >
                                            {t("general.savePath")}
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!settings) return;
                                                await updateSettingsField({
                                                    ...settings,
                                                    faster_whisper_cli_path: null,
                                                });
                                            }}
                                            className="px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                                        >
                                            {t("general.clearFolder")}
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-[#1a1a1a] p-6 rounded-xl border border-white/5 flex items-start justify-between group hover:border-white/10 transition-colors gap-6">
                                    <div className="space-y-1 min-w-0">
                                        <h4 className="text-base font-medium text-white flex items-center gap-2">
                                            <Wrench size={18} className="text-indigo-400" />
                                            {t("general.ytDlpTitle")}
                                        </h4>
                                        <p className="text-sm text-slate-500">
                                            {t("general.ytDlpDesc")}
                                        </p>
                                        {ytDlpUpdateInfo && (
                                            <p className="text-xs text-slate-400 font-mono break-all">
                                                {t("general.ytDlpVersionInfo", {
                                                    previous: ytDlpUpdateInfo.previous_version || "unknown",
                                                    current: ytDlpUpdateInfo.current_version || "unknown",
                                                })}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleUpdateYtDlp}
                                        disabled={isUpdatingYtDlp}
                                        className="px-3 py-2 rounded-lg text-sm font-medium bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                    >
                                        {isUpdatingYtDlp ? t("general.ytDlpUpdating") : t("general.ytDlpUpdate")}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {openModal && (
                <ProviderModal
                    controller={controller}
                    t={t}
                    cancelLabel={tc("cancel")}
                />
            )}

            {notification && <SettingsNotification notification={notification} />}
        </div>
    );
};

export default SettingsPage;
