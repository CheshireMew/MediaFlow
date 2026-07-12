import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreprocessingStore } from '../stores/preprocessingStore';
import { useTaskContext } from '../context/taskContext';
import { fileService } from '../services/fileService';
import { translateTaskMessage } from '../services/ui/taskMessage';
import { normalizeMediaReference } from '../services/ui/mediaReference';
import { fileMatchesOpenDialogProfile } from '../contracts/openFileContract';
import {
    NavigationService,
    resolveNavigationMediaPayload,
    type NavigationPayload,
} from '../services/ui/navigation';
import {
    clearPendingMediaNavigation,
    consumePendingMediaNavigation,
    readPendingMediaNavigation,
} from '../services/ui/pendingMediaNavigation';
import {
    FolderOpen, Loader2, MousePointer2, Wand2,
    Upload, Film, X,
} from 'lucide-react';
import { EmptyState, PageHeader, PageShell, ToolbarButton } from '../components/ui/PageChrome';

import { PreprocessingToolsPanel } from '../components/preprocessing/PreprocessingToolsPanel';


// Extracted modules
import { useROIInteraction } from '../hooks/preprocessing/useROIInteraction';
import { useOCRProcessor } from '../hooks/preprocessing/useOCRProcessor';
import { getActivePreprocessingTask } from '../hooks/preprocessing/taskSelectors';
import { ProjectFileList } from '../components/preprocessing/ProjectFileList';
import { VideoControlBar } from '../components/preprocessing/VideoControlBar';

type DragFileWithPath = File & { path?: string };

type ElectronMediaFile = {
    path: string;
    name: string;
    size: number;
};

export const PreprocessingPage = () => {
    const fileProfile = 'preprocessing-media' as const;
    const { t } = useTranslation('preprocessing');
    const {
        preprocessingActiveTool,

        enhanceModel, enhanceScale, enhanceMethod,
        ocrEngine, cleanMethod,
        ocrResults,
        setOcrResults,
        preprocessingIsProcessing,
        currentPreprocessingTaskId,
        currentPreprocessingTaskVideoRef,
        preprocessingFiles, addPreprocessingFile, removePreprocessingFile, updatePreprocessingFile,
        preprocessingVideoRef, setPreprocessingVideoRef,
    } = usePreprocessingStore();



    // Aliases for cleaner usage
    const activeTool = preprocessingActiveTool;


    const files = preprocessingFiles;
    const videoPath = preprocessingVideoRef?.path ?? null;

    // ── Refs ─────────────────────────────────────────────────────
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);

    // ── Local transient state ────────────────────────────────────
    const [loadedMediaDimensions, setLoadedMediaDimensions] = useState<{
        sourcePath: string | null;
        w: number;
        h: number;
    }>({ sourcePath: null, w: 0, h: 0 });
    const mediaResolution = useMemo(
        () => loadedMediaDimensions.sourcePath === videoPath
            ? { w: loadedMediaDimensions.w, h: loadedMediaDimensions.h }
            : { w: 0, h: 0 },
        [loadedMediaDimensions, videoPath],
    );
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
        handleStartProcessing,
        processingOutcome,
        clearProcessingOutcome,
    } = useOCRProcessor({
        videoRef: preprocessingVideoRef, roi, canvasRef, videoResolution: mediaResolution,
        activeTool, ocrEngine, enhanceModel, enhanceScale, enhanceMethod, cleanMethod,
    });

    const { tasks } = useTaskContext();
    const currentTask = useMemo(() => (
        getActivePreprocessingTask(
            tasks,
            currentPreprocessingTaskId,
            currentPreprocessingTaskVideoRef,
            preprocessingVideoRef,
        )
    ), [currentPreprocessingTaskId, currentPreprocessingTaskVideoRef, preprocessingVideoRef, tasks]);
    const isCurrentFileProcessing = preprocessingIsProcessing && currentPreprocessingTaskVideoRef?.path === videoPath;
    const visibleProcessingOutcome = processingOutcome?.sourceRef.path === videoPath
        ? processingOutcome
        : null;
    const roiSelectionEnabled = activeTool === 'extract' || activeTool === 'clean';

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
            if (w <= 0 || h <= 0) return;
            setLoadedMediaDimensions({ sourcePath: videoPath, w, h });
            setDuration(videoRef.current.duration || 0);
            updatePreprocessingFile(videoPath, { resolution: `${w}x${h}` });
        }
    };

    const handleImageLoaded = (event: React.SyntheticEvent<HTMLImageElement>) => {
        if (!videoPath) return;
        const { naturalWidth: w, naturalHeight: h } = event.currentTarget;
        if (w <= 0 || h <= 0) return;
        setLoadedMediaDimensions({ sourcePath: videoPath, w, h });
        setDuration(0);
        updatePreprocessingFile(videoPath, { resolution: `${w}x${h}` });
    };

    const handleDoubleClick = useCallback(() => {
        if (videoRef.current) {
            if (videoRef.current.paused) {
                void videoRef.current.play();
            } else {
                videoRef.current.pause();
            }
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files[0] as DragFileWithPath | undefined;
        if (file && fileMatchesOpenDialogProfile(file, fileProfile)) {
            let path = file.path;
            if (!path) {
                try {
                    path = fileService.getPathForFile(file);
                } catch {
                    path = undefined;
                }
            }
            if (path) {
                addPreprocessingFile({ path, name: file.name, size: file.size });
                setPreprocessingVideoRef(
                    normalizeMediaReference({ path, name: file.name, size: file.size }),
                );
                setOcrResults([]);
                setRoi(null);
            }
        }
    }, [addPreprocessingFile, fileProfile, setPreprocessingVideoRef, setOcrResults, setRoi]);

    const handleImportMedia = async () => {
        try {
            const fileData = await fileService.openFile({
                profile: fileProfile,
            }) as ElectronMediaFile | null;

            if (fileData?.path) {
                addPreprocessingFile({ path: fileData.path, name: fileData.name, size: fileData.size });
                setPreprocessingVideoRef(
                    normalizeMediaReference(fileData),
                );
                setOcrResults([]);
                setRoi(null);
            }
        } catch (error) {
            console.error('Failed to import media:', error);
        }
    };

    const handleFileSelect = (file: (typeof files)[number]) => {
        setPreprocessingVideoRef(normalizeMediaReference(file));
        setOcrResults([]);
        setRoi(null);
    };

    const handleOpenProcessingOutput = () => {
        const outputPath = visibleProcessingOutcome?.outputRef?.path;
        if (!outputPath) return;
        void fileService.showInExplorer(outputPath).catch((error) => {
            console.error('Failed to reveal preprocessing output:', error);
        });
    };

    const applyPreprocessingPayload = useCallback((payload?: NavigationPayload | null) => {
        if (!payload) {
            return false;
        }

        const { videoRef } = resolveNavigationMediaPayload(payload);
        if (!videoRef) {
            return false;
        }
        const navigatedVideoPath = videoRef.path;

        const matchingFile = files.find((candidate) => candidate.path === navigatedVideoPath);
        setPreprocessingVideoRef({
            ...videoRef,
            name: videoRef.name || matchingFile?.name || videoRef.path,
            size: videoRef.size ?? matchingFile?.size,
        });
        setOcrResults([]);
        setRoi(null);
        return true;
    }, [files, setOcrResults, setPreprocessingVideoRef, setRoi]);

    useEffect(() => {
        const pendingFile = readPendingMediaNavigation();
        if (pendingFile && (!pendingFile.target || pendingFile.target === 'preprocessing')) {
            applyPreprocessingPayload(pendingFile);
            clearPendingMediaNavigation();
        }

        const cleanup = NavigationService.subscribe((detail) => {
            if (detail.destination === 'preprocessing') {
                if (applyPreprocessingPayload(detail.payload)) {
                    consumePendingMediaNavigation(detail.payload);
                }
            }
        });

        return cleanup;
    }, [applyPreprocessingPayload]);

    // ── Render ───────────────────────────────────────────────────
    return (
        <PageShell padded={false} className="flex flex-col">
            <PageHeader
                icon={Wand2}
                title={t('title')}
                subtitle={t('subtitle')}
                actions={(
                    <ToolbarButton onClick={handleImportMedia} icon={Upload} variant="subtle" className="text-xs">
                        {t('importButton')}
                    </ToolbarButton>
                )}
            />

            <div className="flex flex-1 min-h-0 flex-col">
                {visibleProcessingOutcome && (
                    <div
                        role={visibleProcessingOutcome.status === 'failed' ? 'alert' : 'status'}
                        className={`mx-4 mt-4 flex shrink-0 items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                            visibleProcessingOutcome.status === 'completed'
                                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100'
                                : visibleProcessingOutcome.status === 'failed'
                                    ? 'border-rose-500/25 bg-rose-500/10 text-rose-100'
                                    : 'border-amber-500/25 bg-amber-500/10 text-amber-100'
                        }`}
                    >
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold">
                                {visibleProcessingOutcome.status === 'completed'
                                    ? t(`feedback.completed.${visibleProcessingOutcome.tool}`)
                                    : visibleProcessingOutcome.status === 'failed'
                                        ? t('feedback.failed')
                                        : t(`feedback.${visibleProcessingOutcome.status}`)}
                            </p>
                            {(visibleProcessingOutcome.detail || visibleProcessingOutcome.taskMessage) && (
                                <p className="mt-0.5 truncate text-xs opacity-75">
                                    {visibleProcessingOutcome.detail || (
                                        visibleProcessingOutcome.taskMessage
                                            ? translateTaskMessage(t, visibleProcessingOutcome.taskMessage)
                                            : null
                                    )}
                                </p>
                            )}
                        </div>
                        {visibleProcessingOutcome.status === 'completed' && visibleProcessingOutcome.outputRef?.path && (
                            <button
                                type="button"
                                onClick={handleOpenProcessingOutput}
                                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 text-xs font-semibold transition-colors hover:bg-emerald-400/20 focus:outline-none focus:ring-2 focus:ring-emerald-300/60"
                            >
                                <FolderOpen size={15} />
                                {t('feedback.openOutput')}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={clearProcessingOutcome}
                            className="rounded-md p-1.5 opacity-70 transition-colors hover:bg-white/10 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/30"
                            title={t('feedback.dismiss')}
                            aria-label={t('feedback.dismiss')}
                        >
                            <X size={15} />
                        </button>
                    </div>
                )}

                <div className="flex flex-1 min-h-0 max-lg:flex-col max-lg:overflow-y-auto lg:overflow-hidden">
                {/* Left: Project Files */}
                <ProjectFileList
                    files={files}
                    selectedPath={videoPath}
                    onSelect={handleFileSelect}
                    onRemove={removePreprocessingFile}
                />

                {/* Center: Canvas / Preview */}
                <div className="relative flex flex-1 flex-col bg-[#0a0a0a] max-lg:min-h-[360px] max-lg:shrink-0">
                    {/* Interaction status: panning is intentionally not exposed until implemented. */}
                    <div
                        role="status"
                        className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#1a1a1a] px-3 py-2 text-xs text-slate-300 shadow-xl"
                    >
                        <MousePointer2 size={16} className={roiSelectionEnabled ? 'text-indigo-400' : 'text-slate-400'} />
                        <span>
                            {t(roiSelectionEnabled ? 'toolbar.selectionActive' : 'toolbar.previewOnly')}
                        </span>
                    </div>

                    {/* ── Layer 1: Video + ROI ── */}
                    <div className="relative flex flex-1 items-center justify-center overflow-hidden p-8 max-lg:p-4">
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
                                            alt={t('canvas.previewAlt')}
                                            onLoad={handleImageLoaded}
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
                                <EmptyState
                                    icon={Film}
                                    title={t('canvas.noVideoMessage')}
                                    description={t('canvas.dragHelpText')}
                                    className="absolute inset-0 pointer-events-none select-none"
                                />
                            )}

                            {/* ROI Box */}
                            {roi && (
                                <div
                                    className={`absolute border-2 border-indigo-500 bg-indigo-500/10 group
                                        ${interactionMode === 'idle' ? 'hover:bg-indigo-500/20' : ''}`}
                                    style={{ left: roi.x, top: roi.y, width: roi.w, height: roi.h }}
                                >
                                    <span className="text-xs bg-indigo-500 text-white px-1 absolute -top-4 left-0 pointer-events-none shadow-sm">ROI</span>
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
                            <span className="text-xs text-slate-400 italic">{t('subtitleBar.noSubtitle')}</span>
                        )}
                    </div>

                    {/* ── Layer 3: Playback Controls ── */}
                    <VideoControlBar videoRef={videoRef as React.RefObject<HTMLVideoElement>} currentTime={currentTime} duration={duration} />

                    {/* Progress Bar Overlay */}
                    {isCurrentFileProcessing && (
                        <div className="absolute bottom-[80px] left-0 right-0 bg-[#1a1a1a]/90 backdrop-blur-sm border-t border-indigo-500/30 p-2 z-30 animate-in slide-in-from-bottom-2">
                            {(() => {
                                if (currentTask) return (
                                    <div className="flex items-center gap-4 px-4">
                                        <Loader2 className="animate-spin text-indigo-400" size={16} />
                                        <div className="flex-1">
                                            <div className="flex justify-between text-xs mb-1">
                                                <span className="text-slate-200 font-medium">{translateTaskMessage(t, currentTask)}</span>
                                                <span className="text-indigo-400 font-mono">{currentTask.progress.toFixed(0)}%</span>
                                            </div>
                                            <div className="h-1 bg-slate-700/50 rounded-full overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300" style={{ width: `${currentTask.progress}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                );
                                return (
                                    <div className="flex items-center justify-center gap-2 text-xs text-slate-300 py-1">
                                        <Loader2 className="animate-spin text-indigo-400" size={14} />
                                        <span>{t('button.processingLabel')}</span>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </div>

                {/* Right: Tools Panel */}
                <PreprocessingToolsPanel
                    isProcessing={isCurrentFileProcessing}
                    roi={roi}
                    hasVideo={Boolean(preprocessingVideoRef)}
                    ocrResults={ocrResults.map((r, i) => ({ ...r, id: i }))}
                    onStartProcessing={handleStartProcessing}
                    onClearRoi={() => setRoi(null)}
                />
                </div>
            </div>
        </PageShell>
    );
};
