import { useState } from 'react';
import { 
    Wand2, FolderOpen, Loader2, Book, Globe, Download, FileEdit 
} from 'lucide-react';

import { useTranslator } from '../hooks/useTranslator';
import { translatorService } from '../services/translator/translatorService';
import { SegmentsTable } from '../components/translator/SegmentsTable';
import { Sidebar } from '../components/translator/Sidebar';

export const TranslatorPage = () => {
    const {
        sourceSegments,
        targetSegments,
        glossary,
        sourceFilePath,
        targetLang,
        mode,
        taskStatus,
        progress,
        isTranslating,
        updateTargetSegment,
        setTargetLang,
        setMode,
        handleFileUpload,
        refreshGlossary,
        startTranslation,
        exportSRT,
        handleOpenInEditor
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

    return (
        <div className="w-full h-full px-6 pb-6 pt-5 flex flex-col overflow-hidden relative">
             {/* Header */}
             <header className="flex-none mb-6 flex items-center justify-between pr-36 drag-region">
                 <div className="flex items-center gap-4 no-drag">
                     <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-lg shadow-indigo-500/10">
                        <Globe className="w-5 h-5 text-indigo-400" />
                     </div>
                     <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">AI Translator</h1>
                        <p className="text-xs font-medium text-slate-400 mt-0.5 flex items-center gap-2">
                            {sourceFilePath ? (
                                <>
                                    <span className="text-indigo-400 truncate max-w-[300px]" title={sourceFilePath}>
                                        {sourceFilePath.split(/[/\\]/).pop()}
                                    </span>
                                </>
                            ) : (
                                "Context-Aware • Glossary-Enforced"
                            )}
                        </p>
                     </div>
                 </div>
                 
                 <div className="flex items-center gap-3 no-drag">
                     <button 
                        onClick={() => setShowGlossary(!showGlossary)}
                        className={`h-10 px-4 rounded-xl font-medium text-sm border transition-all flex items-center gap-2
                            ${showGlossary 
                                ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20' 
                                : 'bg-[#1a1a1a] text-slate-400 border-white/10 hover:text-white hover:border-white/20'
                            }`}
                        title="Glossary Manager"
                     >
                         <Book size={16} />
                         <span className="hidden lg:inline">Glossary</span>
                     </button>
                     
                     <div className="h-6 w-[1px] bg-white/10 mx-2"></div>

                     {/* Input Group */}
                     <div className="flex items-center gap-2">
                         <button 
                             onClick={handleOpenFile}
                             className="h-10 px-4 bg-[#1a1a1a] hover:bg-white/5 border border-white/10 hover:border-white/20 rounded-xl text-slate-300 hover:text-white text-sm font-medium transition-all flex items-center gap-2"
                             title="Import Subtitle"
                         >
                             <FolderOpen size={16} /> <span className="hidden xl:inline">Import</span>
                         </button>
                         
                         <button 
                             onClick={startTranslation}
                             disabled={isTranslating || sourceSegments.length === 0}
                             className="h-10 px-5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:shadow-lg hover:shadow-indigo-500/20 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-indigo-500/10"
                         >
                             {isTranslating ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
                             <span className="hidden lg:inline">Translate</span>
                         </button>
                     </div>
                     
                     {/* Output Group */}
                     {targetSegments.length > 0 && (
                         <>
                            <div className="h-6 w-[1px] bg-white/10 mx-2"></div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={exportSRT}
                                    className="h-10 px-4 bg-[#1a1a1a] hover:bg-green-500/10 border border-green-500/20 text-green-400 hover:text-green-300 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
                                    title="Save SRT to disk"
                                >
                                    <Download size={16} /> <span className="hidden xl:inline">Export</span>
                                </button>

                                <button 
                                    onClick={handleOpenInEditor}
                                    className="h-10 px-4 bg-[#1a1a1a] hover:bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:text-indigo-300 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
                                    title="Open in Subtitle Editor"
                                >
                                    <FileEdit size={16} /> <span className="hidden xl:inline">Editor</span>
                                </button>
                            </div>
                         </>
                     )}
                 </div>
             </header>
             
             {/* Progress Bar */}
             {progress > 0 && progress < 100 && (
                 <div className="absolute top-0 left-0 w-full h-1 bg-slate-900 z-50">
                     <div className="h-full bg-indigo-500 transition-all duration-300 shadow-[0_0_10px_rgba(99,102,241,0.5)]" style={{ width: `${progress}%` }}></div>
                 </div>
             )}

             {/* Main Card */}
             <div className="flex-1 min-h-0 bg-[#1a1a1a] border border-white/5 rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
                 {/* Table Header Controls */}
                 <div className="flex-none p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                     <div className="flex items-center gap-4">
                         <span className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-2 border-l-2 border-slate-700">Source ({sourceSegments.length})</span>
                     </div>
                     <div className="flex items-center gap-6">
                         <div className="flex items-center gap-3">
                             <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Target Lang</label>
                             <div className="relative group">
                                <select 
                                    value={targetLang} 
                                    onChange={e => setTargetLang(e.target.value)}
                                    className="bg-black/40 border border-white/10 text-xs px-3 py-1.5 rounded-lg outline-none text-slate-300 hover:text-white focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all appearance-none pr-8 cursor-pointer font-medium"
                                >
                                    <option value="Chinese">Chinese (中文)</option>
                                    <option value="English">English</option>
                                    <option value="Japanese">Japanese</option>
                                    <option value="Spanish">Spanish</option>
                                    <option value="French">French</option>
                                </select>
                             </div>
                         </div>

                         <div className="flex items-center gap-3">
                             <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Mode</label>
                             <div className="relative group">
                                <select 
                                    value={mode} 
                                    onChange={e => setMode(e.target.value as any)}
                                    className="bg-black/40 border border-white/10 text-xs px-3 py-1.5 rounded-lg outline-none text-slate-300 hover:text-white focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all appearance-none pr-8 cursor-pointer font-medium"
                                >
                                    <option value="standard">Standard</option>
                                    <option value="intelligent">Smart Split</option>
                                </select>
                             </div>
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
                     <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                         <div className="relative">
                             <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
                             <Loader2 className="animate-spin text-indigo-400 relative z-10" size={48} />
                         </div>
                         <div className="text-center">
                             <p className="text-lg font-bold text-white mb-1">Translating...</p>
                             <p className="text-sm text-indigo-300 font-mono">{taskStatus}</p>
                         </div>
                     </div>
                 )}
            </div>
             
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
