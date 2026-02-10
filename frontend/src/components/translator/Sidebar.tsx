import { Book, Settings2, Plus, Trash2 } from 'lucide-react';
import type { GlossaryTerm } from '../../services/translator/translatorService';
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
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col z-20 animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
                <h2 className="font-bold flex items-center gap-2">
                    <Book size={16} className="text-indigo-500"/> Glossary
                </h2>
                <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
                    <Settings2 size={16} />
                </button>
            </div>
            
            <div className="p-4 bg-slate-800/50 border-b border-slate-800 space-y-2">
                <div className="flex gap-2">
                    <input 
                        className="w-1/2 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 outline-none" 
                        placeholder="Source"
                        value={newTermSource}
                        onChange={e => setNewTermSource(e.target.value)}
                    />
                    <input 
                        className="w-1/2 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 outline-none" 
                        placeholder="Target"
                        value={newTermTarget}
                        onChange={e => setNewTermTarget(e.target.value)}
                    />
                </div>
                <button 
                    onClick={handleAdd}
                    className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-500 py-1 rounded text-xs font-bold transition-colors"
                >
                    <Plus size={12} /> Add Term
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
                {glossary.length === 0 ? (
                    <p className="text-center text-slate-600 text-xs mt-10">No terms yet.</p>
                ) : (
                    <div className="space-y-2">
                        {glossary.map(term => (
                            <div key={term.id} className="group flex justify-between items-start bg-slate-800 p-2 rounded border border-transparent hover:border-slate-700">
                                <div>
                                    <div className="text-xs font-bold text-indigo-300">{term.source}</div>
                                    <div className="text-xs text-slate-300">➜ {term.target}</div>
                                </div>
                                <button 
                                    onClick={() => onDeleteTerm(term.id)}
                                    className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
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
