import { useEffect, useRef, useState } from "react";
import { Check, Gauge, Maximize2, Minimize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatMediaPlaybackTime } from "../../../utils/mediaTime";

const PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

function formatRate(rate: number, normalLabel: string) {
  return rate === 1 ? normalLabel : `${rate}`;
}

export function VideoPlaybackControls({
  width,
  currentTime,
  duration,
  playbackRate,
  volume,
  isMuted,
  isPlaying,
  isFullscreen,
  onPlayPause,
  onSeek,
  onRateChange,
  onVolumeChange,
  onMuteToggle,
  onFullscreenToggle,
}: {
  width: number;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  isPlaying: boolean;
  isFullscreen: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onRateChange: (rate: number) => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  onFullscreenToggle: () => void;
}) {
  const { t } = useTranslation("editor");
  const [isRateMenuOpen, setIsRateMenuOpen] = useState(false);
  const rateMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isRateMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      const menu = rateMenuRef.current;
      if (!menu || !(event.target instanceof Node) || !menu.contains(event.target)) {
        setIsRateMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsRateMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isRateMenuOpen]);

  return (
    <div
      className="mx-auto mt-1 shrink-0 rounded-lg border border-white/[0.07] bg-black/80 px-4 py-1 shadow-lg"
      style={{ width: width > 0 ? `${width}px` : "100%", maxWidth: "100%" }}
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          title={isPlaying ? t("videoPreview.pause") : t("videoPreview.play")}
          aria-label={isPlaying ? t("videoPreview.pause") : t("videoPreview.play")}
          onClick={onPlayPause}
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
          onChange={(event) => onSeek(Number(event.currentTarget.value))}
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
        />
        <div ref={rateMenuRef} className="relative z-30 shrink-0">
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
            <span>{formatRate(playbackRate, t("videoPreview.normalSpeed"))}</span>
          </button>
          {isRateMenuOpen && (
            <div
              role="menu"
              aria-label={t("videoPreview.playbackRate")}
              className="absolute bottom-full right-0 z-50 mb-2 w-28 overflow-hidden rounded-lg border border-white/10 bg-zinc-950/95 py-1 text-sm text-slate-100 shadow-2xl backdrop-blur-md"
            >
              {PLAYBACK_RATES.map((rate) => {
                const isActive = Math.abs(playbackRate - rate) < 0.001;
                return (
                  <button
                    key={rate}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => {
                      onRateChange(rate);
                      setIsRateMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left transition-colors ${
                      isActive ? "bg-indigo-500/20 text-indigo-200" : "text-slate-300 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <span>{formatRate(rate, t("videoPreview.normalSpeed"))}</span>
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
          onClick={onMuteToggle}
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
          onChange={(event) => onVolumeChange(Number(event.currentTarget.value))}
          className="h-1.5 w-24 cursor-pointer accent-indigo-400"
        />
        <button
          type="button"
          title={isFullscreen ? t("videoPreview.exitFullscreen") : t("videoPreview.fullscreen")}
          aria-label={isFullscreen ? t("videoPreview.exitFullscreen") : t("videoPreview.fullscreen")}
          onClick={onFullscreenToggle}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10"
        >
          {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </button>
      </div>
    </div>
  );
}
