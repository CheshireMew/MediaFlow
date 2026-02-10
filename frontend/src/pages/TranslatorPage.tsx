import { useRef, useEffect } from 'react';
import { 
    Wand2, FolderOpen, Loader2, Book, Globe, Download, Settings2 
} from 'lucide-react';

import { useTranslator } from '../hooks/useTranslator';
import { translatorService } from '../services/translator/translatorService';
import { SegmentsTable } from '../components/translator/SegmentsTable';
import { Sidebar } from '../components/translator/Sidebar';
import { useState } from 'react';

export const TranslatorPage = () => {
    const {
        sourceSegments,
        targetSegments,
        glossary,
        sourceFilePath,
        targetLang,
        mode,
        taskId,
        taskStatus,
        progress,
        isTranslating,
        setSourceSegments,
        updateTargetSegment,
        setTargetLang,
        setMode,
        handleFileUpload,
        refreshGlossary,
        startTranslation,
        exportSRT
    } = useTranslator();
    
    // UI Local State for Sidebar
    const [showGlossary, setShowGlossary] = useState(false);

    // --- Legacy "Open File" Handler to wrap hook ---
    const handleOpenFile = async () => {
         if (window.electronAPI) {
            const openFn = (window.electronAPI as any).openSubtitleFile || window.electronAPI.openFile;
            const fileData = await openFn() as any;
            if (fileData && fileData.path) {
                handleFileUpload(fileData.path);
            }
         }
    };
    
    // --- Glossary Handlers ---
    const handleAddTerm = async (source: string, target: string) => {
        await translatorService.addTerm({ source, target });
        refreshGlossary();
    };
    
    const handleDeleteTerm = async (id: string) => {
        await translatorService.deleteTerm(id);
        refreshGlossary();
    };

    // --- Editor Link (Simplified for Refactor) ---
    const handleOpenInEditor = async () => {
        // ... (Keep this logic simple or abstract it later if needed)
        // For now, alerting user that this is pending migration if logic is complex
        // Or re-implementing basic nav if critical.
        // Let's assume we want to preserve it.
        if (!sourceFilePath || targetSegments.length === 0) return;
        
        // Save current target
        await exportSRT(); // Auto-save for now
        
        // Dispatch event (Naive migration of legacy logic)
        window.dispatchEvent(new CustomEvent('mediaflow:navigate', { detail: 'editor' }));
    };

    return (
        <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden relative">
             <header className="h-16 border-b border-slate-800 bg-slate-900 flex items-center justify-between pl-4 pr-40 shrink-0 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
                 <div className="flex items-center gap-3 no-drag" style={{ WebkitAppRegion: 'no-drag' } as any}>
                     <div className="p-2 bg-indigo-600/20 rounded-lg">
                        <Globe className="w-5 h-5 text-indigo-400" />
                     </div>
                     <div>
                        <h1 className="font-bold text-lg">AI Translator</h1>
                        <p className="text-xs text-slate-400">
                            {sourceFilePath ? (
                                <span title={sourceFilePath} className="text-indigo-300">
                                    {sourceFilePath.split(/[/\\]/).pop()}
                                </span>
                            ) : (
                                "Context-Aware • Glossary-Enforced"
                            )}
                        </p>
                     </div>
                 </div>
                 
                 <div className="flex items-center gap-2 no-drag" style={{ WebkitAppRegion: 'no-drag' } as any}>
                     <button 
                        onClick={() => setShowGlossary(!showGlossary)}
                        className={`p-2 rounded-lg transition-colors ${showGlossary ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}
                        title="Glossary Manager"
                     >
                         <Book size={18} />
                     </button>
                     
                     <div className="h-6 w-[1px] bg-slate-700 mx-2"></div>

                     <button 
                         onClick={handleOpenFile}
                         className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-sm transition-colors border border-slate-700 hover:border-slate-600"
                     >
                         <FolderOpen size={16} /> <span className="hidden xl:inline">Import</span>
                     </button>
                     
                     <button 
                         onClick={startTranslation}
                         disabled={isTranslating || sourceSegments.length === 0}
                         className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:opacity-50 rounded text-sm font-medium transition-colors shadow-lg shadow-indigo-900/20"
                     >
                         {isTranslating ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
                         <span className="hidden lg:inline">Translate</span>
                     </button>
                     
                     {targetSegments.length > 0 && (
                         <>
                            <button 
                                onClick={exportSRT}
                                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm font-medium transition-colors"
                            >
                                <Download size={16} /> <span className="hidden xl:inline">Export</span>
                            </button>
                         </>
                     )}
                 </div>
             </header>
             
             {/* Progress Bar */}
             {progress > 0 && progress < 100 && (
                 <div className="h-1 bg-slate-900 w-full relative overflow-hidden">
                     <div className="absolute top-0 left-0 h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>
                 </div>
             )}

             {/* Table Header Controls */}
             <div className="border-b border-slate-800 bg-slate-900 p-2 flex justify-between items-center text-xs">
                 <div className="flex items-center gap-4">
                     <span className="font-bold text-slate-500 uppercase tracking-wider">Source ({sourceSegments.length})</span>
                 </div>
                 <div className="flex items-center gap-4">
                     <span className="font-bold text-slate-500 uppercase tracking-wider">Target ({targetSegments.length})</span>
                     
                     <div className="flex items-center gap-2">
                         <select 
                            value={targetLang} 
                            onChange={e => setTargetLang(e.target.value)}
                            className="bg-slate-900 border border-slate-800 text-xs px-2 py-0.5 rounded outline-none text-slate-400 hover:text-slate-200 focus:border-indigo-500 transition-colors"
                         >
                             <option value="Chinese">Chinese (中文)</option>
                             <option value="English">English</option>
                             <option value="Japanese">Japanese</option>
                             <option value="Spanish">Spanish</option>
                             <option value="French">French</option>
                         </select>
                         <select 
                            value={mode} 
                            onChange={e => setMode(e.target.value as any)}
                            className="bg-slate-900 border border-slate-800 text-xs px-2 py-0.5 rounded outline-none text-slate-400 hover:text-slate-200 focus:border-indigo-500 transition-colors"
                         >
                             <option value="standard">Standard</option>
                             <option value="intelligent">Smart Split</option>
                         </select>
                     </div>
                 </div>
             </div>

             <SegmentsTable 
                sourceSegments={sourceSegments} 
                targetSegments={targetSegments}
                onUpdateTarget={updateTargetSegment}
                onFileSelect={handleFileUpload}
             />
                 
             {/* Loading Overlay */}
             {isTranslating && targetSegments.length === 0 && (
                 <div className="fixed bottom-10 right-10 p-4 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex items-center gap-3 z-50">
                     <Loader2 className="animate-spin text-indigo-500" size={20} />
                     <div>
                         <p className="text-sm font-bold text-slate-200">Translating...</p>
                         <p className="text-xs text-slate-400">{taskStatus}</p>
                     </div>
                 </div>
             )}
             
             <Sidebar 
                isOpen={showGlossary} 
                onClose={() => setShowGlossary(false)} 
                glossary={glossary}
                onAddTerm={handleAddTerm}
                onDeleteTerm={handleDeleteTerm}
             />
        </div>
    );
};
