import { Check, Clapperboard, Gauge } from "lucide-react";
import React, { type RefObject, useState, useCallback, useMemo } from "react";
import {
    resolveContainedViewportFrame,
    resolvePreviewViewportMetrics,
} from "../../services/domain";
import type { SubtitleSegment } from "../../types/task";

interface VideoPreviewProps {
    mediaUrl: string | null;
    videoRef: RefObject<HTMLVideoElement | null>;
    regions: SubtitleSegment[];
    onLoadedMetadata?: () => void;
}

const EDITOR_PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

function formatPlaybackRate(rate: number) {
    return rate === 1 ? "正常" : `${rate}`;
}

function VideoPreviewComponent({
    mediaUrl,
    videoRef,
    regions,
    onLoadedMetadata
}: VideoPreviewProps) {
    // 内部管理时间状态，不传递给父组件
    const [currentTime, setCurrentTime] = useState(0);
    const stageRef = React.useRef<HTMLDivElement>(null);
    const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
    const [mediaSize, setMediaSize] = useState({ width: 0, height: 0 });
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isRateMenuOpen, setIsRateMenuOpen] = useState(false);

    const handleTimeUpdate = useCallback(() => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
        }
    }, [videoRef]);

    // 缓存当前字幕，避免每次渲染都遍历
    const currentSubtitle = useMemo(() => 
        regions.find(r => currentTime >= r.start && currentTime < r.end)?.text || "",
        [regions, currentTime]
    );

    const [hasError, setHasError] = useState(false);

    // Reset error when url changes
    React.useEffect(() => {
        setHasError(false);
        setMediaSize({ width: 0, height: 0 });
        setCurrentTime(0);
        setIsRateMenuOpen(false);
    }, [mediaUrl]);

    React.useEffect(() => {
        const video = videoRef.current;
        if (!video) {
            return;
        }

        const syncPlaybackRate = () => {
            setPlaybackRate(video.playbackRate);
        };

        syncPlaybackRate();
        video.addEventListener("ratechange", syncPlaybackRate);

        return () => video.removeEventListener("ratechange", syncPlaybackRate);
    }, [mediaUrl, videoRef]);

    React.useEffect(() => {
        const stage = stageRef.current;
        if (!stage) {
            return;
        }

        const updateStageSize = () => {
            setStageSize((current) => {
                const next = {
                    width: stage.clientWidth,
                    height: stage.clientHeight,
                };
                return current.width === next.width && current.height === next.height
                    ? current
                    : next;
            });
        };

        updateStageSize();

        const observer = new ResizeObserver(updateStageSize);
        observer.observe(stage);

        return () => observer.disconnect();
    }, [mediaUrl]);

    const viewportMetrics = useMemo(
        () =>
            resolvePreviewViewportMetrics({
                sourceWidth: mediaSize.width,
                sourceHeight: mediaSize.height,
            }),
        [mediaSize.height, mediaSize.width],
    );

    const frameSize = useMemo(
        () =>
            resolveContainedViewportFrame({
                containerWidth: stageSize.width,
                containerHeight: stageSize.height,
                aspectRatio: viewportMetrics.aspectRatio,
            }),
        [stageSize.height, stageSize.width, viewportMetrics.aspectRatio],
    );

    const handleError = () => {
        setHasError(true);
    };

    const handleLoadedMetadata = useCallback(
        (event: React.SyntheticEvent<HTMLVideoElement>) => {
            const video = event.currentTarget;
            setMediaSize({
                width: video.videoWidth || 0,
                height: video.videoHeight || 0,
            });
            setPlaybackRate(video.playbackRate);
            onLoadedMetadata?.();
        },
        [onLoadedMetadata],
    );

    const handlePlaybackRateSelect = useCallback(
        (rate: number) => {
            const video = videoRef.current;
            if (video) {
                video.playbackRate = rate;
            }
            setPlaybackRate(rate);
            setIsRateMenuOpen(false);
        },
        [videoRef],
    );

    return (
        <div className="flex-1 bg-black/40 flex flex-col relative justify-center items-center backdrop-blur-sm">
            {mediaUrl && !hasError ? (
                <div className="w-full h-full min-h-0 relative p-6 flex flex-col gap-2">
                    <div
                        className="relative z-30 flex h-9 shrink-0 justify-end"
                        onMouseLeave={() => setIsRateMenuOpen(false)}
                    >
                        <button
                            type="button"
                            title="播放速度"
                            aria-label="播放速度"
                            aria-haspopup="menu"
                            aria-expanded={isRateMenuOpen}
                            onClick={() => setIsRateMenuOpen((open) => !open)}
                            className="flex h-9 min-w-16 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-black/55 px-2.5 text-xs font-semibold text-white/90 shadow-lg backdrop-blur-md transition-colors hover:bg-white/10"
                        >
                            <Gauge size={14} />
                            <span>{formatPlaybackRate(playbackRate)}</span>
                        </button>
                        {isRateMenuOpen && (
                            <div
                                role="menu"
                                aria-label="播放速度"
                                className="absolute right-0 top-full mt-2 w-28 overflow-hidden rounded-lg border border-white/10 bg-zinc-950/95 py-1 text-sm text-slate-100 shadow-2xl backdrop-blur-md"
                            >
                                {EDITOR_PLAYBACK_RATES.map((rate) => {
                                    const isActive = Math.abs(playbackRate - rate) < 0.001;
                                    return (
                                        <button
                                            key={rate}
                                            type="button"
                                            role="menuitemradio"
                                            aria-checked={isActive}
                                            onClick={() => handlePlaybackRateSelect(rate)}
                                            className={`flex w-full items-center justify-between px-3 py-2 text-left transition-colors ${
                                                isActive
                                                    ? "bg-indigo-500/20 text-indigo-200"
                                                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                                            }`}
                                        >
                                            <span>{formatPlaybackRate(rate)}</span>
                                            {isActive && <Check size={14} />}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <div
                        ref={stageRef}
                        className="flex-1 min-h-0 relative flex items-center justify-center bg-black/50 rounded-lg overflow-hidden border border-white/5 shadow-2xl ring-1 ring-white/5"
                    >
                        <div
                            className="relative overflow-hidden bg-black shadow-2xl max-w-full max-h-full"
                            style={{
                                width: frameSize.width > 0 ? `${frameSize.width}px` : "100%",
                                height: frameSize.height > 0 ? `${frameSize.height}px` : "100%",
                            }}
                        >
                            <video
                               key={mediaUrl}
                               ref={videoRef}
                               src={mediaUrl}
                               className="block w-full h-full object-contain"
                               controls={true}
                               playsInline
                               onTimeUpdate={handleTimeUpdate}
                               onLoadedMetadata={handleLoadedMetadata}
                               onError={handleError}
                            />
                            {/* Overlay Subtitles (Improved Typography) */}
                            <div className="absolute bottom-16 left-0 right-0 text-center pointer-events-none px-12">
                                {currentSubtitle && (
                                    <span className="inline-block bg-black/60 text-white/95 px-6 py-3 rounded-lg text-lg md:text-xl font-medium shadow-lg backdrop-blur-md border border-white/10 leading-relaxed max-w-full break-words">
                                        {currentSubtitle}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-slate-500/50 flex flex-col items-center gap-4">
                    <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 shadow-inner">
                        <Clapperboard size={64} className="opacity-20" />
                    </div>
                    <p className="text-sm font-medium tracking-wide opacity-60">
                        {hasError ? "Media failed to load" : "No media loaded"}
                    </p>
                </div>
            )}
        </div>
    );
}

export const VideoPreview = React.memo(VideoPreviewComponent);
