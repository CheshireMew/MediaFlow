import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
    Wand2, FolderOpen, Loader2, Book, Globe, Download, FileEdit, Sparkles 
} from 'lucide-react';

import { useTranslator } from '../hooks/useTranslator';
import {
    glossaryService,
    TRANSLATION_TARGET_LANGUAGES,
    type TranslationTargetLanguage,
} from '../services/domain';
import { fileService } from '../services/fileService';
import { SegmentsTable } from '../components/translator/SegmentsTable';
import { Sidebar } from '../components/translator/Sidebar';
import type { TranslatorMode } from '../hooks/useTranslator';
import { PageContent, PageHeader, PageShell, ToolbarButton, WorkPanel } from '../components/ui/PageChrome';
import { normalizeMediaReference } from '../services/ui/mediaReference';

export const TranslatorPage = () => {
    const {
        sourceSegments,
        targetSegments,
        glossary,
        sourceFileRef,
        targetSubtitleRef,
        targetLang,
        mode,
        activeMode,
        taskStatus,
        progress,
        taskError,
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
    const sourceFilePath = sourceFileRef?.path ?? null;
    const targetSubtitlePath = targetSubtitleRef?.path ?? null;

    const { t } = useTranslation('translator');
    
    // UI Local State for Sidebar
    const [showGlossary, setShowGlossary] = useState(false);
    const targetLanguageId = useId();
    const translationModeId = useId();

    const handleOpenFile = async () => {
         try {
            const fileData = await fileService.openFile({ profile: 'subtitle' });
            const reference = normalizeMediaReference(fileData);
            if (reference) {
                await handleFileUpload(reference);
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
        <PageShell padded={false} className="flex flex-col relative">
             <PageHeader
                icon={Globe}
                title={t('title')}
                subtitle={sourceFilePath ? (
                    <span className="text-indigo-400" title={sourceFilePath}>
                        {sourceFilePath.split(/[/\\]/).pop()}
                    </span>
                ) : (
                    t('subtitle')
                )}
                actions={(
                 <>
                     <ToolbarButton
                        onClick={() => setShowGlossary(!showGlossary)}
                        icon={Book}
                        variant={showGlossary ? 'primary' : 'subtle'}
                        title={t('glossary.tooltip')}
                     >
                         <span className="hidden lg:inline">{t('glossary.button')}</span>
                     </ToolbarButton>
                     
                     <div className="h-6 w-[1px] bg-white/10 mx-2"></div>

                     {/* Input Group */}
                     <div className="flex items-center gap-2">
                         <ToolbarButton
                             onClick={handleOpenFile}
                             icon={FolderOpen}
                             variant="subtle"
                             title={t('buttons.import.tooltip')}
                         >
                             <span className="hidden xl:inline">{t('buttons.import.label')}</span>
                         </ToolbarButton>
                         
                         <ToolbarButton
                             onClick={proofreadSubtitle}
                             disabled={isTranslating || sourceSegments.length === 0}
                             icon={isTranslating && activeMode === 'proofread' ? Loader2 : Sparkles}
                             variant="success"
                             className={isTranslating && activeMode === 'proofread' ? '[&>svg]:animate-spin' : ''}
                             title={t('buttons.proofread.tooltip')}
                         >
                             <span className="hidden lg:inline">{t('buttons.proofread.label')}</span>
                         </ToolbarButton>

                         <ToolbarButton
                             onClick={startTranslation}
                             disabled={isTranslating || sourceSegments.length === 0}
                             icon={isTranslating && activeMode !== 'proofread' ? Loader2 : Wand2}
                             variant="primary"
                             className={isTranslating && activeMode !== 'proofread' ? '[&>svg]:animate-spin' : ''}
                         >
                             <span className="hidden lg:inline">{t('buttons.translate.label')}</span>
                         </ToolbarButton>
                     </div>
                     
                     {/* Output Group */}
                     {targetSegments.length > 0 && (
                         <>
                            <div className="h-6 w-[1px] bg-white/10 mx-2"></div>
                            <div className="flex items-center gap-2">
                                <ToolbarButton
                                    onClick={exportSRT}
                                    icon={Download}
                                    variant="success"
                                    title={t('buttons.export.tooltip')}
                                >
                                    <span className="hidden xl:inline">{t('buttons.export.label')}</span>
                                </ToolbarButton>

                                <ToolbarButton
                                    onClick={handleOpenInEditor}
                                    icon={FileEdit}
                                    variant="accent"
                                    title={t('buttons.editor.tooltip')}
                                >
                                    <span className="hidden xl:inline">{t('buttons.editor.label')}</span>
                                </ToolbarButton>
                            </div>
                         </>
                     )}
                 </>
                )}
             />
             
             {/* Progress Bar */}
             {progress > 0 && progress < 100 && (
                 <div className="absolute left-0 top-[76px] z-50 h-1 w-full bg-slate-900">
                     <div className="h-full bg-indigo-500 transition-all duration-300 shadow-[0_0_10px_rgba(99,102,241,0.5)]" style={{ width: `${progress}%` }}></div>
                 </div>
             )}

             <PageContent className="flex flex-col relative">
             {/* Main Card */}
             <WorkPanel className="flex-1 min-h-0 flex flex-col relative">
                 {/* Table Header Controls */}
                 <div className="flex-none p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                     <div className="flex items-center gap-4">
                         <span className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-2 border-l-2 border-slate-700">{t('table.sourceHeader')} ({sourceSegments.length})</span>
                     </div>
                     <div className="flex items-center gap-6">
                         <div className="flex items-center gap-3">
                              <label htmlFor={targetLanguageId} className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('table.targetLangLabel')}</label>
                             <div className="relative group">
                                 <select
                                    id={targetLanguageId}
                                    value={targetLang} 
                                    onChange={e => setTargetLang(e.target.value as TranslationTargetLanguage)}
                                    className="bg-black/40 border border-white/10 text-xs px-3 py-1.5 rounded-lg outline-none text-slate-300 hover:text-white focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all appearance-none pr-8 cursor-pointer font-medium"
                                >
                                    {TRANSLATION_TARGET_LANGUAGES.map(({ value, labelKey }) => (
                                        <option key={value} value={value}>{t(labelKey)}</option>
                                    ))}
                                </select>
                             </div>
                         </div>

                         <div className="flex items-center gap-3">
                              <label htmlFor={translationModeId} className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('table.modeLabel')}</label>
                             <div className="relative group">
                                 <select
                                    id={translationModeId}
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

                 {taskStatus === "failed" && taskError && (
                     <div className="flex-none px-4 py-3 border-b border-rose-500/20 bg-rose-500/10 text-sm text-rose-200">
                        {taskError}
                     </div>
                 )}
    
                 <SegmentsTable 
                    sourceSegments={sourceSegments} 
                    targetSegments={targetSegments}
                    onUpdateTarget={updateTargetSegment}
                    onFileSelect={handleFileUpload}
                    sourceSubtitlePath={sourceFilePath}
                    targetSubtitlePath={targetSubtitlePath}
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
                         </div>
                     </div>
                 )}
            </WorkPanel>
             
             <Sidebar 
                isOpen={showGlossary} 
                onClose={() => setShowGlossary(false)} 
                glossary={glossary}
                onAddTerm={handleAddTerm}
                onDeleteTerm={handleDeleteTerm}
             />
             </PageContent>
        </PageShell>
    );
};
