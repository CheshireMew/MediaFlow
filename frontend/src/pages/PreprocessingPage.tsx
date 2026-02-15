import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useTaskContext } from '../context/TaskContext';
import { 
    Wand2, Eraser, ScanText, MonitorPlay, 
    Upload, Image as ImageIcon, Film, 
    Move, MousePointer2, Loader2, X
} from 'lucide-react';
import type { TextEvent } from '../services/ocrService';
import { ocrService } from '../services/ocrService';

import { preprocessingService } from '../services/preprocessingService';
import { Select } from '../components/ui/Select';

export const PreprocessingPage = () => {
    const { 
        preprocessingActiveTool, setPreprocessingActiveTool,
        enhanceModel, setEnhanceModel,
        ocrEngine, setOcrEngine,
        preprocessingFiles, addPreprocessingFile, removePreprocessingFile, updatePreprocessingFile,
        preprocessingVideoPath, setPreprocessingVideoPath
    } = useEditorStore();

    // Map store state to local variables for cleaner usage below, or use directly
    const activeTool = preprocessingActiveTool;
    const setActiveTool = setPreprocessingActiveTool;
    const model = enhanceModel;
    const setModel = setEnhanceModel;
    // ocrEngine / setOcrEngine are already named correctly
    const files = preprocessingFiles;
    const videoPath = preprocessingVideoPath;
    const setVideoPath = setPreprocessingVideoPath;

    // Video Resolution State (Transient, no need to persist strictly unless needed)
    const [videoResolution, setVideoResolution] = useState({ w: 1920, h: 1080 });
    const videoRef = useRef<HTMLVideoElement>(null);

    // OCR State (Transient results)
    const [isProcessing, setIsProcessing] = useState(false);
    const [ocrResults, setOcrResults] = useState<TextEvent[]>([]);
    
    // Video playback time for subtitle overlay
    const [currentTime, setCurrentTime] = useState(0);
    
    // ROI State
    const [roi, setRoi] = useState<{x: number, y: number, w: number, h: number} | null>(null);

    // Interaction State
    type InteractionMode = 'idle' | 'drawing' | 'moving' | 'resizing';
    const [interactionMode, setInteractionMode] = useState<InteractionMode>('idle');
    const [resizeHandle, setResizeHandle] = useState<string | null>(null);
    const [dragStart, setDragStart] = useState<{x: number, y: number} | null>(null);
    const [snapshotRoi, setSnapshotRoi] = useState<{x: number, y: number, w: number, h: number} | null>(null);
    
    // Async Task State
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const { tasks } = useTaskContext();

    // Legacy drawing state
    const [startPos, setStartPos] = useState<{x: number, y: number} | null>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    // --- Video Playback Helpers ---
    const handleTimeUpdate = useCallback(() => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
        }
    }, []);

    // Current subtitle based on playback time
    const currentSubtitle = useMemo(() => 
        ocrResults.find(r => currentTime >= r.start && currentTime < r.end)?.text || "",
        [ocrResults, currentTime]
    );

    // --- Delete Key for ROI ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                // Only if no input/textarea is focused
                const tag = (e.target as HTMLElement)?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                if (roi) {
                    setRoi(null);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [roi]);

    // Helpers
    const HANDLE_SIZE = 10; // px
    const getResizeHandle = (x: number, y: number, rect: {x:number, y:number, w:number, h:number}) => {
        const { x: rx, y: ry, w, h } = rect;
        // Check corners (expand hit area slightly)
        const hit = (bx: number, by: number) => Math.abs(x - bx) <= HANDLE_SIZE && Math.abs(y - by) <= HANDLE_SIZE;
        
        if (hit(rx, ry)) return 'nw';
        if (hit(rx + w, ry)) return 'ne';
        if (hit(rx, ry + h)) return 'sw';
        if (hit(rx + w, ry + h)) return 'se';
        return null;
    };

    const isPointInside = (x: number, y: number, rect: {x:number, y:number, w:number, h:number}) => {
        return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    };

    const handleImportMedia = async () => {
        try {
            const fileData = await window.electronAPI.openFile() as any;
            if (fileData && fileData.path) { // IPC returns { path, name, size }
                const { path, name, size } = fileData as any;

                // Check if already exists in store
                // The store action addPreprocessingFile already handles duplication check, 
                // but we might want to switch to it even if it exists.
                
                const newFile = { path, name, size };
                addPreprocessingFile(newFile);
                
                // Select it
                setVideoPath(path);
                setOcrResults([]); 
                setRoi(null);
            }
        } catch (error) {
            console.error("Failed to import media:", error);
        }
    };

    const formatBytes = (bytes: number, decimals = 1) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    const handleVideoLoaded = () => {
        if (videoRef.current && videoPath) {
            const w = videoRef.current.videoWidth;
            const h = videoRef.current.videoHeight;
            setVideoResolution({ w, h });
            
            // Update file resolution in list using store action
            updatePreprocessingFile(videoPath, { resolution: `${w}x${h}` });
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (activeTool !== 'extract' && activeTool !== 'clean') return;
        if (!canvasRef.current) return;
        
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 1. Check existing ROI for resize/move
        if (roi) {
            const handle = getResizeHandle(x, y, roi);
            if (handle) {
                setInteractionMode('resizing');
                setResizeHandle(handle);
                setDragStart({ x, y });
                setSnapshotRoi(roi);
                return;
            }
            
            if (isPointInside(x, y, roi)) {
                setInteractionMode('moving');
                setDragStart({ x, y });
                setSnapshotRoi(roi);
                return;
            }
        }

        // 2. Default: Start Drawing New
        setInteractionMode('drawing');
        setStartPos({ x, y });
        setRoi({ x, y, w: 0, h: 0 });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        // Cursor Updates
        if (interactionMode === 'idle' && roi) {
            const handle = getResizeHandle(currentX, currentY, roi);
            if (handle) {
                canvasRef.current.style.cursor = `${handle}-resize`;
                return;
            }
            if (isPointInside(currentX, currentY, roi)) {
                canvasRef.current.style.cursor = 'move';
                return;
            }
            canvasRef.current.style.cursor = 'crosshair';
        }

        if (interactionMode === 'drawing' && startPos) {
            const w = Math.abs(currentX - startPos.x);
            const h = Math.abs(currentY - startPos.y);
            const x = Math.min(currentX, startPos.x);
            const y = Math.min(currentY, startPos.y);
            setRoi({ x, y, w, h });
        }
        else if (interactionMode === 'moving' && dragStart && snapshotRoi) {
            const dx = currentX - dragStart.x;
            const dy = currentY - dragStart.y;
            
            // Constrain to canvas
            let newX = snapshotRoi.x + dx;
            let newY = snapshotRoi.y + dy;
            
            // Simple bound check (optional, allows partial off-screen)
            newX = Math.max(0, Math.min(newX, rect.width - snapshotRoi.w));
            newY = Math.max(0, Math.min(newY, rect.height - snapshotRoi.h));

            setRoi({ ...snapshotRoi, x: newX, y: newY });
        }
        else if (interactionMode === 'resizing' && dragStart && snapshotRoi && resizeHandle) {
             const dx = currentX - dragStart.x;
             const dy = currentY - dragStart.y;
             
             let { x, y, w, h } = snapshotRoi;
             const MIN_SIZE = 10;
             
             // East: w changes, x fixed
             if (resizeHandle.includes('e')) {
                 w = Math.max(MIN_SIZE, snapshotRoi.w + dx);
             }
             
             // South: h changes, y fixed
             if (resizeHandle.includes('s')) {
                 h = Math.max(MIN_SIZE, snapshotRoi.h + dy);
             }
             
             // West: w changes, x moves. Anchor right edge.
             if (resizeHandle.includes('w')) {
                 const rightEdge = snapshotRoi.x + snapshotRoi.w;
                 w = Math.max(MIN_SIZE, snapshotRoi.w - dx);
                 x = rightEdge - w;
             }
             
             // North: h changes, y moves. Anchor bottom edge.
             if (resizeHandle.includes('n')) {
                 const bottomEdge = snapshotRoi.y + snapshotRoi.h;
                 h = Math.max(MIN_SIZE, snapshotRoi.h - dy);
                 y = bottomEdge - h;
             }
             
             setRoi({ x, y, w, h });
        }
    };

    const handleMouseUp = () => {
        setInteractionMode('idle');
        setDragStart(null);
        setSnapshotRoi(null);
        setResizeHandle(null);
    };

    const handleStartOCR = async () => {
        if (!videoPath) return;
        
        // Build ROI: if user drew a box, convert to video coords; otherwise omit (full frame)
        let videoROI: [number, number, number, number] | undefined;
        if (roi && canvasRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            const scaleX = videoResolution.w / rect.width;
            const scaleY = videoResolution.h / rect.height;
            videoROI = [
                Math.round(roi.x * scaleX),
                Math.round(roi.y * scaleY),
                Math.round(roi.w * scaleX),
                Math.round(roi.h * scaleY)
            ];
        }

        setIsProcessing(true);
        try {
            const res = await ocrService.extractText({
                video_path: videoPath,
                roi: videoROI,
                engine: 'rapid'
            });
            
            // Backend now returns task_id immediately
            setActiveTaskId(res.task_id);
            setOcrResults([]); // Clear previous results while processing
            
        } catch (error) {
            console.error("OCR Failed", error);
            setIsProcessing(false); 
        } 
    };

    // Watch for active task completion
    useEffect(() => {
        if (!activeTaskId) return;

        const task = tasks.find(t => t.id === activeTaskId);
        if (!task) return;

        if (task.status === 'completed') {
            setIsProcessing(false);
            setActiveTaskId(null);
            if (task.result && (task.result as any).events) {
                setOcrResults((task.result as any).events);
            } else {
                setOcrResults([]);
            }
        } else if (task.status === 'failed') {
            setIsProcessing(false);
            setActiveTaskId(null);
            console.error("OCR Task Failed:", task.error);
        } else {
            // Still running
            setIsProcessing(true);
        }
    }, [tasks, activeTaskId]);

    const handleStartProcessing = async () => {
        if (!videoPath) return;

        setIsProcessing(true);
        try {
            if (activeTool === 'enhance') {
                const res = await preprocessingService.enhanceVideo({
                    video_path: videoPath,
                    model: 'RealESRGAN-x4plus', // Todo: Get from UI state
                    scale: '4x'
                });
                console.log("Enhance started:", res);
                // In real app, poll for status or show notification
            } else if (activeTool === 'clean') {
                 // Check if ROI exists for clean tool? For now assumes full frame or requires ROI logic update
                 const cleanRoi : [number, number, number, number] = roi ? [roi.x, roi.y, roi.w, roi.h] : [0,0,0,0];
                 
                 const res = await preprocessingService.cleanVideo({
                    video_path: videoPath,
                    roi: cleanRoi,
                    method: 'telea'
                 });
                 console.log("Clean started:", res);
            } else if (activeTool === 'extract') {
                 await handleStartOCR();
            }
        } catch (error) {
            console.error("Processing failed:", error);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-[#0f0f0f] text-slate-200 overflow-hidden">
             {/* Header */}
             <header className="flex-none h-14 border-b border-white/5 bg-[#1a1a1a] flex items-center justify-between pl-6 pr-36 drag-region relative z-50">
                 <div className="flex items-center gap-3 no-drag">
                    <div className="p-2 bg-indigo-500/10 rounded-lg">
                        <Wand2 size={18} className="text-indigo-400" />
                    </div>
                    <span className="font-bold tracking-tight">Preprocessing Lab</span>
                 </div>
                 
                 <div className="flex items-center gap-2 no-drag">
                     <button 
                        onClick={handleImportMedia}
                        className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 flex items-center gap-2 transition-all"
                     >
                        <Upload size={14} /> Import Media
                     </button>
                 </div>
             </header>

             <div className="flex-1 flex min-h-0">
                 {/* Left: Media Library (Mini) */}
                 <div className="w-64 bg-[#141414] border-r border-white/5 flex flex-col">
                     <div className="p-4 border-b border-white/5 pb-2">
                         <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Project Files</h3>
                     </div>
                     <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                         {files.length === 0 ? (
                             <div className="p-4 text-center text-xs text-slate-600 italic">
                                 No files imported
                             </div>
                         ) : (
                             files.map((file) => (
                                 <div 
                                    key={file.path} 
                                    onClick={() => {
                                        setVideoPath(file.path);
                                        setOcrResults([]);
                                        setRoi(null);
                                    }}
                                    className={`p-3 rounded-xl border cursor-pointer flex gap-3 transition-all group/file
                                        ${videoPath === file.path 
                                            ? 'bg-indigo-500/10 border-indigo-500/30 shadow-sm' 
                                            : 'bg-[#1a1a1a] border-white/5 hover:bg-white/5 hover:border-white/10'
                                        }`}
                                 >
                                     <div className="w-12 h-12 rounded-lg bg-black/40 flex items-center justify-center flex-shrink-0">
                                         {file.name.endsWith('.mp4') || file.name.endsWith('.mov') || file.name.endsWith('.mkv') 
                                            ? <Film size={18} className={videoPath === file.path ? "text-indigo-400" : "text-slate-500"} /> 
                                            : <ImageIcon size={18} className="text-slate-500" />
                                         }
                                     </div>
                                     <div className="flex-1 min-w-0 flex flex-col justify-center">
                                         <div className={`text-sm font-medium truncate ${videoPath === file.path ? 'text-indigo-200' : 'text-slate-300'}`}>
                                             {file.name}
                                         </div>
                                         <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-2">
                                             <span>{formatBytes(file.size)}</span>
                                             {file.resolution && (
                                                 <>
                                                    <span className="w-0.5 h-0.5 bg-slate-600 rounded-full"></span>
                                                    <span>{file.resolution}</span>
                                                 </>
                                             )}
                                         </div>
                                     </div>
                                     {/* Delete Button */}
                                     <button
                                         onClick={(e) => {
                                             e.stopPropagation();
                                             removePreprocessingFile(file.path);
                                         }}
                                         className="self-center p-1 rounded-md opacity-0 group-hover/file:opacity-100 hover:bg-rose-500/20 text-slate-600 hover:text-rose-400 transition-all"
                                         title="Remove from list"
                                     >
                                         <X size={14} />
                                     </button>
                                 </div>
                             ))
                         )}
                     </div>
                 </div>

                 {/* Center: Canvas / Preview */}
                 <div className="flex-1 bg-[#0a0a0a] flex flex-col relative">
                     {/* Toolbar Overlay */}
                     <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-[#1a1a1a] border border-white/10 rounded-full px-2 py-1 flex items-center gap-1 shadow-xl">
                         <button className="p-2 hover:bg-white/10 rounded-full text-indigo-400" title="Select">
                             <MousePointer2 size={16} />
                         </button>
                         <div className="w-[1px] h-4 bg-white/10 mx-1"></div>
                         <button className="p-2 hover:bg-white/10 rounded-full text-slate-400" title="Pan">
                             <Move size={16} />
                         </button>
                     </div>

                     <div className="flex-1 flex items-center justify-center p-8 overflow-hidden relative">
                         {/* Mock Canvas Content */}
                         <div 
                            ref={canvasRef}
                            className={`aspect-video w-[80%] bg-[#121212] border border-white/5 rounded-lg shadow-2xl relative overflow-hidden group 
                                ${(activeTool === 'extract' || activeTool === 'clean') ? 'cursor-crosshair' : 'cursor-default'}`}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                         >
                             {videoPath ? (
                                      <>
                                      <video
                                          ref={videoRef}
                                          src={`file://${videoPath}`}
                                          className="w-full h-full object-contain relative z-0"
                                          controls
                                          onLoadedMetadata={handleVideoLoaded}
                                          onTimeUpdate={handleTimeUpdate}
                                      />
                                      {/* Subtitle Overlay */}
                                      {currentSubtitle && (
                                          <div className="absolute bottom-16 left-0 right-0 text-center pointer-events-none px-12 z-10">
                                              <span className="inline-block bg-black/60 text-white/95 px-6 py-3 rounded-xl text-lg md:text-xl font-medium shadow-lg backdrop-blur-md border border-white/10 leading-relaxed max-w-full break-words">
                                                  {currentSubtitle}
                                              </span>
                                          </div>
                                      )}
                                      </>
                             ) : (
                                 <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-700 pointer-events-none select-none">
                                     <Film size={48} className="mb-4 opacity-50" />
                                     <span className="font-mono text-sm">[ No Video Selected ]</span>
                                     <span className="text-xs mt-2 text-slate-600">Click "Import Media" to start</span>
                                 </div>
                             )}
                             
                             {/* ROI Box */}
                             {roi && (
                                 <div 
                                    className={`absolute border-2 border-indigo-500 bg-indigo-500/10 group
                                        ${interactionMode === 'idle' ? 'hover:bg-indigo-500/20' : ''}`}
                                    style={{ left: roi.x, top: roi.y, width: roi.w, height: roi.h }}
                                 >
                                     <span className="text-[10px] bg-indigo-500 text-white px-1 absolute -top-4 left-0 pointer-events-none shadow-sm">ROI</span>
                                     
                                     {/* Resize Handles */}
                                     {/* NW */}
                                     <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-indigo-500 rounded-sm cursor-nw-resize hover:scale-125 transition-transform" />
                                     {/* NE */}
                                     <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-indigo-500 rounded-sm cursor-ne-resize hover:scale-125 transition-transform" />
                                     {/* SW */}
                                     <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-indigo-500 rounded-sm cursor-sw-resize hover:scale-125 transition-transform" />
                                     {/* SE */}
                                     <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-indigo-500 rounded-sm cursor-se-resize hover:scale-125 transition-transform" />
                                 </div>
                             )}
                         </div>
                     </div>

                      {/* Canvas Footer (Progress Bar Overlay) */}
                      {(activeTaskId || isProcessing) && (
                          <div className="absolute bottom-0 left-0 right-0 bg-[#1a1a1a]/90 backdrop-blur-sm border-t border-indigo-500/30 p-2 z-30 animate-in slide-in-from-bottom-2">
                              {(() => {
                                  const task = tasks.find(t => t.id === activeTaskId) || tasks.find(t => t.type === 'download' && t.status === 'running');
                                  
                                  if (task) {
                                      return (
                                          <div className="flex items-center gap-4 px-4">
                                              <Loader2 className="animate-spin text-indigo-400" size={16} />
                                              <div className="flex-1">
                                                  <div className="flex justify-between text-[10px] mb-1">
                                                      <span className="text-slate-200 font-medium">{task.message || 'Processing...'}</span>
                                                      <span className="text-indigo-400 font-mono">{task.progress.toFixed(0)}%</span>
                                                  </div>
                                                  <div className="h-1 bg-slate-700/50 rounded-full overflow-hidden">
                                                      <div 
                                                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                                                          style={{ width: `${task.progress}%` }}
                                                      />
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  }
                                  
                                  // Fallback generic processing
                                  return (
                                     <div className="flex items-center justify-center gap-2 text-xs text-slate-300 py-1">
                                         <Loader2 className="animate-spin text-indigo-400" size={14} />
                                         <span>Processing...</span>
                                     </div>
                                  );
                              })()}
                          </div>
                      )}

                      {/* Canvas Footer (Info) */}
                      <div className="h-12 border-t border-white/5 bg-[#141414] flex items-center px-6 justify-between text-xs text-slate-500 font-mono">
                          <div>1920 x 1080</div>
                          <div>Zoom: 100%</div>
                      </div>
                  </div>

                 {/* Right: Tools Panel */}
                 <div className="w-80 bg-[#141414] border-l border-white/5 flex flex-col">
                     {/* Tool Tabs */}
                     <div className="flex p-1 gap-1 border-b border-white/5">
                         {[
                             { id: 'enhance', icon: MonitorPlay, label: 'Quality' },
                             { id: 'clean', icon: Eraser, label: 'Cleanup' },
                             { id: 'extract', icon: ScanText, label: 'OCR' },
                         ].map(tab => (
                             <button 
                                key={tab.id}
                                onClick={() => setActiveTool(tab.id as any)}
                                className={`flex-1 py-3 flex flex-col items-center gap-1.5 rounded-lg text-[10px] font-medium transition-all
                                    ${activeTool === tab.id 
                                        ? 'bg-white/5 text-indigo-400 shadow-sm' 
                                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]'
                                    }`}
                             >
                                 <tab.icon size={18} />
                                 {tab.label}
                             </button>
                         ))}
                     </div>

                     {/* Tool Settings Area */}
                     <div className="flex-1 p-6 overflow-y-auto">
                        {activeTool === 'enhance' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div>
                                    <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                        <MonitorPlay size={16} className="text-indigo-500" />
                                        Super Resolution
                                    </h4>
                                    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                                        Upscale low-resolution footage using AI models trained for realism.
                                    </p>
                                </div>
                                
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-slate-400">Model</label>
                                        <Select
                                            value={model} 
                                            onChange={(val) => setModel(val as string)}
                                            options={[
                                                { value: 'RealESRGAN-x4plus', label: 'RealESRGAN-x4plus' },
                                                { value: 'RealESRGAN-x4plus-anime', label: 'RealESRGAN-x4plus-anime' }
                                            ]}
                                        />
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-slate-400">Scale Factor</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {['2x', '4x', '8x'].map(s => (
                                                <button key={s} className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg py-2 text-xs font-bold transition-colors focus:ring-1 ring-indigo-500">
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTool === 'clean' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div>
                                    <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                        <Eraser size={16} className="text-rose-500" />
                                        Watermark Removal
                                    </h4>
                                    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                                        Select areas to remove. The AI will inpaint the selected region temporally.
                                    </p>
                                </div>
                                
                                <button className="w-full py-3 border border-dashed border-white/20 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-slate-400 hover:text-white hover:border-white/40 hover:bg-white/5 transition-all">
                                    <Move size={14} /> Draw Selection Box
                                </button>
                                
                                <div className="space-y-2">
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Regions</div>
                                    <div className="bg-black/20 rounded-lg p-3 border border-white/5 flex justify-between items-center group">
                                        <span className="text-xs">Region #1</span>
                                        <button className="text-slate-600 hover:text-rose-500"><Eraser size={14} /></button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTool === 'extract' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col h-full">
                                <div>
                                    <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                        <ScanText size={16} className="text-emerald-500" />
                                        Text Extraction (OCR)
                                    </h4>
                                    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                                        Draw a box on the video to define the extraction area (ROI).
                                    </p>
                                </div>

                                <div className="space-y-4">
                                    <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                                        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">ROI Coordinates</div>
                                        <div className="font-mono text-xs text-emerald-400">
                                            {roi 
                                                ? `x:${Math.round(roi.x)} y:${Math.round(roi.y)} w:${Math.round(roi.w)} h:${Math.round(roi.h)}`
                                                : 'No selection'
                                            }
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-slate-400">OCR Engine</label>
                                        <Select
                                            value={ocrEngine}
                                            onChange={(val) => setOcrEngine(val as string)}
                                            options={[
                                                { value: 'rapid', label: 'RapidOCR (Default)' },
                                                { value: 'paddle', label: 'PaddleOCR' }
                                            ]}
                                        />
                                    </div>
                                    

                                </div>

                                {/* Results List */}
                                <div className="flex-1 min-h-0 flex flex-col mt-4 border-t border-white/5 pt-4">
                                     <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                                        <span>Results ({ocrResults.length})</span>
                                     </div>
                                     <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                         {ocrResults.map((event, idx) => (
                                             <div key={idx} className="bg-white/5 p-2 rounded-lg border border-white/5 flex gap-2">
                                                 <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                                                     {event.start.toFixed(1)}s
                                                 </div>
                                                 <div className="text-xs text-slate-200">
                                                     {event.text}
                                                 </div>
                                             </div>
                                         ))}
                                         {ocrResults.length === 0 && !isProcessing && (
                                             <div className="flex flex-col items-center justify-center py-8 text-slate-600 gap-2">
                                                 <ScanText size={24} className="opacity-20" />
                                                 <span className="text-xs italic">No text found in selected region</span>
                                             </div>
                                         )}
                                     </div>
                        </div>
                            </div>
                        )}
                     </div>

                     {/* Action Button */}
                     <div className="p-6 border-t border-white/5 bg-[#141414]">
                        <button 
                            onClick={handleStartProcessing}
                            // Enhanced Logic:
                            // - Standard check: video must be loaded
                            // - Extract: ROI must be set
                            // - Clean: ROI must be set (assuming interaction required)
                            disabled={!videoPath || isProcessing || (activeTool === 'clean' && !roi)}
                            className={`w-full h-12 rounded-xl font-bold text-sm shadow-lg transition-all flex items-center justify-center gap-2
                                ${(!videoPath || isProcessing || (activeTool === 'clean' && !roi))
                                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none' 
                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'
                                }`}
                        >
                            {isProcessing ? <Loader2 className="animate-spin" size={16} /> : (
                                <>
                                    {activeTool === 'enhance' && <MonitorPlay size={16} />}
                                    {activeTool === 'clean' && <Eraser size={16} />}
                                    {activeTool === 'extract' && <ScanText size={16} />}
                                </>
                            )}
                            
                            <span>
                                {isProcessing ? 'Processing...' : (() => {
                                    if (!videoPath) return 'Import Media to Start';
                                    if (activeTool === 'clean' && !roi) return 'Draw Area to Clean';
                                    
                                    if (activeTool === 'enhance') return 'Start Enhancement';
                                    if (activeTool === 'clean') return 'Start Cleanup';
                                    if (activeTool === 'extract') return roi ? 'Run OCR Extraction (ROI)' : 'Run OCR Extraction (Full)';
                                    return 'Start Processing';
                                })()}
                            </span>
                        </button>
                     </div>
                 </div>
             </div>
        </div>
    );
};
