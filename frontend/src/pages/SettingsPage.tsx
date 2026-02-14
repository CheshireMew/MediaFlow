
import React, { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { Plus, Edit2, Trash2, CheckCircle, X, AlertCircle, Settings, Cpu, HardDrive, Shield, MonitorPlay } from "lucide-react";

interface LLMProvider {
    id: string;
    name: string;
    base_url: string;
    api_key: string;
    model: string;
    is_active: boolean;
}

interface UserSettings {
    llm_providers: LLMProvider[];
    language: string;
    auto_execute_flow: boolean;
    default_download_path: string | null;
}

interface Notification {
    message: string;
    type: "success" | "error";
}

const SettingsPage: React.FC = () => {
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [openModal, setOpenModal] = useState(false);
    const [notification, setNotification] = useState<Notification | null>(null);
    const [activeTab, setActiveTab] = useState<'llm' | 'general'>('llm');
    
    // Form State
    const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null);
    const [formData, setFormData] = useState<Partial<LLMProvider>>({
        name: "", base_url: "https://api.openai.com/v1", api_key: "", model: "gpt-3.5-turbo"
    });

    useEffect(() => {
        fetchSettings();
    }, []);

    const showNotification = (message: string, type: "success" | "error" = "success") => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const fetchSettings = async () => {
        try {
            const data = await apiClient.getSettings();
            setSettings(data);
        } catch (error) {
            console.error("Failed to load settings:", error);
            showNotification("Failed to load settings", "error");
        }
    };

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
            const res = await apiClient.updateSettings({ ...settings, llm_providers: newProviders });
            setSettings(res);
            setOpenModal(false);
            showNotification("Provider saved");
        } catch (error) {
            showNotification("Failed to save", "error");
            console.error(error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!settings) return;
        if (!confirm("Are you sure?")) return;
        
        const newProviders = settings.llm_providers.filter(p => p.id !== id);
        try {
            const res = await apiClient.updateSettings({ ...settings, llm_providers: newProviders });
            setSettings(res);
            showNotification("Deleted");
        } catch (error) {
            showNotification("Failed to delete", "error");
        }
    };
    
    const handleSetActive = async (id: string) => {
        try {
            await apiClient.setActiveProvider(id);
            await fetchSettings(); // Reload to see update
            showNotification("Active provider updated");
        } catch (error) {
            showNotification("Failed to set active", "error");
        }
    };

    const openAdd = () => {
        setEditingProvider(null);
        setFormData({ name: "New Provider", base_url: "https://api.openai.com/v1", api_key: "", model: "gpt-4o" });
        setOpenModal(true);
    };

    const openEdit = (provider: LLMProvider) => {
        setEditingProvider(provider);
        setFormData(provider);
        setOpenModal(true);
    };

    return (
        <div className="h-full w-full bg-[#0a0a0a] text-slate-200 overflow-y-auto overflow-x-hidden relative p-8 fade-in">
            {/* Context Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                        <Settings className="text-indigo-500" size={28} />
                        Settings
                    </h2>
                    <p className="text-slate-500 text-sm mt-1 ml-10">Manage application configuration and integrations</p>
                </div>
                
                {activeTab === 'llm' && (
                    <button 
                        onClick={openAdd}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                    >
                        <Plus size={18} /> 
                        <span>Add Provider</span>
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
                        LLM Providers
                    </button>
                    <button 
                        onClick={() => setActiveTab('general')}
                        className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'general' 
                            ? 'border-indigo-500 text-white bg-white/[0.02]' 
                            : 'border-transparent text-slate-400 hover:text-white hover:bg-white/[0.01]'}`}
                    >
                        <HardDrive size={18} className={activeTab === 'general' ? 'text-indigo-400' : ''} />
                        General & Storage
                    </button>
                </div>
                
                {/* Content Area */}
                <div className="p-0 min-h-[400px]">
                    {activeTab === 'llm' ? (
                        <div className="w-full">
                            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-[#1a1a1a] border-b border-white/5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                <div className="col-span-2">Status</div>
                                <div className="col-span-3">Name</div>
                                <div className="col-span-3">Model</div>
                                <div className="col-span-3">Base URL</div>
                                <div className="col-span-1 text-right">Actions</div>
                            </div>
                            
                            <div className="divide-y divide-white/5">
                                {settings?.llm_providers.map((provider) => (
                                    <div key={provider.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-white/[0.02] transition-colors group">
                                        <div className="col-span-2">
                                            {provider.is_active ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                                                    <CheckCircle size={12} /> Active
                                                </span>
                                            ) : (
                                                <button 
                                                    onClick={() => handleSetActive(provider.id)}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all"
                                                >
                                                    Set Active
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
                                        <p className="text-sm">No providers configured</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="p-8">
                            <h3 className="text-lg font-medium text-slate-200 mb-6">General Settings</h3>
                            
                            <div className="space-y-6 max-w-2xl">
                                {/* Auto-Execute Flow Toggle */}
                                <div className="bg-[#1a1a1a] p-6 rounded-xl border border-white/5 flex items-start justify-between group hover:border-white/10 transition-colors">
                                    <div className="space-y-1">
                                        <h4 className="text-base font-medium text-white flex items-center gap-2">
                                            <MonitorPlay size={18} className="text-indigo-400" />
                                            Auto-Execute Flow
                                        </h4>
                                        <p className="text-sm text-slate-500">
                                            Automatically trigger subsequent steps after a task completes (Download → Transcribe → Translate → Synthesize).
                                        </p>
                                    </div>
                                    <button 
                                        onClick={async () => {
                                            if (!settings) return;
                                            const newVal = !settings.auto_execute_flow;
                                            try {
                                                const res = await apiClient.updateSettings({ ...settings, auto_execute_flow: newVal });
                                                setSettings(res);
                                                showNotification(newVal ? "Auto-Execute Enabled" : "Auto-Execute Disabled");
                                            } catch (e) {
                                                showNotification("Failed to update settings", "error");
                                            }
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
                                {editingProvider ? "Edit Provider" : "Add Provider"}
                            </h3>
                            <button onClick={() => setOpenModal(false)} className="text-slate-500 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Display Name</label>
                                <input 
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all placeholder-slate-600"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    placeholder="e.g. My DeepSeek"
                                />
                            </div>
                            
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Base URL</label>
                                <input 
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all font-mono placeholder-slate-600"
                                    value={formData.base_url}
                                    onChange={(e) => setFormData({...formData, base_url: e.target.value})}
                                    placeholder="https://api.openai.com/v1"
                                />
                            </div>
                            
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">API Key</label>
                                <input 
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all font-mono placeholder-slate-600"
                                    type="password"
                                    value={formData.api_key}
                                    onChange={(e) => setFormData({...formData, api_key: e.target.value})}
                                    placeholder="sk-..."
                                />
                            </div>
                            
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Model Name</label>
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
                                Cancel
                            </button>
                            <button 
                                onClick={handleSaveProvider}
                                className="px-6 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                            >
                                Save Changes
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
