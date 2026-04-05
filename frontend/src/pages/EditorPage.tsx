import { lazy, Suspense, useState, useRef, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { WaveformPlayer } from "../components/editor/WaveformPlayer";
import { SubtitleList } from "../components/editor/SubtitleList";
import { FindReplaceDialog } from "../components/dialogs/FindReplaceDialog";
import { ContextMenu, type ContextMenuItem } from "../components/ui/ContextMenu";
import {
  createTaskFromExecutionOutcome,
  executionService,
  resolveExecutionOutcomeBranch,
} from "../services/domain";
import { useTaskContext } from "../context/taskContext";

// Extracted Components
import { EditorHeader } from "../components/editor/EditorHeader";
import { VideoPreview } from "../components/editor/VideoPreview";

// Custom Hooks
import { useEditorIO } from "../hooks/editor/useEditorIO";
import { useEditorShortcuts } from "../hooks/editor/useEditorShortcuts";
import { useEditorActions } from "../hooks/editor/useEditorActions";
import { useContextMenuBuilder } from "../hooks/editor/useContextMenuBuilder";
import { useEditorDragDrop } from "../hooks/editor/useEditorDragDrop";
import { useEditorPlaybackPersistence } from "../hooks/editor/useEditorPlaybackPersistence";
import { useEditorFindReplace } from "../hooks/editor/useEditorFindReplace";
import { useEditorRegionHandlers } from "../hooks/editor/useEditorRegionHandlers";
import { useEditorStore } from "../stores/editorStore";

const SynthesisDialog = lazy(async () => {
  const mod = await import("../components/dialogs/SynthesisDialog");
  return { default: mod.SynthesisDialog };
});

export function EditorPage() {
  const { t } = useTranslation('editor');
  const videoRef = useRef<HTMLVideoElement>(null);
  const { addTask } = useTaskContext();

  // ── UI State ────────────────────────────────────────────────
  const [autoScroll, setAutoScroll] = useState(true);
  const [showSynthesis, setShowSynthesis] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
      position: { x: number; y: number };
      items: ContextMenuItem[];
      targetId?: string;
  } | null>(null);

  // ── Store ───────────────────────────────────────────────────
  const regions = useEditorStore(state => state.regions);
  const replaceRegionsWithUndo = useEditorStore(state => state.replaceRegionsWithUndo);
  const activeSegmentId = useEditorStore(state => state.activeSegmentId);
  const selectedIds = useEditorStore(state => state.selectedIds);
  const currentSubtitlePath = useEditorStore(state => state.currentSubtitlePath);
  const currentFileRef = useEditorStore(state => state.currentFileRef);
  const currentSubtitleRef = useEditorStore(state => state.currentSubtitleRef);
  const undo = useEditorStore(state => state.undo);
  const redo = useEditorStore(state => state.redo);
  const deleteSegments = useEditorStore(state => state.deleteSegments);
  const mergeSegments = useEditorStore(state => state.mergeSegments);
  const splitSegment = useEditorStore(state => state.splitSegment);
  const updateRegion = useEditorStore(state => state.updateRegion);
  const updateRegionText = useEditorStore(state => state.updateRegionText);
  const snapshot = useEditorStore(state => state.snapshot);
  const selectSegment = useEditorStore(state => state.selectSegment);
  const addSegment = useEditorStore(state => state.addSegment);
  const addSegments = useEditorStore(state => state.addSegments);
  const updateSegments = useEditorStore(state => state.updateSegments);
  const {
    showFindReplace,
    searchTerm,
    setSearchTerm,
    matchCase,
    setMatchCase,
    handleCloseFindReplace,
    handleToggleFindReplace,
  } = useEditorFindReplace();

  // ── IO Hook ─────────────────────────────────────────────────
  const {
      mediaUrl, openFile, openSubtitle, saveSubtitleFile, currentFilePath,
      loadVideo, loadSubtitleFromPath,
  } = useEditorIO();

  // ── Action Hooks ────────────────────────────────────────────
  const { handleSave, handleTranslate, handleSmartSplit, isSmartSplitting } = useEditorActions({
      currentFilePath, currentSubtitlePath, currentFileRef, currentSubtitleRef, regions, saveSubtitleFile,
      replaceRegionsWithUndo,
  });

  const { handleContextMenu } = useContextMenuBuilder({
      regions, selectedIds, currentFilePath, currentFileRef, videoRef,
      selectSegment, addSegment, addSegments, updateSegments,
      mergeSegments, splitSegment, deleteSegments, setContextMenu,
  });

  // ── Persistence & Safety ────────────────────────────────────
  const {
    displaySegment,
    handleRegionClick,
    handleDetailUpdate,
    handleRegionUpdateCallback,
    handleFindReplaceSelectSegment,
    handleFindReplaceUpdateSegment,
    regionsRef,
  } = useEditorRegionHandlers({
    regions,
    activeSegmentId,
    selectSegment,
    updateRegion,
    updateRegionText,
    snapshot,
    videoRef,
  });

  useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
          if (regionsRef.current.length > 0) { e.preventDefault(); e.returnValue = ''; }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [regionsRef]);

  // ── Shortcuts ───────────────────────────────────────────────
  useEditorShortcuts({
      videoRef, selectedIds, activeSegmentId,
      undo, redo, deleteSegments, splitSegment,
      onSave: handleSave,
      onToggleFindReplace: handleToggleFindReplace,
  });

  const { handleVideoDrop, handleSubtitleDrop, handleDragOver } =
    useEditorDragDrop({
      loadVideo,
      loadSubtitleFromPath,
    });
  const { handleLoadedMetadata } = useEditorPlaybackPersistence({
    currentFilePath,
    videoRef,
  });

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="h-screen w-full flex flex-col text-slate-100 overflow-hidden">
        <EditorHeader
            autoScroll={autoScroll}
            setAutoScroll={setAutoScroll}
            onOpenFile={openFile}
            onOpenSubtitle={openSubtitle}
            onSave={handleSave}
            onSaveAs={() => saveSubtitleFile(regions, true)}
            onSynthesize={() => setShowSynthesis(true)}
            onTranslate={handleTranslate}
        />

        <div className="flex-1 flex min-h-0 bg-[#0a0a0a] gap-[1px]">
             {/* Left: Subtitle List */}
             <div className="w-1/3 min-w-[320px] max-w-[480px] flex flex-col bg-[#1a1a1a]"
                 onDrop={handleSubtitleDrop} onDragOver={handleDragOver}>
                 <div className="flex-1 min-h-0">
                     <SubtitleList
                        segments={regions}
                        activeSegmentId={activeSegmentId}
                        autoScroll={autoScroll}
                        selectedIds={selectedIds}
                        scrollResetKey={currentSubtitlePath || currentFilePath}
                        onSegmentClick={(id, multi, shift) => handleRegionClick(id, { ctrlKey: multi, metaKey: false, shiftKey: shift, seek: false })}
                        onSegmentDelete={(id) => deleteSegments([id])}
                        onSegmentMerge={(ids) => mergeSegments(ids)}
                        onSegmentDoubleClick={(id) => {
                            const seg = regions.find(r => r.id === id);
                            if (seg && videoRef.current) videoRef.current.currentTime = seg.start;
                        }}
                        onContextMenu={handleContextMenu}
                        onSmartSplit={handleSmartSplit}
                        isSmartSplitting={isSmartSplitting}
                        onAutoFix={(newSegments) => replaceRegionsWithUndo(newSegments)}
                        searchTerm={searchTerm}
                        matchCase={matchCase}
                     />
                 </div>

                 {/* Detail Editor */}
                 {displaySegment ? (
                    <div className="h-28 bg-[#1a1a1a] p-2 flex flex-col gap-1 border-t border-white/5 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.5)] z-20">
                         <div className="flex justify-between items-center text-[10px] px-1 select-none">
                             <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full ${activeSegmentId ? 'bg-indigo-500 animate-pulse' : 'bg-slate-500'}`} />
                                <span className="font-bold text-slate-400 tracking-wider uppercase opacity-80">
                                   {activeSegmentId ? t('detailEditor.editingSelection') : t('detailEditor.editingDefault')}
                                </span>
                             </div>
                             <span className="font-mono text-indigo-400/80 bg-indigo-500/5 px-1 py-0 rounded border border-indigo-500/10 text-[9px]">
                                {((displaySegment.end - displaySegment.start).toFixed(2))}s
                             </span>
                         </div>
                         <textarea
                            value={displaySegment.text}
                            onChange={(e) => handleDetailUpdate('text', e.target.value)}
                            className="flex-1 w-full bg-black/20 border border-white/5 rounded-lg p-2 text-sm resize-none focus:outline-none focus:border-indigo-500/50 focus:bg-black/40 transition-all font-medium leading-normal text-slate-200 placeholder-slate-600/50"
                            placeholder={t('detailEditor.placeholder')}
                         />
                    </div>
                 ) : (
                    <div className="h-28 bg-[#1a1a1a] p-2 flex flex-col items-center justify-center border-t border-white/5 z-20 text-slate-700/50 text-xs italic pointer-events-none select-none">
                        {t('detailEditor.noSelection')}
                    </div>
                 )}
             </div>

             {/* Right: Video Preview */}
             <div className="flex-1 min-w-0 bg-[#1a1a1a] relative flex flex-col justify-center"
                 onDrop={handleVideoDrop} onDragOver={handleDragOver}>
                <VideoPreview
                    mediaUrl={mediaUrl}
                    videoRef={videoRef}
                    regions={regions}
                    onLoadedMetadata={handleLoadedMetadata}
                />
             </div>
        </div>

        {/* Bottom: Waveform Timeline */}
        <div className="h-40 bg-[#1a1a1a] border-t border-white/5 relative z-30 shrink-0">
             {mediaUrl && (
                 <WaveformPlayer
                    mediaUrl={mediaUrl}
                    videoRef={videoRef}
                    regions={regions}
                    onRegionUpdate={handleRegionUpdateCallback}
                     onRegionClick={handleRegionClick}
                     onContextMenu={handleContextMenu}
                     selectedIds={selectedIds}
                     autoScroll={autoScroll}
                     onInteractStart={snapshot}
                 />
             )}
        </div>

        <ContextMenu
            items={contextMenu?.items || []}
            position={contextMenu?.position || null}
            onClose={() => setContextMenu(null)}
        />

        <FindReplaceDialog
            isOpen={showFindReplace.isOpen}
            initialMode={showFindReplace.mode}
            onClose={handleCloseFindReplace}
            regions={regions}
            onSelectSegment={handleFindReplaceSelectSegment}
            onUpdateSegment={handleFindReplaceUpdateSegment}
            onUpdateSegments={updateSegments}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            matchCase={matchCase}
            setMatchCase={setMatchCase}
        />

        {showSynthesis && (
            <Suspense fallback={null}>
                <SynthesisDialog
                    isOpen={showSynthesis}
                    onClose={() => setShowSynthesis(false)}
                    regions={regions}
                    videoPath={currentFilePath || (mediaUrl ? mediaUrl.replace('file:///', '') : null)}
                    mediaUrl={mediaUrl}
                    onSynthesize={async (options, _unusedVideoPath, watermarkPath) => {
                        let srtPath: string | false = false;
                        try {
                            srtPath = await saveSubtitleFile(regions);
                        } catch (e) {
                            console.error("[EditorPage] Failed to save subtitles before synthesis", e);
                        }

                        if (!srtPath) {
                            if(!confirm(t('synthesis.confirmUnsavedMessage'))) return;
                            if (currentFilePath) {
                                srtPath = currentFilePath.replace(/\.[^.]+$/, '.srt');
                            }
                        }
                        
                        if (!srtPath || !currentFilePath) {
                            alert(t('synthesis.missingFilesError'));
                            return;
                        }

                        const { output_path, ...restOptions } = options;
                        const executionResult = await executionService.synthesize({
                            video_path: currentFileRef ? null : currentFilePath,
                            video_ref: currentFileRef,
                            srt_path: srtPath as string,
                            srt_ref: currentSubtitleRef,
                            watermark_path: watermarkPath,
                            output_path: output_path,
                            options: restOptions,
                        });
                        const outcome = resolveExecutionOutcomeBranch(executionResult);
                        if (outcome.kind !== "submission") {
                            throw new Error("Synthesis should return a task submission");
                        }
                        addTask(
                            createTaskFromExecutionOutcome({
                                outcome: executionResult,
                                type: "synthesize",
                                name: currentFilePath
                                    ? `Synthesize ${currentFilePath.split(/[\\/]/).pop()}`
                                    : "Synthesize video",
                                request_params: {
                                    video_ref: currentFileRef,
                                    srt_path: srtPath as string,
                                    subtitle_ref: currentSubtitleRef,
                                    watermark_path: watermarkPath,
                                    output_path: output_path ?? undefined,
                                    ...restOptions,
                                },
                            }),
                        );
                    }}
                />
            </Suspense>
        )}
    </div>
  );
}
