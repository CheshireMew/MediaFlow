import { lazy, Suspense, useState, useRef, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { SubtitleList } from "../components/editor/SubtitleList";
import { ClipCandidateList } from "../components/editor/ClipCandidateList";
import { FindReplaceDialog } from "../components/dialogs/FindReplaceDialog";
import { ContextMenu } from "../components/ui/ContextMenu";
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
import {
  useEditorClipWorkspace,
} from "../hooks/editor/useEditorClipWorkspace";
import { useEditorVideoExport } from "../hooks/editor/useEditorVideoExport";
import type { EditorContextMenuState } from "../hooks/editor/editorClipTypes";
import { useEditorStore } from "../stores/editorStore";
import { isEditorDocumentDirty } from "../stores/editorDocument";
import { PageShell } from "../components/ui/PageChrome";

const VideoExportDialog = lazy(async () => {
  const mod = await import("../components/dialogs/SynthesisDialog");
  return { default: mod.VideoExportDialog };
});

const WaveformPlayer = lazy(async () => {
  const mod = await import("../components/editor/WaveformPlayer");
  return { default: mod.WaveformPlayer };
});

export function EditorPage() {
  const { t } = useTranslation('editor');
  const videoRef = useRef<HTMLVideoElement>(null);
  const { addTask } = useTaskContext();

  // ── UI State ────────────────────────────────────────────────
  const autoScroll = true;
  const [waveformReadySource, setWaveformReadySource] = useState<string | null>(null);
  const [contextMenu, setContextMenu] =
    useState<EditorContextMenuState | null>(null);

  // ── Store ───────────────────────────────────────────────────
  const editorDocument = useEditorStore(state => state.document);
  const regions = editorDocument.regions;
  const currentFileRef = editorDocument.video;
  const currentSubtitleRef = editorDocument.subtitle;
  const currentFilePath = currentFileRef?.path ?? null;
  const currentSubtitlePath = currentSubtitleRef?.path ?? null;
  const documentIsDirty = isEditorDocumentDirty(editorDocument);
  const replaceRegionsWithUndo = useEditorStore(state => state.replaceRegionsWithUndo);
  const activeSegmentId = useEditorStore(state => state.activeSegmentId);
  const selectedIds = useEditorStore(state => state.selectedIds);
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
      mediaUrl, openFile, openSubtitle, saveSubtitleFile,
      loadVideo, loadSubtitleFromPath,
  } = useEditorIO();

  // ── Action Hooks ────────────────────────────────────────────
  const { handleSave, handleTranslate, handleSmartSplit, isSmartSplitting } = useEditorActions({
      video: currentFileRef, subtitle: currentSubtitleRef, regions, saveSubtitleFile,
      replaceRegionsWithUndo,
  });

  const { handleContextMenu } = useContextMenuBuilder({
      regions, selectedIds, video: currentFileRef, subtitle: currentSubtitleRef, videoRef,
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
  } = useEditorRegionHandlers({
    regions,
    activeSegmentId,
    selectSegment,
    updateRegion,
    updateRegionText,
    snapshot,
    videoRef,
  });

  const clipWorkspace = useEditorClipWorkspace({
    document: editorDocument,
    mediaUrl,
    waveformReady: Boolean(mediaUrl && waveformReadySource === mediaUrl),
    videoElementRef: videoRef,
    saveSubtitleFile,
    setContextMenu,
  });
  const videoExport = useEditorVideoExport({
    clipExportScope: clipWorkspace.exportScope,
    video: currentFileRef,
    subtitle: currentSubtitleRef,
    regions,
    saveSubtitleFile,
    addTask,
    submitClipExport: clipWorkspace.submitClipExport,
    closeClipExport: clipWorkspace.closeClipExport,
  });

  useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
          if (documentIsDirty) { e.preventDefault(); e.returnValue = ''; }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [documentIsDirty]);

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
    video: currentFileRef,
    videoRef,
  });

  const handleVideoMetadataReady = () => {
    handleLoadedMetadata();
    setWaveformReadySource(mediaUrl);
  };

  // ── Render ──────────────────────────────────────────────────
  return (
    <PageShell padded={false} className="flex flex-col">
        <EditorHeader
            mode={clipWorkspace.workspaceMode}
            onModeChange={clipWorkspace.setWorkspaceMode}
            onOpenFile={openFile}
            onOpenSubtitle={openSubtitle}
            onSave={handleSave}
            onSaveAs={() => saveSubtitleFile(regions, true)}
            onExport={videoExport.openFullVideoExport}
            onTranslate={handleTranslate}
            onDetectHighlights={clipWorkspace.handleDetectHighlights}
            isDetectingHighlights={clipWorkspace.isDetectingHighlights}
            canDetectHighlights={clipWorkspace.hasSubtitleContent}
            canExport={Boolean(currentFileRef)}
        />

        <div className="flex-1 flex min-h-0 bg-[#0a0a0a] gap-[1px]">
             {/* Left: Subtitle List */}
             <div className="w-[34%] min-w-[340px] max-w-[540px] flex flex-col bg-[#141414] max-[900px]:w-[42%] max-[900px]:min-w-[260px] max-[900px]:max-w-[300px]"
                 onDrop={handleSubtitleDrop} onDragOver={handleDragOver}>
                 <div className="flex-1 min-h-0">
                     {clipWorkspace.workspaceMode === "subtitles" ? (
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
                     ) : (
                        <ClipCandidateList
                            candidates={clipWorkspace.candidates}
                            activeClipId={clipWorkspace.activeClipId}
                            isDetecting={clipWorkspace.isDetectingHighlights}
                            isExporting={clipWorkspace.isQuickExportingClips}
                            exportTask={clipWorkspace.exportTask}
                            canDetect={clipWorkspace.hasSubtitleContent}
                            canCreate={clipWorkspace.canCreateClip}
                            onDetect={clipWorkspace.handleDetectHighlights}
                            onCreateClip={clipWorkspace.handleCreateManualClip}
                            onConfigureExport={clipWorkspace.handleConfigureClipExport}
                            onQuickExport={clipWorkspace.handleQuickExportSelectedClips}
                            onClipClick={clipWorkspace.handleClipClick}
                            onToggleSelected={clipWorkspace.handleToggleClipSelected}
                            onDeleteClip={clipWorkspace.handleDeleteClip}
                        />
                     )}
                 </div>

                 {/* Detail Editor */}
                 {clipWorkspace.workspaceMode === "clips" ? (
                    clipWorkspace.activeClip ? (
                        <div className="h-28 bg-[#151515] p-2 flex flex-col gap-1 border-t border-white/5 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.5)] z-20">
                            <div className="flex justify-between items-center text-xs px-1 select-none">
                                <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full ${clipWorkspace.activeClip.selected ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                                    <span className="font-bold text-slate-400 tracking-wider uppercase opacity-80">
                                        {t('clips.detailTitle')}
                                    </span>
                                </div>
                                <span className="font-mono text-amber-300/90 bg-amber-500/5 px-1 py-0 rounded border border-amber-500/10 text-xs">
                                    {(clipWorkspace.activeClip.end - clipWorkspace.activeClip.start).toFixed(2)}s · {clipWorkspace.activeClip.score.toFixed(1)}
                                </span>
                            </div>
                            <input
                                aria-label={t('clips.titlePlaceholder')}
                                value={clipWorkspace.activeClip.title || ""}
                                onChange={(event) => clipWorkspace.updateClipCandidate(clipWorkspace.activeClip!.id, { title: event.target.value })}
                                className="h-8 w-full bg-black/20 border border-white/5 rounded-lg px-2 text-sm focus:outline-none focus:border-amber-500/50 focus:bg-black/40 transition-all font-medium text-slate-200 placeholder-slate-400"
                                placeholder={t('clips.titlePlaceholder')}
                            />
                            <p className="min-h-0 flex-1 overflow-hidden px-1 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] text-xs leading-relaxed text-slate-400">
                                {clipWorkspace.activeClip.transcript || clipWorkspace.activeClip.reason || t('clips.noReason')}
                            </p>
                        </div>
                    ) : (
                        <div className="h-28 bg-[#151515] p-2 flex flex-col items-center justify-center border-t border-white/5 z-20 text-slate-400 text-xs italic pointer-events-none select-none">
                            {t('clips.noSelection')}
                        </div>
                    )
                 ) : displaySegment ? (
                    <div className="h-28 bg-[#151515] p-2 flex flex-col gap-1 border-t border-white/5 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.5)] z-20">
                         <div className="flex justify-between items-center text-xs px-1 select-none">
                             <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full ${activeSegmentId ? 'bg-indigo-500 animate-pulse' : 'bg-slate-500'}`} />
                                <span className="font-bold text-slate-400 tracking-wider uppercase opacity-80">
                                   {activeSegmentId ? t('detailEditor.editingSelection') : t('detailEditor.editingDefault')}
                                </span>
                             </div>
                             <span className="font-mono text-indigo-400/80 bg-indigo-500/5 px-1 py-0 rounded border border-indigo-500/10 text-xs">
                                {((displaySegment.end - displaySegment.start).toFixed(2))}s
                             </span>
                         </div>
                         <textarea
                            aria-label={t('detailEditor.placeholder')}
                            value={displaySegment.text}
                            onChange={(e) => handleDetailUpdate('text', e.target.value)}
                            className="flex-1 w-full bg-black/20 border border-white/5 rounded-lg p-2 text-sm resize-none focus:outline-none focus:border-indigo-500/50 focus:bg-black/40 transition-all font-medium leading-normal text-slate-200 placeholder-slate-400"
                            placeholder={t('detailEditor.placeholder')}
                         />
                    </div>
                 ) : (
                    <div className="h-28 bg-[#151515] p-2 flex flex-col items-center justify-center border-t border-white/5 z-20 text-slate-400 text-xs italic pointer-events-none select-none">
                        {t('detailEditor.noSelection')}
                    </div>
                 )}
             </div>

             {/* Right: Video Preview */}
             <div className="flex-1 min-w-0 bg-[#101010] relative flex flex-col justify-center"
                 onDrop={handleVideoDrop} onDragOver={handleDragOver}>
                <VideoPreview
                    mediaUrl={mediaUrl}
                    videoRef={videoRef}
                    regions={regions}
                    onLoadedMetadata={handleVideoMetadataReady}
                />
             </div>
        </div>

        {/* Bottom: Waveform Timeline */}
        <div className="h-44 bg-[#101010] border-t border-white/5 relative z-30 shrink-0">
             {mediaUrl && waveformReadySource === mediaUrl && (
               <Suspense fallback={null}>
                 <WaveformPlayer
                    mediaUrl={mediaUrl}
                    videoRef={videoRef}
                    regions={clipWorkspace.workspaceMode === "clips" ? clipWorkspace.timelineRegions : regions}
                    onRegionUpdate={clipWorkspace.workspaceMode === "clips" ? clipWorkspace.handleClipRegionUpdate : handleRegionUpdateCallback}
                     onRegionClick={clipWorkspace.workspaceMode === "clips" ? clipWorkspace.handleClipRegionClick : handleRegionClick}
                     onContextMenu={clipWorkspace.workspaceMode === "clips" ? clipWorkspace.handleClipContextMenu : handleContextMenu}
                     selectedIds={clipWorkspace.workspaceMode === "clips" ? clipWorkspace.selectedClipIds : selectedIds}
                     activeSegmentId={clipWorkspace.workspaceMode === "clips" ? clipWorkspace.activeClipId : activeSegmentId}
                     autoScroll={autoScroll}
                     onInteractStart={clipWorkspace.workspaceMode === "clips" ? undefined : snapshot}
                 />
               </Suspense>
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

        {videoExport.exportScope && (
            <Suspense fallback={null}>
                <VideoExportDialog
                    isOpen={Boolean(videoExport.exportScope)}
                    onClose={videoExport.closeVideoExport}
                    regions={regions}
                    video={currentFileRef}
                    mediaUrl={mediaUrl}
                    exportScope={videoExport.exportScope}
                    onExport={videoExport.submitVideoExport}
                />
            </Suspense>
        )}
    </PageShell>
  );
}
