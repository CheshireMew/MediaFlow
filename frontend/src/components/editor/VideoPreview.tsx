import {
    Check,
    Clapperboard,
    Gauge,
    Maximize2,
    Minimize2,
    Pause,
    Play,
    Volume2,
    VolumeX,
    Subtitles,
} from "lucide-react";
import React, { type RefObject, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
    resolveContainedViewportFrame,
    resolvePreviewViewportMetrics,
} from "../../services/domain";
import type { SubtitleSegment } from "../../types/task";
import { formatMediaPlaybackTime } from "../../utils/mediaTime";

interface VideoPreviewProps {
    mediaUrl: string | null;
    videoRef: RefObject<HTMLVideoElement | null>;
    regions: SubtitleSegment[];
    onLoadedMetadata?: () => void;
}

const EDITOR_PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

function formatPlaybackRate(rate: number, normalLabel: string) {
    return rate === 1 ? normalLabel : `${rate}`;
}

function VideoPreviewComponent({
    mediaUrl,
    videoRef,
    regions,
    onLoadedMetadata
}: VideoPreviewProps) {
    const { t } = useTranslation("editor");
    // 内部管理时间状态，不传递给父组件
    const [currentTime, setCurrentTime] = useState(0);
    const panelRef = React.useRef<HTMLDivElement>(null);
    const stageRef = React.useRef<HTMLDivElement>(null);
    const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
    const [mediaSize, setMediaSize] = useState({ width: 0, height: 0 });
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isRateMenuOpen, setIsRateMenuOpen] = useState(false);
    const rateMenuRef = React.useRef<HTMLDivElement>(null);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [subtitlePosition, setSubtitlePosition] = useState({ x: 50, y: 76 });
    const [subtitleBackgroundAlpha, setSubtitleBackgroundAlpha] = useState(0.6);
    const [isDraggingSubtitle, setIsDraggingSubtitle] = useState(false);
    const videoFrameRef = React.useRef<HTMLDivElement>(null);
    const subtitlePointerIdRef = React.useRef<number | null>(null);

    const handleTimeUpdate = useCallback(() => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
            setDuration(videoRef.current.duration || 0);
        }
    }, [videoRef]);

    // 缓存当前字幕，避免每次渲染都遍历
    const currentSubtitle = useMemo(() => 
        regions.find(r => currentTime >= r.start && currentTime < r.end)?.text || "",
        [regions, currentTime]
    );

    const currentSubtitleIndex = useMemo(
        () => regions.findIndex(r => currentTime >= r.start && currentTime < r.end),
        [regions, currentTime],
    );

    const [hasError, setHasError] = useState(false);

    // Reset error when url changes
    React.useEffect(() => {
        setHasError(false);
        setMediaSize({ width: 0, height: 0 });
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
        setIsRateMenuOpen(false);
    }, [mediaUrl]);

    React.useEffect(() => {
        if (!isDraggingSubtitle) {
            return;
        }

        const handlePointerMove = (event: PointerEvent) => {
            if (
                subtitlePointerIdRef.current !== null &&
                event.pointerId !== subtitlePointerIdRef.current
            ) {
                return;
            }
            const frame = videoFrameRef.current;
            if (!frame) {
                return;
            }
            const rect = frame.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 100;
            const y = ((event.clientY - rect.top) / rect.height) * 100;
            setSubtitlePosition({
                x: Math.min(88, Math.max(12, x)),
                y: Math.min(88, Math.max(20, y)),
            });
        };

        const handlePointerEnd = (event: PointerEvent) => {
            if (
                subtitlePointerIdRef.current !== null &&
                event.pointerId !== subtitlePointerIdRef.current
            ) {
                return;
            }
            subtitlePointerIdRef.current = null;
            setIsDraggingSubtitle(false);
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerEnd);
        window.addEventListener("pointercancel", handlePointerEnd);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerEnd);
            window.removeEventListener("pointercancel", handlePointerEnd);
        };
    }, [isDraggingSubtitle]);

    const handleSubtitlePositionKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLButtonElement>) => {
            const directions: Record<string, { x: number; y: number }> = {
                ArrowLeft: { x: -1, y: 0 },
                ArrowRight: { x: 1, y: 0 },
                ArrowUp: { x: 0, y: -1 },
                ArrowDown: { x: 0, y: 1 },
            };
            const direction = directions[event.key];
            if (!direction) return;

            event.preventDefault();
            event.stopPropagation();
            const step = event.shiftKey ? 5 : 1;
            setSubtitlePosition((position) => ({
                x: Math.min(88, Math.max(12, position.x + direction.x * step)),
                y: Math.min(88, Math.max(20, position.y + direction.y * step)),
            }));
        },
        [],
    );

    React.useEffect(() => {
        const video = videoRef.current;
        if (!video) {
            return;
        }

        const syncPlaybackRate = () => {
            setPlaybackRate(video.playbackRate);
        };
        const syncPlaybackState = () => {
            setIsPlaying(!video.paused);
        };
        const syncVolumeState = () => {
            setVolume(video.volume);
            setIsMuted(video.muted);
        };

        syncPlaybackRate();
        syncPlaybackState();
        syncVolumeState();
        video.addEventListener("ratechange", syncPlaybackRate);
        video.addEventListener("play", syncPlaybackState);
        video.addEventListener("pause", syncPlaybackState);
        video.addEventListener("volumechange", syncVolumeState);

        return () => {
            video.removeEventListener("ratechange", syncPlaybackRate);
            video.removeEventListener("play", syncPlaybackState);
            video.removeEventListener("pause", syncPlaybackState);
            video.removeEventListener("volumechange", syncVolumeState);
        };
    }, [mediaUrl, videoRef]);

    React.useEffect(() => {
        const syncFullscreenState = () => {
            setIsFullscreen(document.fullscreenElement === panelRef.current);
        };

        document.addEventListener("fullscreenchange", syncFullscreenState);
        return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
    }, []);

    React.useEffect(() => {
        if (!isRateMenuOpen) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            const menu = rateMenuRef.current;
            if (menu && event.target instanceof Node && menu.contains(event.target)) {
                return;
            }
            setIsRateMenuOpen(false);
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsRateMenuOpen(false);
            }
        };

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isRateMenuOpen]);

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
            setDuration(video.duration || 0);
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

    const handlePlayPause = useCallback(() => {
        const video = videoRef.current;
        if (!video) {
            return;
        }

        if (video.paused) {
            void video.play();
            return;
        }

        video.pause();
    }, [videoRef]);

    const handleSeek = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const video = videoRef.current;
            const nextTime = Number(event.currentTarget.value);
            if (!video || !Number.isFinite(nextTime)) {
                return;
            }

            video.currentTime = nextTime;
            setCurrentTime(nextTime);
        },
        [videoRef],
    );

    const handleVolumeChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const video = videoRef.current;
            const nextVolume = Number(event.currentTarget.value);
            if (!video || !Number.isFinite(nextVolume)) {
                return;
            }

            video.volume = nextVolume;
            video.muted = nextVolume === 0;
            setVolume(nextVolume);
            setIsMuted(video.muted);
        },
        [videoRef],
    );

    const handleMuteToggle = useCallback(() => {
        const video = videoRef.current;
        if (!video) {
            return;
        }

        video.muted = !video.muted;
        setIsMuted(video.muted);
    }, [videoRef]);

    const handleFullscreenToggle = useCallback(() => {
        const panel = panelRef.current;
        if (!panel) {
            return;
        }

        if (document.fullscreenElement === panel) {
            void document.exitFullscreen();
            setIsFullscreen(false);
            return;
        }

        void panel.requestFullscreen();
        setIsFullscreen(true);
    }, []);

    const handleVideoFrameKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key !== "Enter" && event.key !== " ") {
                return;
            }

            event.preventDefault();
            handlePlayPause();
        },
        [handlePlayPause],
    );

    return (
        <div className="flex-1 bg-[#0b0b0b] flex flex-col relative justify-center items-center">
            {mediaUrl && !hasError ? (
                <div
                    ref={panelRef}
                    data-testid="editor-video-preview-panel"
                    className="w-full h-full min-h-0 relative flex flex-col bg-transparent"
                >
                    <div
                        ref={stageRef}
                        className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden border border-white/[0.07] bg-black shadow-2xl"
                    >
                        <div
                            ref={videoFrameRef}
                            role="button"
                            tabIndex={0}
                            aria-label={isPlaying ? t("videoPreview.pauseFrame") : t("videoPreview.playFrame")}
                            onClick={handlePlayPause}
                            onKeyDown={handleVideoFrameKeyDown}
                            className="relative overflow-hidden bg-black shadow-2xl max-w-full max-h-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400/70"
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
                               playsInline
                               onTimeUpdate={handleTimeUpdate}
                               onLoadedMetadata={handleLoadedMetadata}
                               onError={handleError}
                            />
                            <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/55 px-2 py-1 text-xs font-medium text-slate-300">
                                <Subtitles size={12} className="text-indigo-300" />
                                {currentSubtitleIndex >= 0 ? `${currentSubtitleIndex + 1} / ${regions.length}` : `0 / ${regions.length}`}
                            </div>

                            <div className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border border-white/10 bg-black/75 p-1 text-xs font-medium text-slate-300 shadow-lg">
                                {[0.35, 0.6, 0.85].map((alpha) => (
                                    <button
                                        key={alpha}
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setSubtitleBackgroundAlpha(alpha);
                                        }}
                                        aria-label={t("videoPreview.subtitleBackgroundOpacity", { value: Math.round(alpha * 100) })}
                                        className={`h-6 rounded-md px-2 transition-colors ${
                                            Math.abs(subtitleBackgroundAlpha - alpha) < 0.01
                                                ? "bg-indigo-500/30 text-indigo-100"
                                                : "hover:bg-white/10 text-slate-400"
                                        }`}
                                    >
                                        {Math.round(alpha * 100)}
                                    </button>
                                ))}
                            </div>

                            {currentSubtitle && (
                                <div
                                    data-testid="editor-preview-subtitle-layer"
                                    className="pointer-events-none absolute z-20 w-[86%] -translate-x-1/2 -translate-y-1/2 text-center"
                                    style={{
                                        left: `${subtitlePosition.x}%`,
                                        top: `${subtitlePosition.y}%`,
                                    }}
                                >
                                    <button
                                        type="button"
                                        data-testid="editor-preview-subtitle"
                                        aria-label={t("videoPreview.subtitlePosition")}
                                        onPointerDown={(event) => {
                                            event.stopPropagation();
                                            subtitlePointerIdRef.current = event.pointerId;
                                            event.currentTarget.setPointerCapture?.(event.pointerId);
                                            setIsDraggingSubtitle(true);
                                        }}
                                        onClick={(event) => event.stopPropagation()}
                                        onKeyDown={handleSubtitlePositionKeyDown}
                                        className={`pointer-events-auto inline-block w-auto max-w-full cursor-move select-none rounded-lg border-0 text-white/95 font-medium shadow-lg leading-snug whitespace-normal break-words ring-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                                            isDraggingSubtitle ? "ring-indigo-300/70" : "ring-transparent"
                                        } ${isFullscreen ? "px-6 py-2.5 text-3xl" : "px-4 py-1.5 text-lg"}`}
                                        style={{
                                            backgroundColor: `rgba(0, 0, 0, ${subtitleBackgroundAlpha})`,
                                            touchAction: "none",
                                        }}
                                    >
                                        {currentSubtitle}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    <div
                        className="mx-auto mt-1 shrink-0 rounded-lg border border-white/[0.07] bg-black/80 px-4 py-1 shadow-lg"
                        style={{
                            width: frameSize.width > 0 ? `${frameSize.width}px` : "100%",
                            maxWidth: "100%",
                        }}
                    >
                        <div className="flex items-center gap-2.5">
                            <button
                                type="button"
                                title={isPlaying ? t("videoPreview.pause") : t("videoPreview.play")}
                                aria-label={isPlaying ? t("videoPreview.pause") : t("videoPreview.play")}
                                onClick={handlePlayPause}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10"
                            >
                                {isPlaying ? <Pause size={17} /> : <Play size={17} />}
                            </button>
                            <span className="w-28 shrink-0 text-xs font-semibold tabular-nums text-slate-200">
                                {formatMediaPlaybackTime(currentTime)} / {formatMediaPlaybackTime(duration)}
                            </span>
                            <input
                                type="range"
                                aria-label={t("videoPreview.seek")}
                                min={0}
                                max={duration || 0}
                                step={0.01}
                                value={Math.min(currentTime, duration || currentTime)}
                                disabled={!duration}
                                onChange={handleSeek}
                                className="h-1.5 min-w-0 flex-1 cursor-pointer accent-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                            />
                            <div
                                ref={rateMenuRef}
                                className="relative z-30 shrink-0"
                            >
                                <button
                                    type="button"
                                    title={t("videoPreview.playbackRate")}
                                    aria-label={t("videoPreview.playbackRate")}
                                    aria-haspopup="menu"
                                    aria-expanded={isRateMenuOpen}
                                    onClick={() => setIsRateMenuOpen((open) => !open)}
                                    className="flex h-7 min-w-14 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 text-xs font-semibold text-white/90 transition-colors hover:bg-white/10"
                                >
                                    <Gauge size={14} />
                                    <span>{formatPlaybackRate(playbackRate, t("videoPreview.normalSpeed"))}</span>
                                </button>
                                {isRateMenuOpen && (
                                    <div
                                        role="menu"
                                        aria-label={t("videoPreview.playbackRate")}
                                        className="absolute bottom-full right-0 z-50 mb-2 w-28 overflow-hidden rounded-lg border border-white/10 bg-zinc-950/95 py-1 text-sm text-slate-100 shadow-2xl backdrop-blur-md"
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
                                                    <span>{formatPlaybackRate(rate, t("videoPreview.normalSpeed"))}</span>
                                                    {isActive && <Check size={14} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                title={isMuted ? t("videoPreview.unmute") : t("videoPreview.mute")}
                                aria-label={isMuted ? t("videoPreview.unmute") : t("videoPreview.mute")}
                                onClick={handleMuteToggle}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10"
                            >
                                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                            </button>
                            <input
                                type="range"
                                aria-label={t("videoPreview.volume")}
                                min={0}
                                max={1}
                                step={0.01}
                                value={isMuted ? 0 : volume}
                                onChange={handleVolumeChange}
                                className="h-1.5 w-24 cursor-pointer accent-indigo-400"
                            />
                            <button
                                type="button"
                                title={isFullscreen ? t("videoPreview.exitFullscreen") : t("videoPreview.fullscreen")}
                                aria-label={isFullscreen ? t("videoPreview.exitFullscreen") : t("videoPreview.fullscreen")}
                                onClick={handleFullscreenToggle}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10"
                            >
                                {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-slate-400 flex flex-col items-center gap-4">
                    <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 shadow-inner">
                        <Clapperboard size={64} className="opacity-20" />
                    </div>
                    <p className="text-sm font-medium tracking-wide">
                        {hasError ? t("videoPreview.mediaFailed") : t("videoPreview.noMedia")}
                    </p>
                </div>
            )}
        </div>
    );
}

export const VideoPreview = React.memo(VideoPreviewComponent);
