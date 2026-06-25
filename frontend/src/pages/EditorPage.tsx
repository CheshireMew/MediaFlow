import { lazy, Suspense, useState, useRef, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { SubtitleList } from "../components/editor/SubtitleList";
import { ClipCandidateList } from "../components/editor/ClipCandidateList";
import { FindReplaceDialog } from "../components/dialogs/FindReplaceDialog";
import { ContextMenu, type ContextMenuItem } from "../components/ui/ContextMenu";
import {
  createTaskFromExecutionOutcome,
  editorService,
  executionService,
  getExecutionSubmission,
  buildSynthesisOptionsFromPreferences,
  resolveSynthesisWatermarkPath,
} from "../services/domain";
import { useTaskContext } from "../context/taskContext";
import { restoreStoredSynthesisExecutionPreferences } from "../services/persistence/synthesisExecutionPreferences";

// Extracted Components
import { EditorHeader, type EditorWorkspaceMode } from "../components/editor/EditorHeader";
import { VideoPreview } from "../components/editor/VideoPreview";

// Custom Hooks
import { useEditorIO } from "../hooks/editor/useEditorIO";
import { useEditorShortcuts } from "../hooks/editor/useEditorShortcuts";
import {
  resolveSubtitleReferenceForSavedPath,
  useEditorActions,
} from "../hooks/editor/useEditorActions";
import { useContextMenuBuilder } from "../hooks/editor/useContextMenuBuilder";
import { useEditorDragDrop } from "../hooks/editor/useEditorDragDrop";
import { useEditorPlaybackPersistence } from "../hooks/editor/useEditorPlaybackPersistence";
import { useEditorFindReplace } from "../hooks/editor/useEditorFindReplace";
import { useEditorRegionHandlers } from "../hooks/editor/useEditorRegionHandlers";
import { useEditorStore } from "../stores/editorStore";
import { normalizeMediaReference } from "../services/ui/mediaReference";
import { PageShell } from "../components/ui/PageChrome";
import type { ClipCandidate, SubtitleSegment } from "../types/task";
import { toast } from "../utils/toast";

const SynthesisDialog = lazy(async () => {
  const mod = await import("../components/dialogs/SynthesisDialog");
  return { default: mod.SynthesisDialog };
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
  const [showSynthesis, setShowSynthesis] = useState(false);
  const [waveformReady, setWaveformReady] = useState(false);
  const [workspaceMode, setWorkspaceMode] =
    useState<EditorWorkspaceMode>("subtitles");
  const [clipCandidates, setClipCandidates] = useState<ClipCandidate[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [isDetectingHighlights, setIsDetectingHighlights] = useState(false);
  const [isExportingClips, setIsExportingClips] = useState(false);
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

  const resolveCurrentVideoReference = () => {
    return currentFileRef ?? normalizeMediaReference(currentFilePath, {
      type: "video/mp4",
      media_kind: "video",
      role: "source",
    });
  };

  // ── Action Hooks ────────────────────────────────────────────
  const { handleSave, handleTranslate, handleSmartSplit, isSmartSplitting } = useEditorActions({
      currentFilePath, currentSubtitlePath, currentFileRef, currentSubtitleRef, regions, saveSubtitleFile,
      replaceRegionsWithUndo,
  });

  const { handleContextMenu } = useContextMenuBuilder({
      regions, selectedIds, currentFilePath, currentFileRef, videoRef,
      currentSubtitlePath, currentSubtitleRef,
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

  useEffect(() => {
    setWaveformReady(false);
  }, [mediaUrl]);

  useEffect(() => {
    setClipCandidates([]);
    setActiveClipId(null);
  }, [currentFilePath]);

  const handleVideoMetadataReady = () => {
    handleLoadedMetadata();
    setWaveformReady(true);
  };

  const clipTimelineRegions: SubtitleSegment[] = clipCandidates.map((candidate) => ({
    id: candidate.id,
    start: candidate.start,
    end: candidate.end,
    text: candidate.title || candidate.reason || "",
  }));
  const selectedClipIds = clipCandidates
    .filter((candidate) => candidate.selected)
    .map((candidate) => candidate.id);
  const activeClip = clipCandidates.find((candidate) => candidate.id === activeClipId) ?? null;
  const hasSubtitleContent = regions.some((region) => region.text.trim().length > 0);

  const updateClipCandidate = (
    id: string,
    updates: Partial<ClipCandidate>,
  ) => {
    setClipCandidates((current) =>
      current.map((candidate) =>
        candidate.id === id ? { ...candidate, ...updates } : candidate,
      ),
    );
  };

  const handleDetectHighlights = async () => {
    const videoRefForSubmission = resolveCurrentVideoReference();
    if (!videoRefForSubmission) {
      alert(t("clips.missingVideoError"));
      return;
    }
    if (!hasSubtitleContent) {
      toast.warning(t("clips.requiresSubtitlesMessage"));
      setWorkspaceMode("subtitles");
      return;
    }

    setIsDetectingHighlights(true);
    setWorkspaceMode("clips");
    try {
      const response = await editorService.detectHighlightCandidates({
        video_ref: videoRefForSubmission,
        subtitle_segments: regions,
        max_candidates: 6,
        min_duration: 12,
        max_duration: 75,
      });
      setClipCandidates(response.candidates);
      setActiveClipId(response.candidates[0]?.id ?? null);
      if (response.candidates.length === 0) {
        toast.warning(t("clips.detectNoCandidates"));
      } else {
        toast.success(t("clips.detectSuccess", { count: response.candidates.length }));
      }
    } catch (error) {
      console.error("[EditorClips] Failed to detect highlights", error);
      toast.error(t("clips.detectError"));
    } finally {
      setIsDetectingHighlights(false);
    }
  };

  const handleClipClick = (id: string) => {
    setActiveClipId(id);
    const clip = clipCandidates.find((candidate) => candidate.id === id);
    if (clip && videoRef.current) {
      videoRef.current.currentTime = clip.start;
    }
  };

  const handleClipRegionClick = (id: string, event?: MouseEvent) => {
    setActiveClipId(id);
    if (event?.ctrlKey || event?.metaKey) {
      updateClipCandidate(id, {
        selected: !(clipCandidates.find((candidate) => candidate.id === id)?.selected ?? false),
      });
    }
    const clip = clipCandidates.find((candidate) => candidate.id === id);
    if (clip && videoRef.current) {
      videoRef.current.currentTime = clip.start;
    }
  };

  const handleClipRegionUpdate = (id: string, start: number, end: number) => {
    updateClipCandidate(id, {
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
    });
  };

  const handleToggleClipSelected = (id: string) => {
    const clip = clipCandidates.find((candidate) => candidate.id === id);
    updateClipCandidate(id, { selected: !clip?.selected });
  };

  const handleDeleteClip = (id: string) => {
    setClipCandidates((current) => current.filter((candidate) => candidate.id !== id));
    if (activeClipId === id) {
      const next = clipCandidates.find((candidate) => candidate.id !== id);
      setActiveClipId(next?.id ?? null);
    }
  };

  const handleExportSelectedClips = async (renderMode: "burned" | "source" = "burned") => {
    const videoRefForSubmission = resolveCurrentVideoReference();
    const selectedClips = clipCandidates.filter((candidate) => candidate.selected);
    if (!videoRefForSubmission) {
      alert(t("clips.missingVideoError"));
      return;
    }
    if (selectedClips.length === 0) {
      toast.warning(t("clips.noSelectedClips"));
      return;
    }

    setIsExportingClips(true);
    try {
      const synthesisPreferences = restoreStoredSynthesisExecutionPreferences();
      const videoElement = videoRef.current;
      const renderOptions =
        renderMode === "burned"
          ? buildSynthesisOptionsFromPreferences(synthesisPreferences, {
              videoSize: videoElement
                ? {
                    w: videoElement.videoWidth,
                    h: videoElement.videoHeight,
                  }
                : null,
            })
          : null;
      let subtitleRefForSubmission: ReturnType<typeof resolveSubtitleReferenceForSavedPath> | null = null;
      if (renderMode === "burned" && !renderOptions?.skip_subtitles) {
        let srtPath: string | false = false;
        try {
          srtPath = await saveSubtitleFile(regions);
        } catch (error) {
          console.error("[EditorClips] Failed to save subtitles before clip export", error);
        }
        if (!srtPath || !currentFilePath) {
          toast.error(t("clips.exportSubtitleError"));
          return;
        }
        subtitleRefForSubmission = resolveSubtitleReferenceForSavedPath({
          currentFilePath,
          currentSubtitlePath,
          currentSubtitleRef,
          savedPath: srtPath,
        });
      }
      const watermarkPath =
        renderMode === "burned"
          ? await resolveSynthesisWatermarkPath(synthesisPreferences)
          : null;
      const exportPayload = {
        video_ref: videoRefForSubmission,
        render_mode: renderMode,
        srt_ref: subtitleRefForSubmission,
        watermark_path: watermarkPath,
        options: renderOptions,
        output_dir: synthesisPreferences.lastOutputDir,
        segments: selectedClips.map((candidate) => ({
          id: candidate.id,
          start: candidate.start,
          end: candidate.end,
          title: candidate.title,
        })),
      };
      const executionResult = await editorService.exportClipSegments(exportPayload);
      getExecutionSubmission(executionResult);
      addTask(
        createTaskFromExecutionOutcome({
          outcome: executionResult,
          type: "clip_export",
          name: currentFilePath
            ? `Export clips ${currentFilePath.split(/[\\/]/).pop()}`
            : "Export clips",
          request_params: exportPayload,
        }),
      );
      toast.success(t("clips.exportQueued", { count: selectedClips.length }));
    } catch (error) {
      console.error("[EditorClips] Failed to export clips", error);
      toast.error(t("clips.exportError"));
    } finally {
      setIsExportingClips(false);
    }
  };

  const handleClipContextMenu = (
    event: MouseEvent,
    id: string,
    regionData?: { start: number; end: number },
  ) => {
    event.preventDefault();
    setActiveClipId(id);
    const clip = clipCandidates.find((candidate) => candidate.id === id);
    if (!clip) {
      if (!regionData || regionData.end <= regionData.start) return;
      setContextMenu({
        position: { x: event.clientX, y: event.clientY },
        targetId: id,
        items: [
          {
            label: t("clips.contextCreateFromSelection"),
            onClick: () => {
              const start = Number(regionData.start.toFixed(3));
              const end = Number(regionData.end.toFixed(3));
              const newClip: ClipCandidate = {
                id,
                start,
                end,
                title: t("clips.manualClipTitle", { index: clipCandidates.length + 1 }),
                reason: t("clips.manualClipReason"),
                score: 100,
                transcript: null,
                selected: true,
              };
              setClipCandidates((current) => [...current, newClip]);
              setActiveClipId(id);
            },
          },
          { separator: true, label: "", onClick: () => {} },
          { label: t("clips.contextCancel"), onClick: () => {} },
        ],
      });
      return;
    }

    setContextMenu({
      position: { x: event.clientX, y: event.clientY },
      targetId: id,
      items: [
        {
          label: t("clips.contextPlay"),
          onClick: () => {
            if (videoRef.current) {
              videoRef.current.currentTime = clip.start;
              videoRef.current.play();
            }
          },
        },
        {
          label: clip.selected
            ? t("clips.contextExclude")
            : t("clips.contextInclude"),
          onClick: () => handleToggleClipSelected(id),
        },
        {
          label: t("clips.contextExportSelected"),
          onClick: () => {
            void handleExportSelectedClips();
          },
        },
        { separator: true, label: "", onClick: () => {} },
        {
          label: t("clips.contextDelete"),
          danger: true,
          onClick: () => handleDeleteClip(id),
        },
      ],
    });
  };

  // ── Render ──────────────────────────────────────────────────
  return (
    <PageShell padded={false} className="flex flex-col">
        <EditorHeader
            mode={workspaceMode}
            onModeChange={setWorkspaceMode}
            onOpenFile={openFile}
            onOpenSubtitle={openSubtitle}
            onSave={handleSave}
            onSaveAs={() => saveSubtitleFile(regions, true)}
            onSynthesize={() => setShowSynthesis(true)}
            onTranslate={handleTranslate}
            onDetectHighlights={handleDetectHighlights}
            isDetectingHighlights={isDetectingHighlights}
            canDetectHighlights={hasSubtitleContent}
        />

        <div className="flex-1 flex min-h-0 bg-[#0a0a0a] gap-[1px]">
             {/* Left: Subtitle List */}
             <div className="w-[34%] min-w-[340px] max-w-[540px] flex flex-col bg-[#141414]"
                 onDrop={handleSubtitleDrop} onDragOver={handleDragOver}>
                 <div className="flex-1 min-h-0">
                     {workspaceMode === "subtitles" ? (
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
                            candidates={clipCandidates}
                            activeClipId={activeClipId}
                            isDetecting={isDetectingHighlights}
                            isExporting={isExportingClips}
                            canDetect={hasSubtitleContent}
                            onDetect={handleDetectHighlights}
                            onExportSelected={handleExportSelectedClips}
                            onExportSourceSelected={() => handleExportSelectedClips("source")}
                            onClipClick={handleClipClick}
                            onToggleSelected={handleToggleClipSelected}
                            onDeleteClip={handleDeleteClip}
                        />
                     )}
                 </div>

                 {/* Detail Editor */}
                 {workspaceMode === "clips" ? (
                    activeClip ? (
                        <div className="h-28 bg-[#151515] p-2 flex flex-col gap-1 border-t border-white/5 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.5)] z-20">
                            <div className="flex justify-between items-center text-[10px] px-1 select-none">
                                <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full ${activeClip.selected ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                                    <span className="font-bold text-slate-400 tracking-wider uppercase opacity-80">
                                        {t('clips.detailTitle')}
                                    </span>
                                </div>
                                <span className="font-mono text-amber-300/90 bg-amber-500/5 px-1 py-0 rounded border border-amber-500/10 text-[9px]">
                                    {(activeClip.end - activeClip.start).toFixed(2)}s · {activeClip.score.toFixed(1)}
                                </span>
                            </div>
                            <input
                                value={activeClip.title || ""}
                                onChange={(event) => updateClipCandidate(activeClip.id, { title: event.target.value })}
                                className="h-8 w-full bg-black/20 border border-white/5 rounded-lg px-2 text-sm focus:outline-none focus:border-amber-500/50 focus:bg-black/40 transition-all font-medium text-slate-200 placeholder-slate-600/50"
                                placeholder={t('clips.titlePlaceholder')}
                            />
                            <p className="min-h-0 flex-1 overflow-hidden px-1 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] text-[11px] leading-relaxed text-slate-500">
                                {activeClip.transcript || activeClip.reason || t('clips.noReason')}
                            </p>
                        </div>
                    ) : (
                        <div className="h-28 bg-[#151515] p-2 flex flex-col items-center justify-center border-t border-white/5 z-20 text-slate-700/50 text-xs italic pointer-events-none select-none">
                            {t('clips.noSelection')}
                        </div>
                    )
                 ) : displaySegment ? (
                    <div className="h-28 bg-[#151515] p-2 flex flex-col gap-1 border-t border-white/5 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.5)] z-20">
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
                    <div className="h-28 bg-[#151515] p-2 flex flex-col items-center justify-center border-t border-white/5 z-20 text-slate-700/50 text-xs italic pointer-events-none select-none">
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
             {mediaUrl && waveformReady && (
               <Suspense fallback={null}>
                 <WaveformPlayer
                    mediaUrl={mediaUrl}
                    videoRef={videoRef}
                    regions={workspaceMode === "clips" ? clipTimelineRegions : regions}
                    onRegionUpdate={workspaceMode === "clips" ? handleClipRegionUpdate : handleRegionUpdateCallback}
                     onRegionClick={workspaceMode === "clips" ? handleClipRegionClick : handleRegionClick}
                     onContextMenu={workspaceMode === "clips" ? handleClipContextMenu : handleContextMenu}
                     selectedIds={workspaceMode === "clips" ? selectedClipIds : selectedIds}
                     activeSegmentId={workspaceMode === "clips" ? activeClipId : activeSegmentId}
                     autoScroll={autoScroll}
                     onInteractStart={workspaceMode === "clips" ? undefined : snapshot}
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

                        const { output_ref, ...restOptions } = options;
                        const videoRefForSubmission = currentFileRef ?? normalizeMediaReference(currentFilePath, {
                            type: "video/mp4",
                            media_kind: "video",
                            role: "source",
                        });
                        const subtitleRefForSubmission = resolveSubtitleReferenceForSavedPath({
                            currentFilePath,
                            currentSubtitlePath,
                            currentSubtitleRef,
                            savedPath: srtPath,
                        });
                        if (!videoRefForSubmission || !subtitleRefForSubmission) {
                            alert(t('synthesis.missingFilesError'));
                            return;
                        }
                        const executionResult = await executionService.synthesize({
                            video_ref: videoRefForSubmission,
                            srt_ref: subtitleRefForSubmission,
                            watermark_path: watermarkPath,
                            output_ref,
                            options: restOptions,
                        });
                        getExecutionSubmission(executionResult);
                        addTask(
                            createTaskFromExecutionOutcome({
                                outcome: executionResult,
                                type: "synthesis",
                                name: currentFilePath
                                    ? `Synthesize ${currentFilePath.split(/[\\/]/).pop()}`
                                    : "Synthesize video",
                                request_params: {
                                    video_ref: videoRefForSubmission,
                                    subtitle_ref: subtitleRefForSubmission,
                                    watermark_path: watermarkPath,
                                    output_ref: output_ref ?? undefined,
                                    options: restOptions,
                                },
                            }),
                        );
                    }}
                />
            </Suspense>
        )}
    </PageShell>
  );
}
