// ── SynthesisDialog — Slim Orchestration Shell ──
// All state logic lives in hooks, all UI sections live in subcomponents.
// This component only handles: hook wiring, handleSynthesize, and dialog layout.

import React, { useState, useRef, useEffect } from 'react';
import { MonitorPlay } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SubtitleSegment } from '../../types/task';
import type { SynthesizeOptions } from '../../types/api';
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
    resolvePreviewViewportMetrics,
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

interface SynthesisDialogProps {
    isOpen: boolean;
    onClose: () => void;
    regions: SubtitleSegment[];
    videoPath: string | null;
    mediaUrl: string | null;
    onSynthesize?: (
        options: SynthesizeOptions & { output_ref?: MediaReference | null },
        videoPath: string,
        watermarkPath: string | null,
    ) => Promise<void>;
}

export const SynthesisDialog: React.FC<SynthesisDialogProps> = ({ 
    isOpen, onClose, regions, videoPath, mediaUrl, onSynthesize
}) => {
    const { t } = useTranslation('synthesis');
    const [persistedPreferences, setPersistedPreferences] = useState(() => restoreStoredSynthesisExecutionPreferences());
    // --- Shared refs ---
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });
    const [currentTime, setCurrentTime] = useState(0);
    const [isSynthesizing, setIsSynthesizing] = useState(false);
    const [synthesisProgress, setSynthesisProgress] = useState(0);
    const [synthesisMessage, setSynthesisMessage] = useState('');
    const [mediaVisibleStart, setMediaVisibleStart] = useState(0);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setPersistedPreferences(restoreStoredSynthesisExecutionPreferences());
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || mediaVisibleStart <= 0 || !videoRef.current) {
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
    }, [isOpen, mediaUrl, mediaVisibleStart]);

    useEffect(() => {
        if (!isOpen) {
            setVideoSize({ w: 0, h: 0 });
            setCurrentTime(0);
            setMediaVisibleStart(0);
            return;
        }

        setVideoSize({ w: 0, h: 0 });
        setCurrentTime(0);
        setMediaVisibleStart(0);
    }, [isOpen, videoPath, mediaUrl]);

    useEffect(() => {
        if (!isOpen || !videoPath) {
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
    }, [isOpen, videoPath, mediaUrl]);

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

    const crop = useCrop(isOpen, persistedPreferences);
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
    );

    // --- Synthesize Action (cross-cutting: reads from all 3 hooks) ---
    const handleSynthesize = async () => {
        if (!videoPath) return;
        
        setIsSynthesizing(true);
        setSynthesisProgress(0);
        setSynthesisMessage(t('preview.preparingSynthesis'));
        try {
            const effectivePreferences: SynthesisExecutionPreferences = {
                ...persistedPreferences,
                subtitleEnabled,
                watermarkEnabled,
                quality: output.quality,
                useGpu: output.useGpu,
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
                crop: {
                    isEnabled: crop.isEnabled,
                    crop: crop.crop,
                },
            };

            const options: SynthesizeOptions = buildSynthesisOptionsFromPreferences(
                effectivePreferences,
                {
                    targetResolution: output.targetResolution,
                    trimStart: Math.max(output.trimStart, mediaVisibleStart),
                    trimEnd: output.trimEnd,
                    crop: crop.isEnabled ? crop.crop : null,
                    videoSize,
                },
            );

            if (onSynthesize) {
                let targetPath = null;
                if (output.outputDir && output.outputFilename) {
                    const sep = output.outputDir.includes('\\') ? '\\' : '/';
                    const cleanDir = output.outputDir.endsWith(sep) ? output.outputDir.slice(0, -1) : output.outputDir;
                    targetPath = `${cleanDir}${sep}${output.outputFilename}`;
                }
                
                const finalOptions = {
                    ...options,
                    output_ref: normalizeMediaReference(targetPath, {
                        type: "video/mp4",
                        media_kind: "video",
                        role: "output",
                        origin: "task",
                    }),
                };

                await onSynthesize(finalOptions, videoPath, watermarkEnabled ? watermark.watermarkPath : null);
            }
            
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setIsSynthesizing(false);
            setSynthesisProgress(0);
            setSynthesisMessage('');
        }
    };


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div 
                className="bg-[#0a0a0a] w-[95vw] h-[90vh] rounded-lg border border-white/10 shadow-2xl flex overflow-hidden ring-1 ring-white/5"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties & { WebkitAppRegion: 'no-drag' }}
            >
                {/* Left: Settings Panel */}
                <div className="w-[340px] bg-[#161616] flex flex-col border-r border-white/5 z-10 shrink-0">
                    <div className="p-6 pb-4">
                        <h2 className="text-xl font-bold flex items-center gap-3 text-white tracking-tight">
                            <div className="p-2 bg-indigo-500/20 rounded-lg">
                                <MonitorPlay size={20} className="text-indigo-400"/>
                            </div>
                            {t('title')}
                        </h2>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-0 flex flex-col gap-6">
                        <SubtitleStylePanel style={style} enabled={subtitleEnabled} onToggle={setSubtitleEnabled} />
                        <OutputSettingsPanel output={output} />
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
                    subtitleEnabled={subtitleEnabled}
                    watermarkEnabled={watermarkEnabled}
                    onClose={onClose}
                    onSynthesizeClick={handleSynthesize}
                    isSynthesizing={isSynthesizing}
                    synthesisProgress={synthesisProgress}
                    synthesisMessage={synthesisMessage}
                    videoRef={videoRef}
                    setVideoSize={setVideoSize}
                    currentTime={currentTime}
                    onTimeUpdate={setCurrentTime}
                />
            </div>
        </div>
    );
};
