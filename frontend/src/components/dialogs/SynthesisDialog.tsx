// ── Unified Video Export Dialog — Slim Orchestration Shell ──
// All state logic lives in hooks, all UI sections live in subcomponents.
// This component only handles: hook wiring, export submission, and dialog layout.

import React from 'react';
import { MonitorPlay } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SubtitleSegment } from '../../types/task';
import { useSubtitleStyle } from './synthesis/hooks/useSubtitleStyle';
import { useWatermark } from './synthesis/hooks/useWatermark';
import { useOutputSettings } from './synthesis/hooks/useOutputSettings';
import { useCrop } from './synthesis/hooks/useCrop';
import { useSynthesisDialogPreferences } from './synthesis/hooks/useSynthesisDialogPreferences';
import { useSynthesisExportSubmission } from './synthesis/hooks/useSynthesisExportSubmission';
import { useSynthesisPreviewSession } from './synthesis/hooks/useSynthesisPreviewSession';
import { SubtitleStylePanel } from './synthesis/components/SubtitleStylePanel';
import { WatermarkPanel } from './synthesis/components/WatermarkPanel';
import { OutputSettingsPanel } from './synthesis/components/OutputSettingsPanel';
import { VideoPreview } from './synthesis/components/VideoPreview';
import {
    getVideoExportClipDuration,
    resolvePreviewViewportMetrics,
    type VideoExportScope,
    type VideoExportSubmission,
} from '../../services/domain';
import type { MediaReference } from '../../services/ui/mediaReference';
import { Dialog } from '../ui/Dialog';

interface VideoExportDialogProps {
    isOpen: boolean;
    onClose: () => void;
    regions: SubtitleSegment[];
    video: MediaReference | null;
    mediaUrl: string | null;
    exportScope: VideoExportScope;
    onExport: (submission: VideoExportSubmission) => Promise<boolean>;
}

export const VideoExportDialog: React.FC<VideoExportDialogProps> = ({
    isOpen, onClose, regions, video, mediaUrl, exportScope, onExport
}) => {
    const videoPath = video?.path ?? null;
    const { t } = useTranslation('synthesis');
    const isClipExport = exportScope.kind === "clips";
    const clipDuration = getVideoExportClipDuration(exportScope);
    const preferences = useSynthesisDialogPreferences(isOpen, regions);
    const preview = useSynthesisPreviewSession({ isOpen, video, mediaUrl, regions, exportScope });

    const crop = useCrop(isOpen, videoPath);
    const outputViewportMetrics = resolvePreviewViewportMetrics({
        sourceWidth: preview.videoSize.w,
        sourceHeight: preview.videoSize.h,
        crop: crop.isEnabled ? crop.crop : null,
    });

    // --- Hooks ---
    const style = useSubtitleStyle(
        isOpen,
        regions,
        preview.currentTime,
        {
            w: outputViewportMetrics.outputSourceWidth,
            h: outputViewportMetrics.outputSourceHeight,
        },
        videoPath,
        preferences.persistedPreferences,
    );
    const watermark = useWatermark(
        isOpen,
        {
            w: outputViewportMetrics.outputSourceWidth,
            h: outputViewportMetrics.outputSourceHeight,
        },
        preferences.persistedPreferences,
    );
    const output = useOutputSettings(
        isOpen,
        videoPath,
        preferences.persistedPreferences,
        exportScope.kind,
    );
    const fullVideoPreviewRange = !isClipExport && preview.timeline
        ? {
            start: output.trimStart > 0 ? output.trimStart : preview.automaticTrimStart,
            end: output.trimEnd > 0 ? output.trimEnd : preview.timeline.trim_end,
        }
        : null;
    const previewRange = preview.activeClip
        ? { start: preview.activeClip.start, end: preview.activeClip.end }
        : fullVideoPreviewRange;
    const submission = useSynthesisExportSubmission({
        videoPath,
        videoSize: preview.videoSize,
        exportScope,
        subtitleAvailable: preferences.subtitleAvailable,
        subtitleEnabled: preferences.subtitleEnabled,
        watermarkEnabled: preferences.watermarkEnabled,
        persistedPreferences: preferences.persistedPreferences,
        style,
        watermark,
        output,
        crop,
        automaticTrimStart: preview.automaticTrimStart,
        fullVideoPreviewRange,
        timeline: preview.timeline,
        onExport,
        onClose,
    });


    if (!isOpen) return null;

    return (
        <Dialog
            open={isOpen}
            onClose={onClose}
            ariaLabel={isClipExport ? t('clipExport.title') : t('title')}
            busy={submission.isSubmitting}
            closeOnBackdrop={false}
            overlayClassName="z-[100] bg-black/80 p-2 backdrop-blur-sm sm:p-4"
            className="relative flex h-[90vh] w-[95vw] overflow-hidden rounded-lg border border-white/10 bg-[#0a0a0a] shadow-2xl ring-1 ring-white/5 max-[900px]:h-[95vh] max-[900px]:flex-col"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties & { WebkitAppRegion: 'no-drag' }}
        >
                {/* Left: Settings Panel */}
                <div className="z-10 flex w-[340px] shrink-0 flex-col border-r border-white/5 bg-[#161616] max-[900px]:max-h-[43%] max-[900px]:w-full max-[900px]:border-r-0 max-[900px]:border-b">
                    <div className="p-6 pb-4 max-[900px]:p-4 max-[900px]:pb-3">
                        <h2 className="text-xl font-bold flex items-center gap-3 text-white tracking-tight">
                            <div className="p-2 bg-indigo-500/20 rounded-lg">
                                <MonitorPlay size={20} className="text-indigo-400"/>
                            </div>
                            {isClipExport ? t('clipExport.title') : t('title')}
                        </h2>
                        {isClipExport && (
                            <p className="mt-2 text-xs text-slate-400">
                                {t('clipExport.summary', {
                                    count: preview.clipSegments.length,
                                    duration: clipDuration.toFixed(1),
                                })}
                            </p>
                        )}
                    </div>

                    <div className="custom-scrollbar flex flex-1 flex-col gap-6 overflow-y-auto p-6 pt-0 max-[900px]:p-4 max-[900px]:pt-0">
                        <SubtitleStylePanel
                            style={style}
                            enabled={preferences.subtitleAvailable && preferences.subtitleEnabled}
                            available={preferences.subtitleAvailable}
                            onToggle={preferences.setSubtitleEnabled}
                        />
                        <OutputSettingsPanel
                            output={output}
                            batchMode={isClipExport}
                            batchCount={preview.clipSegments.length}
                        />
                        <WatermarkPanel watermark={watermark} enabled={preferences.watermarkEnabled} onToggle={preferences.setWatermarkEnabled} />
                    </div>
                </div>

                {/* Right: Preview Area */}
                <VideoPreview
                    mediaUrl={mediaUrl}
                    style={style}
                    watermark={watermark}
                    output={output}
                    crop={crop}
                    subtitleEnabled={preferences.subtitleAvailable && preferences.subtitleEnabled}
                    watermarkEnabled={preferences.watermarkEnabled}
                    onClose={onClose}
                    onExportClick={submission.handleExport}
                    isSubmitting={submission.isSubmitting}
                    videoRef={preview.videoRef}
                    setVideoSize={preview.setVideoSize}
                    currentTime={preview.currentTime}
                    onTimeUpdate={preview.setCurrentTime}
                    previewRange={previewRange}
                    clipNavigator={preview.activeClip ? {
                        index: preview.activeClipIndex,
                        count: preview.clipSegments.length,
                        title: preview.activeClip.title || t('clipExport.untitled'),
                        onPrevious: () => preview.setActiveClipIndex((current) => Math.max(0, current - 1)),
                        onNext: () => preview.setActiveClipIndex((current) => Math.min(preview.clipSegments.length - 1, current + 1)),
                    } : null}
                    allowTrim={!isClipExport}
                    isPreparing={preview.isResolving}
                    actionLabel={isClipExport
                        ? t('clipExport.startExport', { count: preview.clipSegments.length })
                        : t('preview.startExport')}
                />
                {submission.isSubmitting && (
                    <div
                        className="absolute inset-0 z-[200] cursor-wait"
                        aria-hidden="true"
                    />
                )}
        </Dialog>
    );
};
