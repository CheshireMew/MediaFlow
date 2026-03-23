import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import type { LLMProvider, UserSettings, ToolUpdateResponse } from "../types/api";
import { settingsService } from "../services/domain";
import { fileService } from "../services/fileService";
import { Plus, Edit2, Trash2, CheckCircle, X, AlertCircle, Settings, Cpu, HardDrive, Shield, MonitorPlay, Globe, Wrench } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "../i18n";

const PROVIDER_PRESETS = [
    {
        key: "openai",
        name: "OpenAI",
        base_url: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
    },
    {
        key: "deepseek",
        name: "DeepSeek",
        base_url: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
    },
    {
        key: "openrouter",
        name: "OpenRouter",
        base_url: "https://openrouter.ai/api/v1",
        model: "openai/gpt-4o-mini",
    },
    {
        key: "custom",
        name: "",
        base_url: "",
        model: "",
    },
] as const;

const TRANSLATION_LANGUAGES = [
    { value: "Chinese", labelKey: "languages.chinese" },
    { value: "English", labelKey: "languages.english" },
    { value: "Japanese", labelKey: "languages.japanese" },
    { value: "Spanish", labelKey: "languages.spanish" },
    { value: "French", labelKey: "languages.french" },
    { value: "German", labelKey: "languages.german" },
    { value: "Russian", labelKey: "languages.russian" },
] as const;

const TRANSCRIPTION_MODELS = [
    { value: "tiny", label: "tiny" },
    { value: "base", label: "base" },
    { value: "small", label: "small" },
    { value: "medium", label: "medium" },
    { value: "large-v1", label: "large-v1" },
    { value: "large-v2", label: "large-v2" },
    { value: "large-v3", label: "large-v3" },
    { value: "large-v3-turbo", label: "large-v3-turbo" },
] as const;

interface Notification {
    message: string;
    type: "success" | "error";
}

const SettingsPage: React.FC = () => {
    const { t } = useTranslation('settings');
    const { t: tc } = useTranslation('common');
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [openModal, setOpenModal] = useState(false);
    const [notification, setNotification] = useState<Notification | null>(null);
    const [activeTab, setActiveTab] = useState<'llm' | 'general'>('llm');
    const [isTestingConnection, setIsTestingConnection] = useState(false);
    const [isUpdatingYtDlp, setIsUpdatingYtDlp] = useState(false);
    const [ytDlpUpdateInfo, setYtDlpUpdateInfo] = useState<ToolUpdateResponse | null>(null);
    const [selectedProviderPreset, setSelectedProviderPreset] = useState<(typeof PROVIDER_PRESETS)[number]["key"]>("openai");
    
    // Form State
    const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null);
    const [formData, setFormData] = useState<Partial<LLMProvider>>({
        name: "", base_url: "https://api.openai.com/v1", api_key: "", model: "gpt-3.5-turbo"
    });

    const showNotification = (message: string, type: "success" | "error" = "success") => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const updateSettingsField = async (nextSettings: UserSettings, successMessage?: string) => {
        try {
            const res = await settingsService.updateSettings(nextSettings);
            setSettings(res);
            showNotification(successMessage || t("general.updateSuccess"));
            return res;
        } catch {
            showNotification(t("general.updateFailed"), "error");
            return null;
        }
    };

    const fetchSettings = async () => {
        try {
            const data = await settingsService.getSettings();
            setSettings(data);
        } catch (error) {
            console.error("Failed to load settings:", error);
            showNotification(t("loadFailed"), "error");
        }
    };

    useEffect(() => {
        let cancelled = false;
        settingsService.getSettings()
            .then((data) => {
                if (!cancelled) setSettings(data);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error("Failed to load settings:", error);
                showNotification(t("loadFailed"), "error");
            });
        return () => {
            cancelled = true;
        };
    }, [t]);

    const handleSaveProvider = async () => {
        if (!settings) return;
        
        const newProviders = [...settings.llm_providers];
        
        if (editingProvider) {
            // Edit existing
            const index = newProviders.findIndex(p => p.id === editingProvider.id);
            if (index !== -1) {
                newProviders[index] = { ...editingProvider, ...formData } as LLMProvider;
            }
        } else {
            // Add new
            const newId = `custom_${Date.now()}`;
            newProviders.push({ 
                id: newId, 
                is_active: false,
                ...formData 
            } as LLMProvider);
        }

        try {
            const res = await settingsService.updateSettings({ ...settings, llm_providers: newProviders });
            setSettings(res);
            setOpenModal(false);
            showNotification(t("llm.providerSaved"));
        } catch (error) {
            showNotification(t("llm.saveFailed"), "error");
            console.error(error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!settings) return;
        const provider = settings.llm_providers.find(p => p.id === id);
        if (!provider) return;

        const remainingProviders = settings.llm_providers.filter(p => p.id !== id);
        const nextProvider = remainingProviders[0];
        const confirmMessage = provider.is_active
            ? (nextProvider
                ? t("llm.confirmDeleteActiveWithFallback", { name: nextProvider.name })
                : t("llm.confirmDeleteActiveWithoutFallback"))
            : t("llm.confirmDelete");

        if (!confirm(confirmMessage)) return;
        
        const newProviders = remainingProviders;
        try {
            const res = await settingsService.updateSettings({ ...settings, llm_providers: newProviders });
            setSettings(res);
            if (provider.is_active) {
                showNotification(
                    nextProvider
                        ? t("llm.activeProviderDeletedFallback", { name: nextProvider.name })
                        : t("llm.activeProviderDeletedEmpty"),
                );
            } else {
                showNotification(t("llm.providerDeleted"));
            }
        } catch {
            showNotification(t("llm.deleteFailed"), "error");
        }
    };
    
    const handleSetActive = async (id: string) => {
        try {
            await settingsService.setActiveProvider(id);
            await fetchSettings(); // Reload to see update
            showNotification(t("llm.activeUpdated"));
        } catch {
            showNotification(t("llm.activeFailed"), "error");
        }
    };

    const detectProviderPreset = (provider?: Partial<LLMProvider> | null) => {
        if (!provider?.base_url) return "custom" as const;
        const matched = PROVIDER_PRESETS.find(
            (preset) => preset.key !== "custom" && preset.base_url === provider.base_url,
        );
        return matched?.key || "custom";
    };

    const applyProviderPreset = (
        presetKey: (typeof PROVIDER_PRESETS)[number]["key"],
        current?: Partial<LLMProvider>,
    ) => {
        const preset = PROVIDER_PRESETS.find((item) => item.key === presetKey);
        if (!preset) return;

        setSelectedProviderPreset(presetKey);
        setFormData((prev) => ({
            ...prev,
            ...current,
            name:
                preset.key === "custom"
                    ? current?.name ?? prev.name ?? ""
                    : preset.name,
            base_url: preset.base_url,
            model: preset.model,
            api_key: current?.api_key ?? prev.api_key ?? "",
        }));
    };

    const openAdd = () => {
        setEditingProvider(null);
        setSelectedProviderPreset("openai");
        setFormData({
            name: "OpenAI",
            base_url: "https://api.openai.com/v1",
            api_key: "",
            model: "gpt-4o-mini",
        });
        setOpenModal(true);
    };

    const openEdit = (provider: LLMProvider) => {
        setEditingProvider(provider);
        setSelectedProviderPreset(detectProviderPreset(provider));
        setFormData(provider);
        setOpenModal(true);
    };

    const handleTestConnection = async () => {
        const base_url = formData.base_url?.trim() || "";
        const api_key = formData.api_key?.trim() || "";
        const model = formData.model?.trim() || "";
        const name = formData.name?.trim();

        if (!base_url || !api_key || !model) {
            showNotification(t("llm.testMissingFields"), "error");
            return;
        }

        setIsTestingConnection(true);
        try {
            const res = await settingsService.testProviderConnection({
                name,
                base_url,
                api_key,
                model,
            });
            showNotification(res.message || t("llm.testSucceeded"));
        } catch (error) {
            const message = error instanceof Error ? error.message : t("llm.testFailed");
            showNotification(message, "error");
        } finally {
            setIsTestingConnection(false);
        }
    };

    const handleUpdateYtDlp = async () => {
        setIsUpdatingYtDlp(true);
        try {
            const result = await settingsService.updateYtDlp();
            setYtDlpUpdateInfo(result);
            showNotification(t("general.ytDlpUpdateSuccess"));
        } catch (error) {
            const message = error instanceof Error ? error.message : t("general.ytDlpUpdateFailed");
            showNotification(message, "error");
        } finally {
            setIsUpdatingYtDlp(false);
        }
    };

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
                                        onChange={async (e) => {
                                            if (!settings) return;
                                            const lang = e.target.value;
                                            const res = await updateSettingsField({ ...settings, language: lang });
                                            if (res) {
                                                i18n.changeLanguage(lang);
                                            }
                                        }}
                                        className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer"
                                    >
                                        {SUPPORTED_LANGUAGES.map(lang => (
                                            <option key={lang.code} value={lang.code}>{lang.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="bg-[#1a1a1a] p-6 rounded-xl border border-white/5 flex items-start justify-between group hover:border-white/10 transition-colors">
                                    <div className="space-y-1">
                                        <h4 className="text-base font-medium text-white flex items-center gap-2">
                                            <MonitorPlay size={18} className="text-indigo-400" />
                                            {t("general.translationTargetLanguage")}
                                        </h4>
                                        <p className="text-sm text-slate-500">
                                            {t("general.translationTargetLanguageDesc")}
                                        </p>
                                    </div>
                                    <select
                                        value={settings?.translation_target_language || 'Chinese'}
                                        onChange={async (e) => {
                                            if (!settings) return;
                                            const targetLanguage = e.target.value;
                                            await updateSettingsField({
                                                ...settings,
                                                translation_target_language: targetLanguage,
                                            });
                                        }}
                                        className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer"
                                    >
                                        {TRANSLATION_LANGUAGES.map((lang) => (
                                            <option key={lang.value} value={lang.value}>
                                                {t(lang.labelKey)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="bg-[#1a1a1a] p-6 rounded-xl border border-white/5 flex items-start justify-between group hover:border-white/10 transition-colors">
                                    <div className="space-y-1">
                                        <h4 className="text-base font-medium text-white flex items-center gap-2">
                                            <Cpu size={18} className="text-indigo-400" />
                                            {t("general.transcriptionModel")}
                                        </h4>
                                        <p className="text-sm text-slate-500">
                                            {t("general.transcriptionModelDesc")}
                                        </p>
                                    </div>
                                    <select
                                        value={settings?.transcription_model || 'base'}
                                        onChange={async (e) => {
                                            if (!settings) return;
                                            const transcriptionModel = e.target.value;
                                            await updateSettingsField({
                                                ...settings,
                                                transcription_model: transcriptionModel,
                                            });
                                        }}
                                        className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer"
                                    >
                                        {TRANSCRIPTION_MODELS.map((model) => (
                                            <option key={model.value} value={model.value}>
                                                {model.label}
                                            </option>
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
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 self-end">
                                        <button
                                            onClick={async () => {
                                                const input = document.createElement("input");
                                                input.type = "file";
                                                input.accept = ".exe";
                                                input.onchange = async (event) => {
                                                    const target = event.target as HTMLInputElement;
                                                    const selected = target.files?.[0];
                                                    if (!selected || !settings) return;
                                                    const filePath = fileService.getPathForFile(selected);
                                                    if (!filePath) return;
                                                    const nextSettings = {
                                                        ...settings,
                                                        faster_whisper_cli_path: filePath,
                                                    };
                                                    setSettings(nextSettings);
                                                    await updateSettingsField(nextSettings);
                                                };
                                                input.click();
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

            {/* Modal Overlay */}
            {openModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-white/5 animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                            <h3 className="text-lg font-bold text-white">
                                {editingProvider ? t("llm.editProvider") : t("addProvider")}
                            </h3>
                            <button onClick={() => setOpenModal(false)} className="text-slate-500 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t("llm.providerPreset")}</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {PROVIDER_PRESETS.map((preset) => (
                                        <button
                                            key={preset.key}
                                            type="button"
                                            onClick={() => applyProviderPreset(preset.key, editingProvider ?? formData)}
                                            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                                                selectedProviderPreset === preset.key
                                                    ? "border-indigo-500/50 bg-indigo-500/10 text-white"
                                                    : "border-white/10 bg-black/20 text-slate-300 hover:border-white/20 hover:bg-white/5"
                                            }`}
                                        >
                                            <div className="text-sm font-medium">
                                                {t(`llm.presets.${preset.key}`)}
                                            </div>
                                            <div className="mt-1 text-[10px] text-slate-500">
                                                {preset.key === "custom"
                                                    ? t("llm.presetCustomDesc")
                                                    : preset.model}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t("llm.displayName")}</label>
                                <input 
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all placeholder-slate-600"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    placeholder="e.g. My DeepSeek"
                                />
                            </div>
                            
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t("llm.baseUrl")}</label>
                                <input 
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all font-mono placeholder-slate-600"
                                    value={formData.base_url}
                                    onChange={(e) => setFormData({...formData, base_url: e.target.value})}
                                    placeholder="https://api.openai.com/v1"
                                />
                            </div>
                            
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t("llm.apiKey")}</label>
                                <input 
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all font-mono placeholder-slate-600"
                                    type="password"
                                    value={formData.api_key}
                                    onChange={(e) => setFormData({...formData, api_key: e.target.value})}
                                    placeholder="sk-..."
                                />
                            </div>
                            
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">{t("llm.modelName")}</label>
                                <input 
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all font-mono placeholder-slate-600"
                                    value={formData.model}
                                    onChange={(e) => setFormData({...formData, model: e.target.value})}
                                    placeholder="e.g. gpt-4o, deepseek-chat"
                                />
                            </div>
                        </div>
                        
                        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5 flex justify-end gap-3">
                            <button 
                                onClick={() => setOpenModal(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                            >
                                {tc("cancel")}
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
                    </div>
                </div>
            )}

            {/* Notifications */}
            {notification && (
                <div 
                    className={`fixed bottom-6 right-6 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl z-50 animate-in slide-in-from-bottom-5 duration-300 ${
                        notification.type === 'error' 
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}
                >
                    {notification.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                    <span className="font-medium text-sm">{notification.message}</span>
                </div>
            )}
        </div>
    );
};

export default SettingsPage;
