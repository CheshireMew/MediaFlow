// ── Unified Video Export Dialog — Slim Orchestration Shell ──
// All state logic lives in hooks, all UI sections live in subcomponents.
// This component only handles: hook wiring, export submission, and dialog layout.

import React, { useState, useRef, useEffect } from 'react';
import { MonitorPlay } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SubtitleSegment } from '../../types/task';
import { useSubtitleStyle } from './synthesis/hooks/useSubtitleStyle';
import { useWatermark } from './synthesis/hooks/useWatermark';
import { useOutputSettings } from './synthesis/hooks/useOutputSettings';
import { useCrop } from './synthesis/hooks/useCrop';
import { SubtitleStylePanel } from './synthesis/components/SubtitleStylePanel';
import { WatermarkPanel } from './synthesis/components/WatermarkPanel';
import { OutputSettingsPanel } from './synthesis/components/OutputSettingsPanel';
import { VideoPreview } from './synthesis/components/VideoPreview';
import {
    buildSynthesisOptionsFromPreferences,
    editorService,
    getVideoExportClipDuration,
    resolvePreviewViewportMetrics,
    resolveSynthesisWatermarkPath,
    type VideoExportScope,
    type VideoExportSubmission,
} from '../../services/domain';
import { normalizeMediaReference, type MediaReference } from '../../services/ui/mediaReference';
import {
    restoreStoredSynthesisExecutionPreferences,
    type SynthesisExecutionPreferences,
    updateStoredSynthesisExecutionPreferences,
} from '../../services/persistence/synthesisExecutionPreferences';

const PREVIEW_VISIBLE_FRAME_OFFSET_SECONDS = 1 / 30;
const PROBE_FAILURE_FALLBACK_VISIBLE_START_SECONDS = 2 / 30;

function resolvePreviewVisibleStart(visibleStart: number) {
    if (visibleStart <= 0) {
        return 0;
    }
    return visibleStart + PREVIEW_VISIBLE_FRAME_OFFSET_SECONDS;
}

interface VideoExportDialogProps {
    isOpen: boolean;
    onClose: () => void;
    regions: SubtitleSegment[];
    videoPath: string | null;
    mediaUrl: string | null;
    exportScope: VideoExportScope;
    onExport: (
        submission: VideoExportSubmission,
        videoPath: string,
    ) => Promise<boolean>;
}

export const VideoExportDialog: React.FC<VideoExportDialogProps> = ({
    isOpen, onClose, regions, videoPath, mediaUrl, exportScope, onExport
}) => {
    const { t } = useTranslation('synthesis');
    const [persistedPreferences, setPersistedPreferences] = useState(() => restoreStoredSynthesisExecutionPreferences());
    // --- Shared refs ---
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });
    const [currentTime, setCurrentTime] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mediaVisibleStart, setMediaVisibleStart] = useState(0);
    const [activeClipIndex, setActiveClipIndex] = useState(0);
    const isClipExport = exportScope.kind === "clips";
    const clipSegments = exportScope.kind === "clips" ? exportScope.segments : [];
    const activeClip = clipSegments[activeClipIndex] ?? null;
    const firstClipStart = clipSegments[0]?.start ?? 0;
    const subtitleAvailable = regions.some((region) => region.text.trim().length > 0);
    const clipDuration = getVideoExportClipDuration(exportScope);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setPersistedPreferences(restoreStoredSynthesisExecutionPreferences());
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || isClipExport || mediaVisibleStart <= 0 || !videoRef.current) {
            return;
        }

        const target = videoRef.current;
        const nextPreviewStart = resolvePreviewVisibleStart(mediaVisibleStart);
        let cancelled = false;

        const seekToVisibleFrame = () => {
            if (cancelled) {
                return;
            }
            target.currentTime = nextPreviewStart;
            setCurrentTime(nextPreviewStart);
        };

        if (target.readyState >= HTMLMediaElement.HAVE_METADATA) {
            seekToVisibleFrame();
        } else {
            target.addEventListener("loadedmetadata", seekToVisibleFrame, { once: true });
            target.addEventListener("canplay", seekToVisibleFrame, { once: true });
        }

        return () => {
            cancelled = true;
            target.removeEventListener("loadedmetadata", seekToVisibleFrame);
            target.removeEventListener("canplay", seekToVisibleFrame);
        };
    }, [isClipExport, isOpen, mediaUrl, mediaVisibleStart]);

    useEffect(() => {
        if (!isOpen) {
            setVideoSize({ w: 0, h: 0 });
            setCurrentTime(0);
            setMediaVisibleStart(0);
            return;
        }

        setVideoSize({ w: 0, h: 0 });
        setCurrentTime(isClipExport ? firstClipStart : 0);
        setMediaVisibleStart(0);
        setActiveClipIndex(0);
    }, [firstClipStart, isClipExport, isOpen, videoPath, mediaUrl]);

    useEffect(() => {
        if (!isOpen || isClipExport || !videoPath) {
            return;
        }

        const videoRefForProbe = normalizeMediaReference(videoPath, {
            type: "video/mp4",
            media_kind: "video",
            role: "source",
        });
        if (!videoRefForProbe) {
            return;
        }

        let cancelled = false;
        void editorService
            .getMediaVisibleStart({ video_ref: videoRefForProbe })
            .then((result) => {
                if (cancelled) {
                    return;
                }
                const nextVisibleStart = result.has_leading_black
                    ? Math.max(0, result.visible_start)
                    : 0;
                setMediaVisibleStart(nextVisibleStart);
                if (nextVisibleStart > 0) {
                    const nextPreviewStart = resolvePreviewVisibleStart(nextVisibleStart);
                    setCurrentTime(nextPreviewStart);
                    if (videoRef.current) {
                        videoRef.current.currentTime = nextPreviewStart;
                    }
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setMediaVisibleStart(PROBE_FAILURE_FALLBACK_VISIBLE_START_SECONDS);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [isClipExport, isOpen, videoPath, mediaUrl]);

    useEffect(() => {
        if (!isOpen || !activeClip || !videoRef.current) return;

        const video = videoRef.current;
        const seekToClip = () => {
            video.pause();
            video.currentTime = activeClip.start;
            setCurrentTime(activeClip.start);
        };
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
            seekToClip();
        } else {
            video.addEventListener("loadedmetadata", seekToClip, { once: true });
        }
        return () => video.removeEventListener("loadedmetadata", seekToClip);
    }, [activeClip, isOpen]);

    // --- Toggle switches with shared settings persistence ---
    const [subtitleEnabled, setSubtitleEnabled] = useState(() => {
        return persistedPreferences.subtitleEnabled;
    });
    const [watermarkEnabled, setWatermarkEnabled] = useState(() => {
        return persistedPreferences.watermarkEnabled;
    });
    const togglesInitialized = useRef(false);

    useEffect(() => {
        if (!isOpen) {
            togglesInitialized.current = false;
            return;
        }

        togglesInitialized.current = false;
        const timer = setTimeout(() => {
            setSubtitleEnabled(persistedPreferences.subtitleEnabled);
            setWatermarkEnabled(persistedPreferences.watermarkEnabled);
            togglesInitialized.current = true;
        }, 0);

        return () => clearTimeout(timer);
    }, [isOpen, persistedPreferences]);

    useEffect(() => {
        if (!togglesInitialized.current) {
            return;
        }

        updateStoredSynthesisExecutionPreferences({
            subtitleEnabled,
            watermarkEnabled,
        });
    }, [subtitleEnabled, watermarkEnabled]);

    const crop = useCrop(isOpen, videoPath);
    const outputViewportMetrics = resolvePreviewViewportMetrics({
        sourceWidth: videoSize.w,
        sourceHeight: videoSize.h,
        crop: crop.isEnabled ? crop.crop : null,
    });

    // --- Hooks ---
    const style = useSubtitleStyle(
        isOpen,
        regions,
        currentTime,
        {
            w: outputViewportMetrics.outputSourceWidth,
            h: outputViewportMetrics.outputSourceHeight,
        },
        videoPath,
        persistedPreferences,
    );
    const watermark = useWatermark(
        isOpen,
        {
            w: outputViewportMetrics.outputSourceWidth,
            h: outputViewportMetrics.outputSourceHeight,
        },
        persistedPreferences,
    );
    const output = useOutputSettings(
        isOpen,
        videoPath,
        persistedPreferences,
        exportScope.kind,
    );

    // --- Export action (cross-cutting: reads from all settings hooks) ---
    const handleExport = async () => {
        if (!videoPath || isSubmitting) return;
        
        setIsSubmitting(true);
        try {
            const effectiveSubtitleEnabled = subtitleAvailable && subtitleEnabled;
            const effectiveTargetResolution =
                isClipExport && output.targetResolution.startsWith("sr_")
                    ? "original"
                    : output.targetResolution;
            const effectivePreferences: SynthesisExecutionPreferences = {
                ...persistedPreferences,
                subtitleEnabled: effectiveSubtitleEnabled,
                watermarkEnabled,
                quality: output.quality,
                useGpu: output.useGpu,
                targetResolution: effectiveTargetResolution,
                lastOutputDir: output.outputDir,
                subtitleStyle: {
                    ...persistedPreferences.subtitleStyle,
                    fontName: style.fontName,
                    fontSize: style.fontSize,
                    fontColor: style.fontColor,
                    isBold: style.isBold,
                    isItalic: style.isItalic,
                    outlineSize: style.outlineSize,
                    shadowSize: style.shadowSize,
                    outlineColor: style.outlineColor,
                    bgEnabled: style.bgEnabled,
                    bgColor: style.bgColor,
                    bgOpacity: style.bgOpacity,
                    bgPadding: style.bgPadding,
                    alignment: style.alignment,
                    multilineAlign: style.multilineAlign,
                    subPos: style.subPos,
                    customPresets: style.customPresets,
                },
                watermark: {
                    ...persistedPreferences.watermark,
                    wmScale: watermark.wmScale,
                    wmOpacity: watermark.wmOpacity,
                    wmPos: watermark.wmPos,
                    hasCustomLayout: true,
                },
            };

            const options = buildSynthesisOptionsFromPreferences(
                effectivePreferences,
                {
                    targetResolution: effectiveTargetResolution,
                    trimStart: isClipExport ? undefined : Math.max(output.trimStart, mediaVisibleStart),
                    trimEnd: isClipExport ? undefined : output.trimEnd,
                    crop: crop.isEnabled ? crop.crop : null,
                    videoSize,
                },
            );

            let outputRef: MediaReference | null = null;
            if (!isClipExport && output.outputDir && output.outputFilename) {
                const sep = output.outputDir.includes('\\') ? '\\' : '/';
                const cleanDir = output.outputDir.endsWith(sep) ? output.outputDir.slice(0, -1) : output.outputDir;
                const targetPath = `${cleanDir}${sep}${output.outputFilename}`;
                outputRef = normalizeMediaReference(targetPath, {
                        type: "video/mp4",
                        media_kind: "video",
                        role: "output",
                        origin: "task",
                    });
            }

            const effectiveWatermarkPath = watermarkEnabled
                ? watermark.watermarkPath ?? await resolveSynthesisWatermarkPath(effectivePreferences)
                : null;
            const submitted = await onExport(
                {
                    options,
                    outputRef,
                    outputDir: output.outputDir,
                    watermarkPath: effectiveWatermarkPath,
                    subtitleEnabled: effectiveSubtitleEnabled,
                    watermarkEnabled,
                },
                videoPath,
            );
            if (submitted) onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div 
                className="relative bg-[#0a0a0a] w-[95vw] h-[90vh] rounded-lg border border-white/10 shadow-2xl flex overflow-hidden ring-1 ring-white/5"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties & { WebkitAppRegion: 'no-drag' }}
                aria-busy={isSubmitting}
                onKeyDownCapture={(event) => {
                    if (!isSubmitting) return;
                    event.preventDefault();
                    event.stopPropagation();
                }}
            >
                {/* Left: Settings Panel */}
                <div className="w-[340px] bg-[#161616] flex flex-col border-r border-white/5 z-10 shrink-0">
                    <div className="p-6 pb-4">
                        <h2 className="text-xl font-bold flex items-center gap-3 text-white tracking-tight">
                            <div className="p-2 bg-indigo-500/20 rounded-lg">
                                <MonitorPlay size={20} className="text-indigo-400"/>
                            </div>
                            {isClipExport ? t('clipExport.title') : t('title')}
                        </h2>
                        {isClipExport && (
                            <p className="mt-2 text-xs text-slate-500">
                                {t('clipExport.summary', {
                                    count: clipSegments.length,
                                    duration: clipDuration.toFixed(1),
                                })}
                            </p>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-0 flex flex-col gap-6">
                        <SubtitleStylePanel
                            style={style}
                            enabled={subtitleAvailable && subtitleEnabled}
                            available={subtitleAvailable}
                            onToggle={setSubtitleEnabled}
                        />
                        <OutputSettingsPanel
                            output={output}
                            batchMode={isClipExport}
                            batchCount={clipSegments.length}
                        />
                        <WatermarkPanel watermark={watermark} enabled={watermarkEnabled} onToggle={setWatermarkEnabled} />
                    </div>
                </div>

                {/* Right: Preview Area */}
                <VideoPreview
                    mediaUrl={mediaUrl}
                    style={style}
                    watermark={watermark}
                    output={output}
                    crop={crop}
                    subtitleEnabled={subtitleAvailable && subtitleEnabled}
                    watermarkEnabled={watermarkEnabled}
                    onClose={onClose}
                    onExportClick={handleExport}
                    isSubmitting={isSubmitting}
                    videoRef={videoRef}
                    setVideoSize={setVideoSize}
                    currentTime={currentTime}
                    onTimeUpdate={setCurrentTime}
                    previewRange={activeClip ? { start: activeClip.start, end: activeClip.end } : null}
                    clipNavigator={activeClip ? {
                        index: activeClipIndex,
                        count: clipSegments.length,
                        title: activeClip.title || t('clipExport.untitled'),
                        onPrevious: () => setActiveClipIndex((current) => Math.max(0, current - 1)),
                        onNext: () => setActiveClipIndex((current) => Math.min(clipSegments.length - 1, current + 1)),
                    } : null}
                    allowTrim={!isClipExport}
                    actionLabel={isClipExport
                        ? t('clipExport.startExport', { count: clipSegments.length })
                        : t('preview.startExport')}
                />
                {isSubmitting && (
                    <div
                        className="absolute inset-0 z-[200] cursor-wait"
                        aria-hidden="true"
                    />
                )}
            </div>
        </div>
    );
};
