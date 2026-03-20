import { useState, useRef, useCallback, useEffect, RefObject } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';

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
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isSeeking, setIsSeeking] = useState(false);
    const progressRef = useRef<HTMLDivElement>(null);

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

    // ── Progress bar seek ────────────────────────────────────────
    const seekTo = useCallback((clientX: number) => {
        const v = videoRef.current;
        const bar = progressRef.current;
        if (!v || !bar) return;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        v.currentTime = ratio * v.duration;
    }, [videoRef]);

    const handleProgressMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsSeeking(true);
        seekTo(e.clientX);
    };

    // Window-level drag for robust seeking
    useEffect(() => {
        if (!isSeeking) return;
        const onMove = (e: MouseEvent) => seekTo(e.clientX);
        const onUp = () => setIsSeeking(false);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, [isSeeking, seekTo]);

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="h-10 bg-[#141414] border-t border-white/5 flex items-center gap-3 px-4 select-none">
            {/* Play / Pause */}
            <button onClick={togglePlay} className="text-slate-300 hover:text-white transition-colors">
                {isPlaying
                    ? <Pause size={16} fill="currentColor" />
                    : <Play size={16} fill="currentColor" />}
            </button>

            {/* Time */}
            <span className="text-[11px] font-mono text-slate-500 w-24 text-center tabular-nums">
                {fmt(currentTime)} / {fmt(duration)}
            </span>

            {/* Progress Bar */}
            <div
                ref={progressRef}
                className="flex-1 h-1 bg-white/10 rounded-full cursor-pointer group relative"
                onMouseDown={handleProgressMouseDown}
            >
                {/* Filled track */}
                <div
                    className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full transition-[width] duration-75"
                    style={{ width: `${progress}%` }}
                />
                {/* Thumb */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ left: `calc(${progress}% - 6px)` }}
                />
            </div>

            {/* Volume */}
            <button onClick={toggleMute} className="text-slate-400 hover:text-white transition-colors">
                {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
                type="range" min="0" max="1" step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 accent-indigo-500 cursor-pointer"
            />
        </div>
    );
};
