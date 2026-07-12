import { useState, useEffect } from 'react';
import type { RefObject } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface VideoControlBarProps {
    videoRef: RefObject<HTMLVideoElement>;
    currentTime: number;
    duration: number;
}

/** Format seconds to mm:ss */
function fmt(s: number): string {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

export const VideoControlBar = ({ videoRef, currentTime, duration }: VideoControlBarProps) => {
    const { t } = useTranslation('preprocessing');
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);

    // Sync play/pause state with video element
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        v.addEventListener('play', onPlay);
        v.addEventListener('pause', onPause);
        return () => { v.removeEventListener('play', onPlay); v.removeEventListener('pause', onPause); };
    }, [videoRef]);

    const togglePlay = () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) {
            void v.play();
        } else {
            v.pause();
        }
    };

    const toggleMute = () => {
        const v = videoRef.current;
        if (!v) return;
        v.muted = !v.muted;
        setIsMuted(v.muted);
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = videoRef.current;
        if (!v) return;
        const val = parseFloat(e.target.value);
        v.volume = val;
        setVolume(val);
        if (val > 0 && v.muted) { v.muted = false; setIsMuted(false); }
    };

    const handleProgressChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = Number(event.target.value);
    };

    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const normalizedCurrentTime = Number.isFinite(currentTime) ? currentTime : 0;
    const safeCurrentTime = Math.max(0, Math.min(safeDuration, normalizedCurrentTime));
    const progress = safeDuration > 0 ? (safeCurrentTime / safeDuration) * 100 : 0;

    return (
        <div className="h-10 bg-[#141414] border-t border-white/5 flex items-center gap-3 px-4 select-none">
            {/* Play / Pause */}
            <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? t('player.pause') : t('player.play')}
                title={isPlaying ? t('player.pause') : t('player.play')}
                className="text-slate-300 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
            >
                {isPlaying
                    ? <Pause size={16} fill="currentColor" />
                    : <Play size={16} fill="currentColor" />}
            </button>

            {/* Time */}
            <span className="text-xs font-mono text-slate-400 w-24 text-center tabular-nums">
                {fmt(currentTime)} / {fmt(duration)}
            </span>

            {/* Progress Bar */}
            <div
                className="group relative h-1 flex-1 rounded-full bg-white/10"
            >
                {/* Filled track */}
                <div
                    className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full transition-[width] duration-75"
                    style={{ width: `${progress}%` }}
                />
                {/* Thumb */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                    style={{ left: `calc(${progress}% - 6px)` }}
                />
                <input
                    type="range"
                    min="0"
                    max={safeDuration}
                    step="0.1"
                    value={safeCurrentTime}
                    onChange={handleProgressChange}
                    aria-label={t('player.seek')}
                    className="peer absolute -inset-x-1 -inset-y-2 z-10 w-[calc(100%+0.5rem)] cursor-pointer opacity-0"
                />
                <div className="pointer-events-none absolute -inset-x-1 -inset-y-2 rounded-md peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400" />
            </div>

            {/* Volume */}
            <button
                type="button"
                onClick={toggleMute}
                aria-label={isMuted || volume === 0 ? t('player.unmute') : t('player.mute')}
                title={isMuted || volume === 0 ? t('player.unmute') : t('player.mute')}
                className="text-slate-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
            >
                {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
                type="range" min="0" max="1" step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label={t('player.volume')}
                className="w-16 h-1 accent-indigo-500 cursor-pointer"
            />
        </div>
    );
};
