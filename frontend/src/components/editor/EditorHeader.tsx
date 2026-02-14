
import { Clapperboard, Save, Wand2, Download, FolderOpen, Languages } from "lucide-react";
import React from "react";

interface EditorHeaderProps {
    autoScroll: boolean;
    setAutoScroll: (enabled: boolean) => void;
    onOpenFile: () => void;
    onSave: () => void;
    onSmartSplit: () => Promise<void>;
    onSynthesize: () => void;
    onTranslate: () => void;
}

export function EditorHeader({
    autoScroll,
    setAutoScroll,
    onOpenFile,
    onSave,
    onSmartSplit,
    onSynthesize,
    onTranslate
}: EditorHeaderProps) {
    return (
        <header 
            className="flex-none pt-6 pb-6 pl-6 pr-32 flex items-center justify-between select-none relative z-50 transition-all"
            style={{ WebkitAppRegion: 'drag' } as any}
        >
            {/* Window Controls Safe Zone (Absolute Top Right) */}
            <div className="absolute top-0 right-0 w-32 h-10 z-50 no-drag" style={{ WebkitAppRegion: 'no-drag' } as any} />

            {/* Left: Brand & File */}
            <div className="flex items-center gap-5 no-drag" style={{ WebkitAppRegion: 'no-drag' } as any}>
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 rounded-2xl border border-white/5 shadow-lg shadow-indigo-500/10">
                        <Clapperboard className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight leading-none">Editor Workspace</h1>
                        <p className="text-slate-400 text-sm font-medium tracking-wide mt-1">Timeline & Subtitles</p>
                    </div>
                </div>
                
                <div className="h-8 w-[1px] bg-white/5 mx-2" />
                
                <button 
                  onClick={onOpenFile} 
                  className="flex items-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-500/30 text-indigo-300 px-4 py-2 rounded-lg text-xs font-medium transition-all shadow-sm active:scale-95 group"
                  title="Open Media File (Ctrl+O)"
                >
                    <FolderOpen size={16} className="group-hover:text-indigo-200 transition-colors" />
                    <span>Open Media</span>
                </button>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-4 no-drag" style={{ WebkitAppRegion: 'no-drag' } as any}>
                 <div className="flex items-center gap-2 mr-4 bg-white/5 px-3 py-2 rounded-lg border border-white/5 shadow-inner">
                    <input 
                        type="checkbox" 
                        id="autoScroll" 
                        checked={autoScroll} 
                        onChange={(e) => setAutoScroll(e.target.checked)}
                        className="w-4 h-4 rounded border-white/10 bg-white/5 text-indigo-500 focus:ring-1 focus:ring-indigo-500/50 cursor-pointer"
                    />
                    <label htmlFor="autoScroll" className="text-xs text-slate-400 select-none cursor-pointer font-medium hover:text-slate-200 transition-colors whitespace-nowrap">Auto-Scroll</label>
                 </div>
                 
                 <div className="flex items-center gap-2">
                     <button 
                        onClick={onSmartSplit}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-indigo-300 px-4 py-2 rounded-lg text-xs font-medium transition-all shadow-sm active:scale-95 group"
                        title="Auto-split by Silence"
                     >
                         <Wand2 size={16} className="group-hover:text-indigo-200 transition-colors" /> 
                         <span className="hidden xl:inline">Smart Split</span>
                     </button>

                     <button 
                        onClick={onTranslate}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-purple-300 px-4 py-2 rounded-lg text-xs font-medium transition-all shadow-sm active:scale-95 group"
                        title="Send to AI Translator"
                     >
                         <Languages size={16} className="group-hover:text-purple-200 transition-colors" /> 
                         <span className="hidden xl:inline">Translate</span>
                     </button>

                     <button 
                        onClick={onSynthesize}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-emerald-300 px-4 py-2 rounded-lg text-xs font-medium transition-all shadow-sm active:scale-95 group"
                        title="Export Video with Subtitles"
                     >
                         <Download size={16} className="group-hover:text-emerald-200 transition-colors" /> 
                         <span>Synthesize</span>
                     </button>
                 </div>

                 <div className="h-6 w-[1px] bg-white/10 mx-1" />

                 <button 
                     onClick={onSave}
                     className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 active:scale-95 ml-1"
                 >
                     <Save size={16} /> Save
                 </button>
            </div>
        </header>
    );
}
