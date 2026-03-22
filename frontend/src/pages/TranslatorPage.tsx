import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    Wand2, FolderOpen, Loader2, Book, Globe, Download, FileEdit, Sparkles 
} from 'lucide-react';

import { useTranslator } from '../hooks/useTranslator';
import { glossaryService } from '../services/domain';
import { fileService } from '../services/fileService';
import { getExecutionModeDisplay } from '../services/ui/executionModeDisplay';
import { SegmentsTable } from '../components/translator/SegmentsTable';
import { Sidebar } from '../components/translator/Sidebar';
import type { TranslatorMode } from '../hooks/useTranslator';

type ElectronSubtitleFile = {
    path: string;
    name: string;
};

export const TranslatorPage = () => {
    const {
        sourceSegments,
        targetSegments,
        glossary,
        sourceFilePath,
        targetLang,
        mode,
        activeMode,
        resultMode,
        taskStatus,
        progress,
        taskError,
        executionMode,
        isTranslating,
        updateTargetSegment,
        setTargetLang,
        setMode,
        handleFileUpload,
        refreshGlossary,
        startTranslation,
        proofreadSubtitle,
        exportSRT,
        handleOpenInEditor
    } = useTranslator();

    const { t } = useTranslation('translator');
    const hasGeneratedSegments = targetSegments.length > sourceSegments.length;
    const executionModeDisplay = executionMode
        ? getExecutionModeDisplay(executionMode)
        : null;
    
    // UI Local State for Sidebar
    const [showGlossary, setShowGlossary] = useState(false);

    // --- Legacy "Open File" Handler to wrap hook ---
    const handleOpenFile = async () => {
         try {
            const fileData = await fileService.openSubtitleFile() as ElectronSubtitleFile | null;
            if (fileData && fileData.path) {
                handleFileUpload(fileData.path);
            }
         } catch (error) {
            console.error("Failed to open subtitle file:", error);
         }
    };
    
    // --- Glossary Handlers ---
    const handleAddTerm = async (source: string, target: string) => {
        await glossaryService.addTerm({ source, target });
        refreshGlossary();
    };
    
    const handleDeleteTerm = async (id: string) => {
        await glossaryService.deleteTerm(id);
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
                        <h1 className="text-2xl font-bold text-white tracking-tight">{t('title')}</h1>
                        <p className="text-xs font-medium text-slate-400 mt-0.5 flex items-center gap-2">
                            {sourceFilePath ? (
                                <>
                                    <span className="text-indigo-400 truncate max-w-[300px]" title={sourceFilePath}>
                                        {sourceFilePath.split(/[/\\]/).pop()}
                                    </span>
                                </>
                            ) : (
                                t('subtitle')
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
                        title={t('glossary.tooltip')}
                     >
                         <Book size={16} />
                         <span className="hidden lg:inline">{t('glossary.button')}</span>
                     </button>
                     
                     <div className="h-6 w-[1px] bg-white/10 mx-2"></div>

                     {/* Input Group */}
                     <div className="flex items-center gap-2">
                         <button 
                             onClick={handleOpenFile}
                             className="h-10 px-4 bg-[#1a1a1a] hover:bg-white/5 border border-white/10 hover:border-white/20 rounded-xl text-slate-300 hover:text-white text-sm font-medium transition-all flex items-center gap-2"
                             title={t('buttons.import.tooltip')}
                         >
                             <FolderOpen size={16} /> <span className="hidden xl:inline">{t('buttons.import.label')}</span>
                         </button>
                         
                         <button 
                             onClick={proofreadSubtitle}
                             disabled={isTranslating || sourceSegments.length === 0}
                             className="h-10 px-5 bg-[#1a1a1a] hover:bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:text-emerald-300 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                             title={t('buttons.proofread.tooltip')}
                         >
                             {isTranslating && activeMode === 'proofread' ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                             <span className="hidden lg:inline">{t('buttons.proofread.label')}</span>
                         </button>

                         <button 
                             onClick={startTranslation}
                             disabled={isTranslating || sourceSegments.length === 0}
                             className="h-10 px-5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:shadow-lg hover:shadow-indigo-500/20 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-indigo-500/10"
                         >
                             {isTranslating && activeMode !== 'proofread' ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
                             <span className="hidden lg:inline">{t('buttons.translate.label')}</span>
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
                                    title={t('buttons.export.tooltip')}
                                >
                                    <Download size={16} /> <span className="hidden xl:inline">{t('buttons.export.label')}</span>
                                </button>

                                <button 
                                    onClick={handleOpenInEditor}
                                    className="h-10 px-4 bg-[#1a1a1a] hover:bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:text-indigo-300 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
                                    title={t('buttons.editor.tooltip')}
                                >
                                    <FileEdit size={16} /> <span className="hidden xl:inline">{t('buttons.editor.label')}</span>
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
                         <span className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-2 border-l-2 border-slate-700">{t('table.sourceHeader')} ({sourceSegments.length})</span>
                     </div>
                     <div className="flex items-center gap-6">
                         <div className="flex items-center gap-3">
                             <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{t('table.targetLangLabel')}</label>
                             <div className="relative group">
                                <select 
                                    value={targetLang} 
                                    onChange={e => setTargetLang(e.target.value)}
                                    className="bg-black/40 border border-white/10 text-xs px-3 py-1.5 rounded-lg outline-none text-slate-300 hover:text-white focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all appearance-none pr-8 cursor-pointer font-medium"
                                >
                                    <option value="Chinese">{t('languages.Chinese')}</option>
                                    <option value="English">{t('languages.English')}</option>
                                    <option value="Japanese">{t('languages.Japanese')}</option>
                                    <option value="Spanish">{t('languages.Spanish')}</option>
                                    <option value="French">{t('languages.French')}</option>
                                </select>
                             </div>
                         </div>

                         <div className="flex items-center gap-3">
                             <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{t('table.modeLabel')}</label>
                             <div className="relative group">
                                <select 
                                    value={mode} 
                                    onChange={e => setMode(e.target.value as TranslatorMode)}
                                    className="bg-black/40 border border-white/10 text-xs px-3 py-1.5 rounded-lg outline-none text-slate-300 hover:text-white focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all appearance-none pr-8 cursor-pointer font-medium"
                                >
                                    <option value="standard">{t('modes.standard')}</option>
                                    <option value="intelligent">{t('modes.intelligent')}</option>
                                    <option value="proofread">{t('modes.proofread')}</option>
                                </select>
                             </div>
                         </div>
                     </div>
                 </div>

                 {targetSegments.length > 0 && resultMode && (
                     <div className="flex-none px-4 py-3 border-b border-white/5 bg-black/20 flex items-center gap-2 text-xs text-slate-300">
                        <span className={`px-2 py-1 rounded-md border font-semibold ${
                            resultMode === 'proofread'
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                                : resultMode === 'intelligent'
                                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                    : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                        }`}>
                            {resultMode === 'proofread'
                                ? t('result.proofreadBadge')
                                : resultMode === 'intelligent'
                                    ? t('result.intelligentBadge')
                                    : t('result.standardBadge')}
                        </span>
                        <span>
                            {resultMode === 'proofread'
                                ? t('result.proofreadHint')
                                : resultMode === 'intelligent'
                                    ? hasGeneratedSegments
                                        ? t('result.intelligentHintGenerated')
                                        : t('result.intelligentHint')
                                    : t('result.standardHint')}
                        </span>
                     </div>
                 )}

                 {taskStatus === "failed" && taskError && (
                     <div className="flex-none px-4 py-3 border-b border-rose-500/20 bg-rose-500/10 text-sm text-rose-200">
                        {taskError}
                     </div>
                 )}

                 {executionModeDisplay && (
                     <div className="flex-none px-4 py-2 border-b border-white/5 bg-black/20 flex items-center gap-2 text-xs text-slate-300">
                        <span className={`px-2 py-1 rounded-md border font-mono ${executionModeDisplay.className}`}>
                            {executionModeDisplay.label}
                        </span>
                        <span>execution mode</span>
                     </div>
                 )}
    
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
                             <p className="text-lg font-bold text-white mb-1">{t('loading.message')}</p>
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
