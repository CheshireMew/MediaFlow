
import { Clapperboard, Save, Wand2 } from "lucide-react";
import React from "react";

interface EditorHeaderProps {
    autoScroll: boolean;
    setAutoScroll: (enabled: boolean) => void;
    onOpenFile: () => void;
    onSave: () => void;
    onSmartSplit: () => Promise<void>;
}

export function EditorHeader({
    autoScroll,
    setAutoScroll,
    onOpenFile,
    onSave,
    onSmartSplit
}: EditorHeaderProps) {
    return (
        <header className="h-14 border-b border-slate-700 flex items-center justify-between pl-4 pr-40 bg-slate-900 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
            <div className="flex items-center gap-3 no-drag" style={{ WebkitAppRegion: 'no-drag' } as any}>
                <Clapperboard className="text-indigo-500" />
                <h1 className="font-bold text-lg">Editor Workspace</h1>
                <div className="h-4 w-[1px] bg-slate-700 mx-2"></div>
                <button onClick={onOpenFile} className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1.5 rounded transition-colors">
                    Open Media
                </button>
            </div>
            <div className="flex items-center gap-2 no-drag" style={{ WebkitAppRegion: 'no-drag' } as any}>
                 <div className="flex items-center gap-2 mr-4">
                    <input 
                        type="checkbox" 
                        id="autoScroll" 
                        checked={autoScroll} 
                        onChange={(e) => setAutoScroll(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="autoScroll" className="text-xs text-slate-400 select-none cursor-pointer">Auto-Scroll</label>
                 </div>
                 
                 <button 
                    onClick={onSmartSplit}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1.5 rounded text-sm transition-colors text-slate-300"
                    title="Auto-split by Silence"
                 >
                     <Wand2 size={16} /> <span className="hidden sm:inline">Smart Split</span>
                 </button>

                 <button 
                     onClick={onSave}
                     className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 rounded text-sm font-medium transition-colors"
                 >
                     <Save size={16} /> Save
                 </button>
            </div>
        </header>
    );
}
