import { Download, Play, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

type PreviewActionBarProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  currentTime: number;
  duration: number;
  onTimeUpdate: (time: number) => void;
  onSynthesizeClick: () => void;
  isSynthesizing: boolean;
  synthesisProgress: number;
  synthesisMessage: string;
};

export function PreviewActionBar({
  videoRef,
  currentTime,
  duration,
  onTimeUpdate,
  onSynthesizeClick,
  isSynthesizing,
  synthesisProgress,
  synthesisMessage,
}: PreviewActionBarProps) {
  const { t } = useTranslation("synthesis");

  return (
    <div className="h-16 bg-[#1a1a1a] border-t border-white/5 px-6 flex items-center gap-6 shrink-0 relative z-20">
      <button
        onClick={() => {
          if (videoRef.current?.paused) videoRef.current.play();
          else videoRef.current?.pause();
        }}
        className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full text-slate-200 border border-white/5 hover:border-white/20 transition-all active:scale-95"
      >
        <Play size={18} fill="currentColor" className="ml-0.5" />
      </button>

      <div className="flex-1 flex flex-col justify-center gap-1.5 pt-1">
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={(e) => {
            const nextTime = Number(e.target.value);
            onTimeUpdate(nextTime);
            if (videoRef.current) videoRef.current.currentTime = nextTime;
          }}
          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
        />
        <div className="flex justify-between px-0.5">
          <span className="text-[10px] text-slate-500 font-mono">
            {currentTime.toFixed(1)}s
          </span>
          <span className="text-[10px] text-slate-600 font-mono">
            {duration > 0 ? `${duration.toFixed(1)}s` : "--s"}
          </span>
        </div>
      </div>

      <div className="h-8 w-[1px] bg-white/5 mx-2" />

      <div className="flex items-center gap-3 min-w-[260px] justify-end">
        {isSynthesizing && (
          <div className="w-44">
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
              <span className="truncate max-w-[120px]" title={synthesisMessage || t("preview.preparingSynthesis")}>
                {synthesisMessage || t("preview.preparingSynthesis")}
              </span>
              <span className="font-mono text-slate-300">
                {synthesisProgress.toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${Math.max(0, Math.min(100, synthesisProgress))}%` }}
              />
            </div>
          </div>
        )}

        <button
          onClick={onSynthesizeClick}
          disabled={isSynthesizing}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 transition-all active:scale-95"
        >
          {isSynthesizing ? <Settings2 className="animate-spin" size={18} /> : <Download size={18} />}
          <span>{isSynthesizing ? t("preview.rendering") : t("preview.startRender")}</span>
        </button>
      </div>
    </div>
  );
}
