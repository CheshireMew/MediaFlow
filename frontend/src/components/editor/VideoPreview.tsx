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
} from "lucide-react";
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

function formatMediaTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return "0:00";
    }

    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function VideoPreviewComponent({
    mediaUrl,
    videoRef,
    regions,
    onLoadedMetadata
}: VideoPreviewProps) {
    // 内部管理时间状态，不传递给父组件
    const [currentTime, setCurrentTime] = useState(0);
    const panelRef = React.useRef<HTMLDivElement>(null);
    const stageRef = React.useRef<HTMLDivElement>(null);
    const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
    const [mediaSize, setMediaSize] = useState({ width: 0, height: 0 });
    const [duration, setDuration] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isRateMenuOpen, setIsRateMenuOpen] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

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
        <div className="flex-1 bg-black/40 flex flex-col relative justify-center items-center backdrop-blur-sm">
            {mediaUrl && !hasError ? (
                <div
                    ref={panelRef}
                    data-testid="editor-video-preview-panel"
                    className="w-full h-full min-h-0 relative p-6 flex flex-col gap-3 bg-black/40"
                >
                    <div
                        ref={stageRef}
                        className="flex-1 min-h-0 relative flex items-center justify-center bg-black/50 rounded-lg overflow-hidden border border-white/5 shadow-2xl ring-1 ring-white/5"
                    >
                        <div
                            role="button"
                            tabIndex={0}
                            aria-label={isPlaying ? "暂停视频画面" : "播放视频画面"}
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
                            {/* Overlay Subtitles (Improved Typography) */}
                            <div
                                className={`absolute left-0 right-0 text-center pointer-events-none ${
                                    isFullscreen ? "bottom-24 px-16" : "bottom-16 px-12"
                                }`}
                            >
                                {currentSubtitle && (
                                    <span
                                        data-testid="editor-preview-subtitle"
                                        className={`inline-block max-w-[90%] bg-black/60 text-white/95 rounded-lg font-medium shadow-lg backdrop-blur-md border border-white/10 leading-relaxed break-words ${
                                            isFullscreen ? "px-8 py-4 text-3xl" : "px-6 py-3 text-lg"
                                        }`}
                                    >
                                        {currentSubtitle}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="shrink-0 rounded-lg border border-white/10 bg-black/55 px-3 py-2 shadow-lg backdrop-blur-md">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                title={isPlaying ? "暂停" : "播放"}
                                aria-label={isPlaying ? "暂停" : "播放"}
                                onClick={handlePlayPause}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10"
                            >
                                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                            </button>
                            <span className="w-28 shrink-0 text-xs font-semibold tabular-nums text-slate-200">
                                {formatMediaTime(currentTime)} / {formatMediaTime(duration)}
                            </span>
                            <input
                                type="range"
                                aria-label="播放进度"
                                min={0}
                                max={duration || 0}
                                step={0.01}
                                value={Math.min(currentTime, duration || currentTime)}
                                disabled={!duration}
                                onChange={handleSeek}
                                className="h-1.5 min-w-0 flex-1 cursor-pointer accent-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                            />
                            <div
                                className="relative shrink-0"
                                onMouseLeave={() => setIsRateMenuOpen(false)}
                            >
                                <button
                                    type="button"
                                    title="播放速度"
                                    aria-label="播放速度"
                                    aria-haspopup="menu"
                                    aria-expanded={isRateMenuOpen}
                                    onClick={() => setIsRateMenuOpen((open) => !open)}
                                    className="flex h-9 min-w-16 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-xs font-semibold text-white/90 transition-colors hover:bg-white/10"
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
                            <button
                                type="button"
                                title={isMuted ? "取消静音" : "静音"}
                                aria-label={isMuted ? "取消静音" : "静音"}
                                onClick={handleMuteToggle}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10"
                            >
                                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                            </button>
                            <input
                                type="range"
                                aria-label="音量"
                                min={0}
                                max={1}
                                step={0.01}
                                value={isMuted ? 0 : volume}
                                onChange={handleVolumeChange}
                                className="h-1.5 w-24 cursor-pointer accent-indigo-400"
                            />
                            <button
                                type="button"
                                title={isFullscreen ? "缩小" : "全屏"}
                                aria-label={isFullscreen ? "缩小" : "全屏"}
                                onClick={handleFullscreenToggle}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10"
                            >
                                {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                            </button>
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
