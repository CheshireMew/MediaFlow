
import { useState, useRef, useEffect } from "react";
import { WaveformPlayer } from "../components/editor/WaveformPlayer";
import { SubtitleList } from "../components/editor/SubtitleList";
import { FindReplaceDialog } from "../components/dialogs/FindReplaceDialog";
import { Clapperboard, Save, Scissors, Wand2 } from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "../components/ui/ContextMenu";

// Custom Hooks
import { useEditorState } from "../hooks/editor/useEditorState";
import { useEditorIO } from "../hooks/editor/useEditorIO";
import { useEditorShortcuts } from "../hooks/editor/useEditorShortcuts";

export function EditorPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // --- UI State ---
  const [autoScroll, setAutoScroll] = useState(true);
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [peaks, setPeaks] = useState<any>(null);
  const [contextMenu, setContextMenu] = useState<{
      position: { x: number; y: number };
      items: ContextMenuItem[];
      targetId?: string;
  } | null>(null);

  // --- Domain Logic Hooks ---
  
  const {
      regions,
      setRegions, // Needed for IO
      activeSegmentId,
      selectedIds,
      undo,   // implicitly used by shortcuts? No, passed explicitly
      redo,
      deleteSegments,
      mergeSegments,
      splitSegment,
      updateRegion,
      updateRegionText,
      snapshot,
      selectSegment
  } = useEditorState([]);

  const {
      mediaUrl,
      openFile,
      savePeaks,
      saveSubtitleFile,
      detectSilence,
      isReady // <--- Destructure
  } = useEditorIO(setRegions, setPeaks);

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

  // State for Find & Replace dialog (moved before hook call)
  const [showFindReplace, setShowFindReplace] = useState(false);
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

  const handleRegionClick = (id: string, e?: MouseEvent | { ctrlKey: boolean, metaKey: boolean, shiftKey?: boolean, seek?: boolean }) => {
      const isMulti = e?.ctrlKey || e?.metaKey || false;
      const isRange = (e as any)?.shiftKey || false;
      const shouldSeek = (e as any)?.seek || false;

      selectSegment(id, isMulti, isRange);

      if (shouldSeek && videoRef.current) {
          const seg = regions.find(r => r.id === id);
          if (seg) videoRef.current.currentTime = seg.start;
      }
  };

  const handleTimeUpdate = () => {
      if(videoRef.current) {
          const t = videoRef.current.currentTime;
          setCurrentTime(t);
          
          if (autoScroll) {
              const playing = regions.find(r => t >= r.start && t < r.end);
              if (playing && playing.id !== playingSegmentId) {
                  setPlayingSegmentId(String(playing.id));
              } else if (!playing && playingSegmentId) {
                  setPlayingSegmentId(null);
              }
          }
      }
  };


  const handleContextMenu = (e: any, id: string) => {
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
      const indices = targetSelectedIds.map(sid => regions.findIndex(r => r.id === sid)).sort((a,b) => a-b);
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
                          const seg = regions.find(r => r.id === id);
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
  };

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

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
        {/* Header - Added pr-40 for Window Controls */}
        <header className="h-14 border-b border-slate-700 flex items-center justify-between pl-4 pr-40 bg-slate-900 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
            <div className="flex items-center gap-3 no-drag" style={{ WebkitAppRegion: 'no-drag' } as any}>
                <Clapperboard className="text-indigo-500" />
                <h1 className="font-bold text-lg">Editor Workspace</h1>
                <div className="h-4 w-[1px] bg-slate-700 mx-2"></div>
                <button onClick={openFile} className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1.5 rounded transition-colors">
                    Open Media
                </button>
            </div>
            <div className="flex items-center gap-2 no-drag" style={{ WebkitAppRegion: 'no-drag' } as any}>
                 <div className="flex items-center gap-2 mr-4">
                    <input 
                        type="checkbox" 
                        id="autoScroll" 
                        checked={autoScroll} 
                        onChange={(e) => setAutoScroll(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="autoScroll" className="text-xs text-slate-400 select-none cursor-pointer">Auto-Scroll</label>
                 </div>
                 
                 <button 
                    onClick={async () => {
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
                    }}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1.5 rounded text-sm transition-colors text-slate-300"
                    title="Auto-split by Silence"
                 >
                     <Wand2 size={16} /> <span className="hidden sm:inline">Smart Split</span>
                 </button>

                 <button 
                     onClick={handleSave}
                     className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 rounded text-sm font-medium transition-colors"
                 >
                     <Save size={16} /> Save
                 </button>
            </div>
        </header>

        {/* Main Workspace: Top Split */}
        <div className="flex-1 flex min-h-0">
             {/* Left: Subtitle List */}
             <div className="w-1/3 min-w-[280px] max-w-[500px] border-r border-slate-700 flex flex-col">
                 <div className="flex-1 min-h-0 bg-slate-800">
                     <SubtitleList 
                        segments={regions}
                        activeSegmentId={activeSegmentId}
                        playingSegmentId={playingSegmentId}
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
                    <div className="h-32 bg-slate-850 p-2 flex flex-col gap-1 border-t border-slate-700 bg-slate-900 shadow-[inset_0_4px_6px_-1px_rgb(0_0_0_/_0.3)] z-10 transition-all">
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
             <div className="flex-1 bg-black flex flex-col relative justify-center items-center">
                 {mediaUrl ? (
                     <div className="w-full h-full relative p-4 flex flex-col">
                         <div className="flex-1 relative flex items-center justify-center bg-black/50 rounded-lg overflow-hidden border border-slate-800">
                             <video 
                                ref={videoRef}
                                src={mediaUrl}
                                className="max-w-full max-h-full shadow-2xl"
                                controls={false} 
                                onTimeUpdate={handleTimeUpdate}
                                onClick={() => {
                                    if(videoRef.current?.paused) videoRef.current.play();
                                    else videoRef.current?.pause();
                                }}
                             />
                             {/* Overlay Subtitles */}
                             <div className="absolute bottom-8 left-0 right-0 text-center pointer-events-none">
                                 <span className="bg-black/60 text-white px-2 py-1 rounded text-lg font-medium shadow-sm backdrop-blur-sm">
                                     {regions.find(r => currentTime >= r.start && currentTime < r.end)?.text || ""}
                                 </span>
                             </div>
                         </div>
                         
                         {/* Mini Controls */}
                         <div className="h-12 flex items-center justify-center gap-4 bg-slate-900 border-t border-slate-800 mt-2 rounded-lg">
                             <span className="font-mono text-cyan-400 text-sm">
                                 {new Date(currentTime * 1000).toISOString().substr(11, 8)}
                             </span>
                             <button
                               onClick={() => videoRef.current && splitSegment(videoRef.current.currentTime)}
                               disabled={!activeSegmentId}
                               className="flex items-center gap-1 text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded disabled:opacity-50"
                               title="Split at Current Time"
                             >
                                 <Scissors size={14} /> Split
                             </button>
                         </div>
                     </div>
                 ) : (
                     <div className="text-slate-600 flex flex-col items-center">
                         <Clapperboard size={48} className="mb-4 opacity-50" />
                         <p>No media loaded</p>
                     </div>
                 )}
             </div>
        </div>
        
        {/* Bottom: Waveform Timeline */}
        <div className="h-48 min-h-[150px] bg-slate-900 border-t border-slate-700 relative z-20">
             {mediaUrl && (
                 <WaveformPlayer 
                    mediaUrl={mediaUrl}
                    videoRef={videoRef}
                    regions={regions}
                    onRegionUpdate={(id, start, end) => updateRegion(id, { start, end })}
                    onRegionClick={handleRegionClick}
                    onContextMenu={handleContextMenu}
                    peaks={peaks}
                    onPeaksGenerated={savePeaks}
                    selectedIds={selectedIds}
                    autoScroll={autoScroll}
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
    </div>
  );
}
