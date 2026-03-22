import { Book, Settings2, Plus, Trash2 } from 'lucide-react';
import type { GlossaryTerm } from '../../services/domain';
import { useState } from 'react';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
    glossary: GlossaryTerm[];
    onAddTerm: (source: string, target: string) => Promise<void>;
    onDeleteTerm: (id: string) => Promise<void>;
}

export const Sidebar = ({ isOpen, onClose, glossary, onAddTerm, onDeleteTerm }: SidebarProps) => {
    const [newTermSource, setNewTermSource] = useState("");
    const [newTermTarget, setNewTermTarget] = useState("");

    const handleAdd = async () => {
        if (!newTermSource || !newTermTarget) return;
        await onAddTerm(newTermSource, newTermTarget);
        setNewTermSource("");
        setNewTermTarget("");
    };

    if (!isOpen) return null;

    return (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-[#1a1a1a] border-l border-white/10 shadow-2xl flex flex-col z-50 animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                <h2 className="font-bold flex items-center gap-2 text-white">
                    <Book size={16} className="text-indigo-400"/> 
                    <span>Glossary</span>
                    <span className="text-xs font-normal text-slate-500 px-2 py-0.5 bg-white/5 rounded-full">{glossary.length}</span>
                </h2>
                <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-white/5 hover:text-white transition-colors">
                    <Settings2 size={16} />
                </button>
            </div>
            
            <div className="p-4 bg-white/[0.01] border-b border-white/5 space-y-3">
                <div className="flex gap-2">
                    <input 
                        className="w-1/2 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all font-medium"
                        placeholder="Source"
                        value={newTermSource}
                        onChange={e => setNewTermSource(e.target.value)}
                    />
                    <div className="flex items-center text-slate-600">➜</div>
                    <input 
                        className="w-1/2 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all font-medium" 
                        placeholder="Target"
                        value={newTermTarget}
                        onChange={e => setNewTermTarget(e.target.value)}
                    />
                </div>
                <button 
                    onClick={handleAdd}
                    className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-500 py-2 rounded-lg text-xs font-bold text-white transition-colors shadow-lg shadow-indigo-900/20"
                >
                    <Plus size={12} /> Add Term
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 scroll-smooth custom-scrollbar">
                {glossary.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-slate-600 gap-2">
                        <Book size={24} className="opacity-20" />
                        <p className="text-xs font-medium">No terms yet.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {glossary.map(term => (
                            <div key={term.id} className="group flex justify-between items-start bg-white/[0.02] p-3 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                                <div className="flex flex-col gap-1">
                                    <div className="text-xs font-bold text-indigo-300">{term.source}</div>
                                    <div className="text-[10px] text-slate-500 font-mono">➜ {term.target}</div>
                                </div>
                                <button 
                                    onClick={() => onDeleteTerm(term.id)}
                                    className="w-6 h-6 rounded flex items-center justify-center text-slate-600 hover:bg-rose-500/10 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
