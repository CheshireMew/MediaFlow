
import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import { WaveformPlayer } from "../components/editor/WaveformPlayer";
import { SubtitleList } from "../components/editor/SubtitleList";
import { FindReplaceDialog } from "../components/dialogs/FindReplaceDialog";
import { SynthesisDialog } from "../components/dialogs/SynthesisDialog";
import { ContextMenu, type ContextMenuItem } from "../components/ui/ContextMenu";
import { apiClient } from "../api/client";

// Extracted Components
import { EditorHeader } from "../components/editor/EditorHeader";
import { VideoPreview } from "../components/editor/VideoPreview";

// Custom Hooks
import { useEditorIO } from "../hooks/editor/useEditorIO";
import { useEditorShortcuts } from "../hooks/editor/useEditorShortcuts";
import { useEditorActions } from "../hooks/editor/useEditorActions";
import { useContextMenuBuilder } from "../hooks/editor/useContextMenuBuilder";
import { useEditorStore } from "../stores/editorStore";

export function EditorPage() {
  const { t } = useTranslation('editor');
  const videoRef = useRef<HTMLVideoElement>(null);

  // ── UI State ────────────────────────────────────────────────
  const [autoScroll, setAutoScroll] = useState(true);
  const [peaks, setPeaks] = useState<any>(null);
  const [showFindReplace, setShowFindReplace] = useState<{ isOpen: boolean; mode: 'find' | 'replace' }>({ isOpen: false, mode: 'find' });
  const [searchTerm, setSearchTerm] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [showSynthesis, setShowSynthesis] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
      position: { x: number; y: number };
      items: ContextMenuItem[];
      targetId?: string;
  } | null>(null);

  // ── Store ───────────────────────────────────────────────────
  const regions = useEditorStore(state => state.regions);
  const setRegions = useEditorStore(state => state.setRegions);
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

  // ── IO Hook ─────────────────────────────────────────────────
  const {
      mediaUrl, openFile, savePeaks, saveSubtitleFile,
      detectSilence, isReady, currentFilePath,
      loadVideo, loadSubtitleFromPath,
  } = useEditorIO(setPeaks);

  // ── Action Hooks ────────────────────────────────────────────
  const { handleSave, handleTranslate, handleSmartSplit } = useEditorActions({
      currentFilePath, regions: regions as any, saveSubtitleFile,
      detectSilence, setRegions, videoRef,
  });

  const { handleContextMenu } = useContextMenuBuilder({
      regions: regions as any, selectedIds, currentFilePath, videoRef,
      selectSegment, addSegment, addSegments, updateSegments,
      mergeSegments, splitSegment, deleteSegments, setContextMenu,
  });

  // ── Shortcuts ───────────────────────────────────────────────
  useEditorShortcuts({
      videoRef, selectedIds, activeSegmentId,
      undo, redo, deleteSegments, splitSegment,
      onSave: handleSave,
      onToggleFindReplace: (mode: 'find' | 'replace') => setShowFindReplace(prev => ({ isOpen: !prev.isOpen, mode: !prev.isOpen ? mode : prev.mode })),
  });

  // ── Persistence & Safety ────────────────────────────────────
  const regionsRef = useRef(regions);
  useEffect(() => {
    regionsRef.current = regions;
    if (isReady) localStorage.setItem("editor_last_subtitles", JSON.stringify(regions));
  }, [regions, isReady]);

  useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
          if (regionsRef.current.length > 0) { e.preventDefault(); e.returnValue = ''; }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // ── View Handlers ───────────────────────────────────────────
  const handleRegionClick = useCallback((id: string, e?: MouseEvent | { ctrlKey: boolean, metaKey: boolean, shiftKey?: boolean, seek?: boolean }) => {
      selectSegment(id, e?.ctrlKey || e?.metaKey || false, (e as any)?.shiftKey || false);
      if ((e as any)?.seek && videoRef.current) {
          const seg = regionsRef.current.find(r => r.id === id);
          if (seg) videoRef.current.currentTime = seg.start;
      }
  }, [selectSegment]);

  // Detail Editor
  const displaySegment = regions.find(r => r.id === activeSegmentId);
  const handleDetailUpdate = (field: 'start' | 'end' | 'text', value: string | number) => {
      if (!displaySegment) return;
      const id = String(displaySegment.id);
      if (field === 'text') {
          updateRegionText(id, value as string);
      } else {
          snapshot(); snapshot();
          updateRegion(id, { [field]: value });
      }
  };

  const handleRegionUpdateCallback = useCallback((id: string, start: number, end: number) => {
      updateRegion(id, { start, end });
  }, [updateRegion]);

  // ── Drag & Drop ─────────────────────────────────────────────
  const handleVideoDrop = useCallback(async (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      const file = e.dataTransfer.files[0];
      if (file) {
          let path = (file as any).path;
          if (!path && window.electronAPI?.getPathForFile) path = window.electronAPI.getPathForFile(file);
          if (path) await loadVideo(path);
      }
  }, [loadVideo]);

  const handleSubtitleDrop = useCallback(async (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      const file = e.dataTransfer.files[0];
      const name = file?.name?.toLowerCase() ?? '';
      if (file && (name.endsWith('.srt') || name.endsWith('.vtt') || name.endsWith('.ass') || name.endsWith('.ssa') || name.endsWith('.sub') || name.endsWith('.txt') || name.endsWith('.lrc'))) {
          let path = (file as any).path;
          if (!path && window.electronAPI?.getPathForFile) path = window.electronAPI.getPathForFile(file);
          if (path) await loadSubtitleFromPath(path);
      }
  }, [loadSubtitleFromPath]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };

  // ── Playback Persistence ────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentFilePath) return;
    const saveTime = () => { if (video.currentTime > 0) localStorage.setItem(`playback_pos_${currentFilePath}`, String(video.currentTime)); };
    const interval = setInterval(saveTime, 5000);
    video.addEventListener('pause', saveTime);
    return () => { saveTime(); clearInterval(interval); video.removeEventListener('pause', saveTime); };
  }, [currentFilePath]);

  const handleLoadedMetadata = useCallback(() => {
      if (currentFilePath && videoRef.current) {
          const saved = localStorage.getItem(`playback_pos_${currentFilePath}`);
          if (saved) {
              const time = parseFloat(saved);
              if (!isNaN(time) && time > 0 && time < videoRef.current.duration) videoRef.current.currentTime = time;
          }
      }
  }, [currentFilePath]);

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="h-screen w-full flex flex-col text-slate-100 overflow-hidden">
        <EditorHeader
            autoScroll={autoScroll}
            setAutoScroll={setAutoScroll}
            onOpenFile={openFile}
            onSave={handleSave}
            onSaveAs={() => saveSubtitleFile(regions, true)}
            onSmartSplit={handleSmartSplit}
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
                        onSegmentClick={(id, multi, shift) => handleRegionClick(id, { ctrlKey: multi, metaKey: false, shiftKey: shift, seek: false })}
                        onSegmentDelete={(id) => deleteSegments([id])}
                        onSegmentMerge={(ids) => mergeSegments(ids)}
                        onSegmentDoubleClick={(id) => {
                            const seg = regions.find(r => r.id === id);
                            if (seg && videoRef.current) videoRef.current.currentTime = seg.start;
                        }}
                        onContextMenu={handleContextMenu}
                        onAutoFix={(newSegments) => setRegions(newSegments)}
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
                    peaks={peaks}
                    onPeaksGenerated={savePeaks}
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
            onClose={() => setShowFindReplace({ ...showFindReplace, isOpen: false })}
            regions={regions}
            onSelectSegment={(id) => selectSegment(id, false, false)}
            onUpdateSegment={(id, text) => updateRegion(id, { text })}
            onUpdateSegments={updateSegments}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            matchCase={matchCase}
            setMatchCase={setMatchCase}
        />

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
                    // Fallback to guessing if save failed but user wants to proceed
                    if (currentFilePath) {
                        srtPath = currentFilePath.replace(/\.[^.]+$/, '.srt');
                    }
                }
                
                if (!srtPath || !currentFilePath) {
                    alert(t('synthesis.missingFilesError'));
                    return;
                }

                const { output_path, ...restOptions } = options;
                await apiClient.synthesizeVideo({
                    video_path: currentFilePath,
                    srt_path: srtPath as string,
                    watermark_path: watermarkPath,
                    output_path: output_path,
                    options: restOptions,
                });
            }}
        />
    </div>
  );
}
