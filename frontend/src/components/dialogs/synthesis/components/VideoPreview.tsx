// ── Video Preview + Overlays + Drag + Toolbar ──
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import type { SubtitleStyleState } from '../hooks/useSubtitleStyle';
import type { WatermarkState } from '../hooks/useWatermark';
import type { OutputSettingsState } from '../hooks/useOutputSettings';
import type { CropState } from '../hooks/useCrop';
import { CropOverlay } from './CropOverlay';
import {
    computeSubtitleLineBottomMargins,
    shapeSubtitleText,
} from '../textShaper';
import { resolvePreviewViewportMetrics } from '../previewViewport';
import {
    resolveSubtitlePreviewRenderSpec,
    resolveSubtitleRenderSourceSpec,
} from '../subtitleRender';
import { PreviewActionBar } from './PreviewActionBar';
import { PreviewToolbar } from './PreviewToolbar';
import { PreviewTrimPanel } from './PreviewTrimPanel';

interface Props {
    mediaUrl: string | null;
    style: SubtitleStyleState;
    watermark: WatermarkState;
    output: OutputSettingsState;
    crop: CropState;
    subtitleEnabled: boolean;
    watermarkEnabled: boolean;
    onClose: () => void;
    onSynthesizeClick: () => void;
    isSynthesizing: boolean;
    synthesisProgress: number;
    synthesisMessage: string;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    setVideoSize: (v: { w: number; h: number }) => void;
    currentTime: number;
    onTimeUpdate: (time: number) => void;
}

type PreviewMediaState = {
    url: string | null;
    hasMetadata: boolean;
    hasFrame: boolean;
    hasError: boolean;
    width: number;
    height: number;
    duration: number;
};

function createPreviewMediaState(url: string | null): PreviewMediaState {
    return {
        url,
        hasMetadata: false,
        hasFrame: false,
        hasError: false,
        width: 0,
        height: 0,
        duration: 0,
    };
}

export const VideoPreview: React.FC<Props> = ({
    mediaUrl, style, watermark, output, crop,
    subtitleEnabled, watermarkEnabled,
    onClose,
    onSynthesizeClick, isSynthesizing,
    synthesisProgress, synthesisMessage,
    videoRef, setVideoSize,
    currentTime, onTimeUpdate,
}) => {
    const frameRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation('synthesis');
    const [dragging, setDragging] = useState<'wm' | 'sub' | null>(null);
    const [isTrimOpen, setIsTrimOpen] = useState(false);
    const [mediaState, setMediaState] = useState<PreviewMediaState>(() =>
        createPreviewMediaState(mediaUrl),
    );
    const [frameSize, setFrameSize] = useState({
        width: 0,
        height: 0,
    });

    useEffect(() => {
        setMediaState(createPreviewMediaState(mediaUrl));
    }, [mediaUrl]);

    useEffect(() => {
        if (!mediaUrl || !videoRef.current) {
            return;
        }

        videoRef.current.load();
    }, [mediaUrl, videoRef]);

    // --- Drag Logic ---
    const handleDragStart = (e: React.MouseEvent, type: 'wm' | 'sub') => {
        e.preventDefault();
        setDragging(type);
    };

    const handleSubtitleDragStart = (e: React.MouseEvent) => {
        e.stopPropagation();
        handleDragStart(e, 'sub');
    };

    // Use window-level listeners so drag continues even if mouse leaves the preview area
    // Optimize: Depend on stable setters to avoid re-binding listeners on every render
    const { setWmPos } = watermark;
    const { setSubPos } = style;

    useEffect(() => {
        if (!dragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!frameRef.current) return;

            const rect = frameRef.current.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const x = (e.clientX - rect.left) / rect.width;
            const y = (e.clientY - rect.top) / rect.height;

            const cx = Math.max(0, Math.min(1, x));
            const cy = Math.max(0, Math.min(1, y));

            if (dragging === 'wm') {
                setWmPos({ x: cx, y: cy });
            } else if (dragging === 'sub') {
                setSubPos({ x: 0.5, y: cy });
            }
        };

        const handleMouseUp = () => {
            setDragging(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, setWmPos, setSubPos]);

    useEffect(() => {
        const frame = frameRef.current;
        if (!frame) {
            return;
        }

        const measure = () => {
            setFrameSize({
                width: frame.clientWidth || 0,
                height: frame.clientHeight || 0,
            });
        };

        measure();

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', measure);
            return () => window.removeEventListener('resize', measure);
        }

        const observer = new ResizeObserver(measure);
        observer.observe(frame);

        return () => observer.disconnect();
    }, [mediaUrl]);

    // Destructure for readability
    const {
        fontSize, fontColor, fontName, isBold, isItalic,
        outlineSize, shadowSize, outlineColor,
        bgEnabled, bgColor, bgOpacity, bgPadding, alignment, multilineAlign,
        subPos, currentSubtitle,
    } = style;

    const {
        watermarkPreviewUrl, wmScale, wmOpacity, wmPos,
    } = watermark;

    const isCurrentMediaMetadataReady =
        mediaUrl !== null &&
        mediaState.url === mediaUrl &&
        mediaState.hasMetadata &&
        !mediaState.hasError;
    const isCurrentMediaFrameReady =
        mediaUrl !== null &&
        mediaState.url === mediaUrl &&
        mediaState.hasFrame &&
        !mediaState.hasError;
    const effectiveVideoSize = isCurrentMediaMetadataReady
        ? { w: mediaState.width, h: mediaState.height }
        : { w: 0, h: 0 };
    const effectiveDuration = isCurrentMediaMetadataReady ? mediaState.duration : 0;
    const previewViewportMetrics = resolvePreviewViewportMetrics({
        sourceWidth: effectiveVideoSize.w,
        sourceHeight: effectiveVideoSize.h,
        crop: crop.isEnabled ? crop.crop : null,
    });
    const sourceRenderSpec = resolveSubtitleRenderSourceSpec({
        fontSize,
        fontColor,
        fontName,
        isBold,
        isItalic,
        outlineSize,
        shadowSize,
        outlineColor,
        bgEnabled,
        bgColor,
        bgOpacity,
        bgPadding,
        alignment,
        multilineAlign,
        subPos,
        outputWidth: previewViewportMetrics.outputSourceWidth,
        outputHeight: previewViewportMetrics.outputSourceHeight,
    });
    const previewMetrics = resolveSubtitlePreviewRenderSpec({
        source: sourceRenderSpec,
        previewWidth: frameSize.width,
        previewHeight: frameSize.height,
    });
    const shapedSubtitle = shapeSubtitleText(
        currentSubtitle || t('preview.subtitlePosition'),
        previewMetrics.availableWidth,
        previewMetrics.fontSize,
        {
            fontFamily: fontName,
            isBold,
            isItalic,
        },
    );
    const subtitleLines = shapedSubtitle.split('\n');
    const subtitlePreviewReady = previewMetrics.isReady;
    const lineBottomMargins = computeSubtitleLineBottomMargins(
        subtitleLines.length,
        previewMetrics.marginV,
        previewMetrics.lineStep,
        multilineAlign,
    );
    return (
        <div
            className="flex-1 flex flex-col bg-[#050505] relative min-w-0"
        >
            <PreviewToolbar
                output={output}
                crop={crop}
                isTrimOpen={isTrimOpen}
                setIsTrimOpen={setIsTrimOpen}
                onClose={onClose}
            />

            {isTrimOpen && (
                <PreviewTrimPanel
                    output={output}
                    currentTime={currentTime}
                    duration={effectiveDuration}
                />
            )}

            {/* Output Preview Container */}
            <div className="flex-1 relative flex items-center justify-center bg-[url('/grid.svg')] bg-repeat opacity-100 overflow-hidden p-8">
                {mediaUrl ? (
                    /* The frame is sized by the browser's actual rendered video box, and overlays attach to that exact box */
                    <div 
                        ref={frameRef}
                        className="relative shadow-2xl shadow-black/50 border border-white/10 bg-black rounded-lg overflow-hidden ring-1 ring-white/5 max-w-full max-h-full"
                        style={{
                            aspectRatio: `${previewViewportMetrics.aspectRatio}`,
                            width: effectiveVideoSize.w > 0 && effectiveVideoSize.h > 0 ? 'min(100%, calc((100vh - 240px) * var(--preview-aspect)))' : undefined,
                            height: 'auto',
                            ['--preview-aspect' as string]: `${previewViewportMetrics.aspectRatio}`,
                        }}
                    >
                        <div
                            className="absolute inset-0"
                            style={{
                                width: `${previewViewportMetrics.contentWidthPercent}%`,
                                height: `${previewViewportMetrics.contentHeightPercent}%`,
                                left: `${previewViewportMetrics.contentOffsetXPercent}%`,
                                top: `${previewViewportMetrics.contentOffsetYPercent}%`,
                            }}
                        >
                            <video 
                                key={mediaUrl}
                                ref={videoRef}
                                src={mediaUrl}
                                preload="auto"
                                playsInline
                                className={`block w-full h-full transition-opacity duration-150 ${isCurrentMediaFrameReady ? 'opacity-100' : 'opacity-0'}`}
                                onLoadStart={() => {
                                    setMediaState(createPreviewMediaState(mediaUrl));
                                }}
                                onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
                                onLoadedMetadata={(e) => {
                                    const target = e.currentTarget;
                                    const nextSize = {
                                        w: target.videoWidth || 0,
                                        h: target.videoHeight || 0,
                                    };
                                    const nextDuration = Number.isFinite(target.duration)
                                        ? target.duration
                                        : 0;

                                    setVideoSize(nextSize);
                                    setMediaState({
                                        url: mediaUrl,
                                        hasMetadata: true,
                                        hasFrame: false,
                                        hasError: false,
                                        width: nextSize.w,
                                        height: nextSize.h,
                                        duration: nextDuration,
                                    });
                                }}
                                onLoadedData={(e) => {
                                    const target = e.currentTarget;
                                    setMediaState((current) => ({
                                        url: mediaUrl,
                                        hasMetadata: true,
                                        hasFrame: true,
                                        hasError: false,
                                        width: target.videoWidth || current.width,
                                        height: target.videoHeight || current.height,
                                        duration: Number.isFinite(target.duration)
                                            ? target.duration
                                            : current.duration,
                                    }));
                                }}
                                onCanPlay={(e) => {
                                    const target = e.currentTarget;
                                    setMediaState((current) => ({
                                        url: mediaUrl,
                                        hasMetadata: current.hasMetadata || target.videoWidth > 0,
                                        hasFrame: true,
                                        hasError: false,
                                        width: target.videoWidth || current.width,
                                        height: target.videoHeight || current.height,
                                        duration: Number.isFinite(target.duration)
                                            ? target.duration
                                            : current.duration,
                                    }));
                                }}
                                onDurationChange={(e) => {
                                    const nextDuration = Number.isFinite(e.currentTarget.duration)
                                        ? e.currentTarget.duration
                                        : 0;
                                    setMediaState((current) => ({
                                        ...current,
                                        duration: nextDuration,
                                    }));
                                }}
                                onError={() => {
                                    setVideoSize({ w: 0, h: 0 });
                                    setMediaState({
                                        url: mediaUrl,
                                        hasMetadata: false,
                                        hasFrame: false,
                                        hasError: true,
                                        width: 0,
                                        height: 0,
                                        duration: 0,
                                    });
                                }}
                            />
                        </div>

                        {!isCurrentMediaFrameReady && !mediaState.hasError && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-slate-300 pointer-events-none">
                                <div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-indigo-400 animate-spin" />
                                <span className="text-xs font-medium text-slate-400">
                                    {t('preview.loadingMediaFrame', '正在加载视频画面...')}
                                </span>
                            </div>
                        )}

                        {mediaState.hasError && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-slate-300 pointer-events-none">
                                <Play size={32} className="opacity-30" />
                                <span className="text-sm font-medium text-slate-300">
                                    {t('preview.mediaLoadError', '视频预览加载失败')}
                                </span>
                                <span className="text-xs text-slate-500">
                                    {t('preview.mediaLoadErrorHint', '请重新打开合成界面或检查视频编码')}
                                </span>
                            </div>
                        )}

                        {/* --- Overlays Layer --- */}
                        
                        {/* Crop Overlay */}
                        {crop.isEnabled && isCurrentMediaMetadataReady && (
                            <CropOverlay 
                                crop={crop.crop} 
                                setCrop={crop.setCrop} 
                                containerRef={frameRef} 
                            />
                        )}
                        
                        {/* Watermark Overlay */}
                        {watermarkEnabled && watermarkPreviewUrl && isCurrentMediaFrameReady && (
                            <div
                                className="absolute cursor-move select-none group"
                                style={{
                                    left: `${wmPos.x * 100}%`,
                                    top: `${wmPos.y * 100}%`,
                                    width: `${wmScale * 100}%`,
                                    opacity: wmOpacity,
                                    zIndex: 20,
                                    transform: 'translate(-50%, -50%)',
                                    border: dragging === 'wm' ? '1px dashed #6366f1' : '1px dashed transparent',
                                    boxShadow: dragging === 'wm' ? '0 0 0 1000px rgba(0,0,0,0.5)' : 'none'
                                }}
                                onMouseDown={(e) => handleDragStart(e, 'wm')}
                            >
                                <img 
                                    src={watermarkPreviewUrl} 
                                    className="w-full h-auto pointer-events-none drop-shadow-lg"
                                    alt="Watermark"
                                />
                                <div className="absolute inset-0 border border-indigo-500/50 opacity-0 group-hover:opacity-100 pointer-events-none rounded transition-opacity"></div>
                            </div>
                        )}
                        
                        {/* Subtitle Overlay */}
                        {subtitleEnabled && subtitlePreviewReady && isCurrentMediaFrameReady && (
                        <div 
                            className="absolute inset-0 select-none group transition-colors pointer-events-none"
                            style={{
                                zIndex: 30,
                                textAlign: alignment === 1 ? 'left' : alignment === 3 ? 'right' : 'center',
                            }}
                        >
                            {(currentSubtitle || dragging === 'sub') && (
                                subtitleLines.map((lineText, index) => (
                                    <div
                                        key={`${index}-${lineText}`}
                                        className="absolute"
                                        style={{
                                            left: `${previewMetrics.marginL}px`,
                                            right: `${previewMetrics.marginR}px`,
                                            bottom: `${lineBottomMargins[index] ?? previewMetrics.marginV}px`,
                                            textAlign: alignment === 1 ? 'left' : alignment === 3 ? 'right' : 'center',
                                        }}
                                    >
                                        <span 
                                            className={`
                                                inline-block text-lg md:text-xl leading-relaxed max-w-full cursor-move pointer-events-auto
                                                transition-all duration-75
                                                ${dragging === 'sub' ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-black/50' : 'group-hover:ring-1 group-hover:ring-white/30'}
                                            `}
                                            onMouseDown={handleSubtitleDragStart}
                                            style={{ 
                                                fontSize: `${previewMetrics.fontSize}px`, 
                                                color: fontColor,
                                                fontFamily: `"${fontName}", sans-serif`,
                                                fontWeight: isBold ? 'bold' : 'normal',
                                                fontStyle: isItalic ? 'italic' : 'normal',
                                                fontSynthesis: 'style',
                                                lineHeight: `${previewMetrics.lineStep}px`,
                                                WebkitTextStroke: undefined,
                                                paintOrder: undefined,
                                                textShadow: previewMetrics.textShadow,
                                                backgroundColor: previewMetrics.backgroundColor,
                                                padding: previewMetrics.padding,
                                                borderRadius: bgEnabled ? 0 : undefined,
                                                whiteSpace: 'pre',
                                            }}
                                        >
                                            {lineText}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center w-full h-full text-slate-600 bg-white/[0.02] rounded-lg border border-white/10 ring-1 ring-white/5">
                        <Play size={48} className="opacity-20 mb-4"/>
                        <span className="text-sm font-medium">{t('preview.noMediaLoaded')}</span>
                    </div>
                )}
            </div>
            
            <PreviewActionBar
                videoRef={videoRef}
                currentTime={currentTime}
                duration={effectiveDuration}
                onTimeUpdate={onTimeUpdate}
                onSynthesizeClick={onSynthesizeClick}
                isSynthesizing={isSynthesizing}
                synthesisProgress={synthesisProgress}
                synthesisMessage={synthesisMessage}
            />
        </div>
    );
};
