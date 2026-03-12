import { useState, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreprocessingStore } from '../stores/preprocessingStore';
import { useTaskContext } from '../context/TaskContext';
import {
    Wand2,
    Upload, Film, Move, MousePointer2, Loader2,
} from 'lucide-react';

import { PreprocessingToolsPanel } from '../components/preprocessing/PreprocessingToolsPanel';


// Extracted modules
import { useROIInteraction } from '../hooks/preprocessing/useROIInteraction';
import { useOCRProcessor } from '../hooks/preprocessing/useOCRProcessor';
import { ProjectFileList } from '../components/preprocessing/ProjectFileList';
import { VideoControlBar } from '../components/preprocessing/VideoControlBar';

export const PreprocessingPage = () => {
    const { t } = useTranslation('preprocessing');
    const {
        preprocessingActiveTool,

        enhanceModel, enhanceScale, enhanceMethod,
        ocrEngine, cleanMethod,
        preprocessingFiles, addPreprocessingFile, removePreprocessingFile, updatePreprocessingFile,
        preprocessingVideoPath, setPreprocessingVideoPath,
    } = usePreprocessingStore();



    // Aliases for cleaner usage
    const activeTool = preprocessingActiveTool;


    const files = preprocessingFiles;
    const videoPath = preprocessingVideoPath;
    const setVideoPath = setPreprocessingVideoPath;

    // ── Refs ─────────────────────────────────────────────────────
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    // ── Local transient state ────────────────────────────────────
    const [videoResolution, setVideoResolution] = useState({ w: 1920, h: 1080 });
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    // ── Composed hooks ───────────────────────────────────────────
    const {
        roi, setRoi, interactionMode,
        handleMouseDown, handleMouseMove, handleMouseUp,
    } = useROIInteraction({
        canvasRef,
        enabled: activeTool === 'extract' || activeTool === 'clean',
    });

    const {
        isProcessing, ocrResults, setOcrResults,
        handleStartProcessing,
    } = useOCRProcessor({
        videoPath, roi, canvasRef, videoResolution,
        activeTool, ocrEngine, enhanceModel, enhanceScale, enhanceMethod, cleanMethod,
    });

    const { tasks } = useTaskContext();

    // ── Video Helpers ────────────────────────────────────────────
    const handleTimeUpdate = useCallback(() => {
        if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
    }, []);

    const currentSubtitle = useMemo(
        () => ocrResults.find(r => currentTime >= r.start && currentTime < r.end)?.text || '',
        [ocrResults, currentTime],
    );

    const handleVideoLoaded = () => {
        if (videoRef.current && videoPath) {
            const w = videoRef.current.videoWidth;
            const h = videoRef.current.videoHeight;
            setVideoResolution({ w, h });
            setDuration(videoRef.current.duration || 0);
            updatePreprocessingFile(videoPath, { resolution: `${w}x${h}` });
        }
    };

    const handleDoubleClick = useCallback(() => {
        if (videoRef.current) {
            videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files[0];
        if (file) {
            let path = (file as any).path;
            if (!path && (window as any).electronAPI?.getPathForFile) {
                path = (window as any).electronAPI.getPathForFile(file);
            }
            if (path) {
                addPreprocessingFile({ path, name: file.name, size: file.size });
                setVideoPath(path);
                setOcrResults([]);
                setRoi(null);
            }
        }
    }, [addPreprocessingFile, setVideoPath, setOcrResults, setRoi]);

    const handleImportMedia = async () => {
        try {
            const fileData = await (window as any).electronAPI.openFile();
// ...
    // ── Render ───────────────────────────────────────────────────
// ...

            if (fileData?.path) {
                addPreprocessingFile({ path: fileData.path, name: fileData.name, size: fileData.size });
                setVideoPath(fileData.path);
                setOcrResults([]);
                setRoi(null);
            }
        } catch (error) {
            console.error('Failed to import media:', error);
        }
    };

    const handleFileSelect = (path: string) => {
        setVideoPath(path);
        setOcrResults([]);
        setRoi(null);
    };

    // ── Render ───────────────────────────────────────────────────
    return (
        <div className="w-full h-full flex flex-col bg-[#0f0f0f] text-slate-200 overflow-hidden">
            {/* Header */}
            <header className="flex-none h-14 border-b border-white/5 bg-[#1a1a1a] flex items-center justify-between pl-6 pr-36 drag-region relative z-50">
                <div className="flex items-center gap-3 no-drag">
                    <div className="p-2 bg-indigo-500/10 rounded-lg">
                        <Wand2 size={18} className="text-indigo-400" />
                    </div>
                    <span className="font-bold tracking-tight">{t('title')}</span>
                </div>
                <div className="flex items-center gap-2 no-drag">
                    <button
                        onClick={handleImportMedia}
                        className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 flex items-center gap-2 transition-all"
                    >
                        <Upload size={14} /> {t('importButton')}
                    </button>
                </div>
            </header>

            <div className="flex-1 flex min-h-0">
                {/* Left: Project Files */}
                <ProjectFileList
                    files={files}
                    selectedPath={videoPath}
                    onSelect={handleFileSelect}
                    onRemove={removePreprocessingFile}
                />

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

                    {/* ── Layer 1: Video + ROI ── */}
                    <div className="flex-1 flex items-center justify-center p-8 overflow-hidden relative">
                        <div
                            ref={canvasRef}
                            className={`aspect-video w-[80%] bg-[#121212] border border-white/5 rounded-lg shadow-2xl relative overflow-hidden group
                                ${(activeTool === 'extract' || activeTool === 'clean') ? 'cursor-crosshair' : 'cursor-default'}`}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onDoubleClick={handleDoubleClick}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                        >
                            {videoPath ? (
                                    videoPath.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                                        <img
                                            src={`file:///${encodeURI(videoPath.replace(/\\/g, '/')).replace(/#/g, '%23')}`}
                                            className="w-full h-full object-contain relative z-0"
                                            alt="Preview"
                                        />
                                    ) : (
                                        <video
                                            ref={videoRef}
                                            src={`file:///${encodeURI(videoPath.replace(/\\/g, '/')).replace(/#/g, '%23')}`}
                                            className="w-full h-full object-contain relative z-0"
                                            onLoadedMetadata={handleVideoLoaded}
                                            onTimeUpdate={handleTimeUpdate}
                                        />
                                    )
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-700 pointer-events-none select-none">
                                    <Film size={48} className="mb-4 opacity-50" />
                                    <span className="font-mono text-sm">{t('canvas.noVideoMessage')}</span>
                                    <span className="text-xs mt-2 text-slate-600">{t('canvas.dragHelpText')}</span>
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
                                    <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-indigo-500 rounded-sm cursor-nw-resize hover:scale-125 transition-transform" />
                                    <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-indigo-500 rounded-sm cursor-ne-resize hover:scale-125 transition-transform" />
                                    <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-indigo-500 rounded-sm cursor-sw-resize hover:scale-125 transition-transform" />
                                    <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-indigo-500 rounded-sm cursor-se-resize hover:scale-125 transition-transform" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Layer 2: Subtitle Bar ── */}
                    <div className="h-10 bg-[#111] border-t border-white/5 flex items-center justify-center px-6">
                        {currentSubtitle ? (
                            <span className="text-sm text-white/90 font-medium truncate max-w-full">
                                {currentSubtitle}
                            </span>
                        ) : (
                            <span className="text-xs text-slate-600 italic">{t('subtitleBar.noSubtitle')}</span>
                        )}
                    </div>

                    {/* ── Layer 3: Playback Controls ── */}
                    <VideoControlBar videoRef={videoRef as React.RefObject<HTMLVideoElement>} currentTime={currentTime} duration={duration} />

                    {/* Progress Bar Overlay */}
                    {isProcessing && (
                        <div className="absolute bottom-[80px] left-0 right-0 bg-[#1a1a1a]/90 backdrop-blur-sm border-t border-indigo-500/30 p-2 z-30 animate-in slide-in-from-bottom-2">
                            {(() => {
                                const task = tasks.find(t => ['running', 'pending', 'queued'].includes(t.status));
                                if (task) return (
                                    <div className="flex items-center gap-4 px-4">
                                        <Loader2 className="animate-spin text-indigo-400" size={16} />
                                        <div className="flex-1">
                                            <div className="flex justify-between text-[10px] mb-1">
                                                <span className="text-slate-200 font-medium">{task.message || 'Processing...'}</span>
                                                <span className="text-indigo-400 font-mono">{task.progress.toFixed(0)}%</span>
                                            </div>
                                            <div className="h-1 bg-slate-700/50 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300" style={{ width: `${task.progress}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                );
                                return (
                                    <div className="flex items-center justify-center gap-2 text-xs text-slate-300 py-1">
                                        <Loader2 className="animate-spin text-indigo-400" size={14} />
                                        <span>Processing...</span>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </div>

                {/* Right: Tools Panel */}
                <PreprocessingToolsPanel
                    isProcessing={isProcessing}
                    roi={roi}
                    videoPath={videoPath}
                    ocrResults={ocrResults.map((r, i) => ({ ...r, id: i }))}
                    onStartProcessing={handleStartProcessing}
                />
            </div>
        </div>
    );
};
