
import { useState, useRef, useEffect, useCallback } from "react";
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
// Custom Hooks
import { useEditorIO } from "../hooks/editor/useEditorIO";
import { useEditorShortcuts } from "../hooks/editor/useEditorShortcuts";
import { useEditorStore } from "../stores/editorStore";

export function EditorPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // --- UI State ---
  const [autoScroll, setAutoScroll] = useState(true);
  const [peaks, setPeaks] = useState<any>(null);
  const [contextMenu, setContextMenu] = useState<{
      position: { x: number; y: number };
      items: ContextMenuItem[];
      targetId?: string;
  } | null>(null);

  // --- Domain Logic (Zustand Store) ---
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

  const {
      mediaUrl,
      openFile,
      savePeaks,
      saveSubtitleFile,
      detectSilence,
      isReady,
      currentFilePath 
  } = useEditorIO(setPeaks);

  // --- Persistence & Safety ---

  // Ref for 'regions' current value for beforeunload without triggering effect re-run
  const regionsRef = useRef(regions);
  // const undoStackSizeRef = useRef(0); // REMOVED unused ref

  useEffect(() => {
    regionsRef.current = regions;
    
    // Auto-Save to LocalStorage
    // ONLY if IO is ready (restoration complete)
    if (isReady) {
        localStorage.setItem("editor_last_subtitles", JSON.stringify(regions));
    }
  }, [regions, isReady]);

  useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
          if (regionsRef.current.length > 0) {
              e.preventDefault();
              e.returnValue = ''; // Chrome requires this
          }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const handleSave = async () => {
      try {
          await saveSubtitleFile(regions);
          alert("Saved successfully!");
      } catch (e) {
          alert("Failed to save file. See console.");
      }
  };

  const handleSmartSplit = async () => {
        if (!confirm("Start Smart Split (Voice Detection)?\n\nThis will OVERWRITE segments based on detected voice activity (non-silence).")) return;
        
        try {
            const silences = await detectSilence(); // returns [start, end][] of SILENCE
            const duration = videoRef.current?.duration || 0;
            
            if (silences && silences.length > 0 && duration > 0) {
                const speechSegments: {start: number, end: number}[] = [];
                let lastEnd = 0;

                // Invert silence to get speech
                // Silence: [0, 2], [5, 8] -> Speech: [2, 5], [8, end]
                // Logic: Speech is from (lastEnd) to (currentSilenceStart)
                
                silences.forEach(([silStart, silEnd]) => {
                    if (silStart > lastEnd + 0.1) { // Min speech duration 0.1s
                        speechSegments.push({ start: lastEnd, end: silStart });
                    }
                    lastEnd = Math.max(lastEnd, silEnd);
                });

                // Add final segment if there's audio after last silence
                if (lastEnd < duration - 0.1) {
                    speechSegments.push({ start: lastEnd, end: duration });
                }

                const newSegments = speechSegments.map((seg, idx) => ({
                    id: String(idx + 1),
                    start: seg.start,
                    end: seg.end,
                    text: "" 
                }));
                
                setRegions(newSegments);
            } else {
                alert("No silence/speech pattern detected.");
            }
        } catch (e) {
            alert("Failed to run detection. " + e);
        }
  };

  // State for Find & Replace dialog (moved before hook call)
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showSynthesis, setShowSynthesis] = useState(false);

  useEditorShortcuts({
      videoRef,
      selectedIds,
      activeSegmentId,
      undo,
      redo,
      deleteSegments,
      splitSegment,
      onSave: handleSave,
      onToggleFindReplace: () => setShowFindReplace(prev => !prev)
  });


  // --- View Handlers ---

  const handleRegionClick = useCallback((id: string, e?: MouseEvent | { ctrlKey: boolean, metaKey: boolean, shiftKey?: boolean, seek?: boolean }) => {
      const isMulti = e?.ctrlKey || e?.metaKey || false;
      const isRange = (e as any)?.shiftKey || false;
      const shouldSeek = (e as any)?.seek || false;

      selectSegment(id, isMulti, isRange);

      if (shouldSeek && videoRef.current) {
          const seg = regionsRef.current.find(r => r.id === id); // Use ref for latest regions without dependency
          if (seg) videoRef.current.currentTime = seg.start;
      }
  }, [selectSegment]); // regionsRef is stable


  const handleContextMenu = useCallback((e: any, id: string) => {
      // Logic: If right click on unselected, select it.
      if (!selectedIds.includes(id)) {
          selectSegment(id, false, false);
      }
      
      // Determine selection (current state might not update immediately if we just called selectSegment? 
      // Actually setState is async. So we should use the 'id' processing logic here implies we trust the event target is now "active" contextually)
      // Ideally we use a 'target' derived list.
      const isSelected = selectedIds.includes(id);
      const targetSelectedIds = isSelected ? selectedIds : [id];

      // Check continuity
      const indices = targetSelectedIds.map(sid => regionsRef.current.findIndex(r => r.id === sid)).sort((a,b) => a-b);
      let isContinuous = targetSelectedIds.length >= 2;
      for (let i = 0; i < indices.length - 1; i++) {
          if (indices[i+1] !== indices[i] + 1) isContinuous = false;
      }

      setContextMenu({
          position: { x: e.clientX, y: e.clientY },
          targetId: id,
          items: (() => {
              const menu: any[] = [
                  {
                      label: "播放此片段",
                      onClick: () => {
                          const seg = regionsRef.current.find(r => r.id === id);
                          if (seg && videoRef.current) {
                              videoRef.current.currentTime = seg.start;
                              videoRef.current.play();
                          }
                      }
                  },
                  { separator: true, label: "", onClick: () => {} }
              ];

              if (isContinuous) {
                   menu.push({
                      label: `合并 ${targetSelectedIds.length} 个片段`,
                      disabled: false,
                      onClick: () => mergeSegments(targetSelectedIds)
                  });
              }

              menu.push({
                  label: "分割",
                  onClick: () => {
                      if (videoRef.current) {
                          splitSegment(videoRef.current.currentTime, id);
                      }
                  }
              });

              menu.push({ separator: true, label: "", onClick: () => {} });

              menu.push({
                  label: "删除",
                  danger: true,
                  onClick: () => {
                      if(confirm(`确定删除这 ${targetSelectedIds.length} 项吗?`)) {
                           deleteSegments(targetSelectedIds);
                      }
                  }
              });

              return menu;
          })()
      });
  }, [selectedIds, selectSegment, mergeSegments, splitSegment, deleteSegments]); // regionsRef stable

  // Detail Editor Helper
  const activeSegment = regions.find(r => r.id === activeSegmentId);
  const displaySegment = activeSegment || (regions.length > 0 ? regions[0] : null);
  const handleDetailUpdate = (field: 'start' | 'end' | 'text', value: string | number) => {
      if (!displaySegment) return;
      const id = String(displaySegment.id);

      if (field === 'text') {
          // Use the specific text updater which handles history
          updateRegionText(id, value as string);
      } else {
          // For start/end manual edits, we want to save a snapshot first
          // because updateRegion implies "drag/continuous update" and doesn't save history by itself
          snapshot();
          updateRegion(id, { [field]: value });
      }
  };
  const handleRegionUpdateCallback = useCallback((id: string, start: number, end: number) => {
      updateRegion(id, { start, end });
  }, [updateRegion]);

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
        {/* Header */}
        <EditorHeader 
            autoScroll={autoScroll}
            setAutoScroll={setAutoScroll}
            onOpenFile={openFile}
            onSave={handleSave}
            onSmartSplit={handleSmartSplit}
            onSynthesize={() => setShowSynthesis(true)}
        />

        {/* Main Workspace: Top Split */}
        <div className="flex-1 flex min-h-0">
             {/* Left: Subtitle List */}
             <div className="w-1/3 min-w-[280px] max-w-[500px] border-r border-slate-700 flex flex-col">
                 <div className="flex-1 min-h-0 bg-slate-800">
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
                        onAutoFix={(newSegments) => {
                            setRegions(newSegments);
                        }}
                     />
                 </div>
                 
                 {/* Simplified Detail Editor (Below List) */}
                 {displaySegment && (
                    <div className="h-24 bg-slate-850 p-2 flex flex-col gap-1 border-t border-slate-700 bg-slate-900 shadow-[inset_0_4px_6px_-1px_rgb(0_0_0_/_0.3)] z-10 transition-all">
                         <div className="flex justify-between items-center text-xs text-slate-500 px-1">
                             <span className="font-medium text-indigo-400">
                                {activeSegmentId ? "Editing Selection" : "Editing Default (First)"}
                             </span>
                             <span className="font-mono opacity-50">
                                {((displaySegment.end - displaySegment.start).toFixed(2))}s
                             </span>
                         </div>
                         <textarea 
                            value={displaySegment.text}
                            onChange={(e) => handleDetailUpdate('text', e.target.value)}
                            // Auto-select on focus if not selected?
                            onFocus={() => {
                                if (!activeSegmentId) selectSegment(String(displaySegment.id), false, false);
                            }}
                            className="flex-1 w-full bg-slate-800/50 border border-slate-700/50 rounded p-2 text-sm resize-none focus:outline-none focus:border-indigo-500/50 focus:bg-slate-800 transition-colors font-medium leading-relaxed"
                            placeholder="Enter subtitle text..."
                         />
                    </div>
                 )}
             </div>
             
             {/* Right: Video Preview */}
             <VideoPreview 
                mediaUrl={mediaUrl}
                videoRef={videoRef}
                regions={regions}
             />
        </div>
        
        {/* Bottom: Waveform Timeline */}
        <div className="h-36 bg-slate-900 border-t border-slate-700 relative z-20">
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
        
        {/* Context Menu */}
        <ContextMenu 
            items={contextMenu?.items || []}
            position={contextMenu?.position || null}
            onClose={() => setContextMenu(null)}
        />
        
        {/* Find & Replace Dialog */}
        <FindReplaceDialog 
            isOpen={showFindReplace}
            onClose={() => setShowFindReplace(false)}
            regions={regions}
            onSelectSegment={(id) => {
                selectSegment(id, false, false);
                // Also scroll/seek logic if needed? 
                // Currently selectSegment updates activeId, SubtitleList autoScrolls to active.
            }}
            onUpdateSegment={(id, text) => updateRegion(id, { text })}
        />
        
        {/* Synthesis Dialog */}
        <SynthesisDialog 
            isOpen={showSynthesis}
            onClose={() => setShowSynthesis(false)}
            regions={regions}
            videoPath={currentFilePath || (mediaUrl ? mediaUrl.replace('file:///', '') : null)}
            mediaUrl={mediaUrl}
            onSynthesize={async (options, videoPath, watermarkPath) => {
                // 1. Force Save FIRST to ensure SRT file on disk matches Editor content
                try {

                    await saveSubtitleFile(regions); // This saves to video.srt
                } catch (e) {
                    console.error("[EditorPage] Failed to save subtitles before synthesis", e);
                    if(!confirm("Failed to save subtitles. Synthesis will use the old file. Continue?")) {
                        return;
                    }
                }

                // 2. Trigger Synthesis
                // We assume saveSubtitleFile saved to videoPath.replace(ext, .srt)
                // So we derive srtPath same way
                const srtPath = videoPath.replace(/\.[^.]+$/, '.srt');
                const { output_path, ...restOptions } = options;
                // console.log("[EditorPage] Starting synthesis with:", { videoPath, srtPath, output_path });
                
                await apiClient.synthesizeVideo({
                    video_path: videoPath,
                    srt_path: srtPath,
                    watermark_path: watermarkPath,
                    output_path: output_path,
                    options: restOptions
                });
            }}
        />
    </div>
  );
}
