import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { OutputSettingsState } from "../hooks/useOutputSettings";

type PreviewTrimPanelProps = {
  output: OutputSettingsState;
  currentTime: number;
  duration: number;
  automaticRange?: { start: number; end: number } | null;
};

export function PreviewTrimPanel({
  output,
  currentTime,
  duration,
  automaticRange = null,
}: PreviewTrimPanelProps) {
  const { t } = useTranslation("synthesis");
  const { trimStart, setTrimStart, trimEnd, setTrimEnd } = output;
  const trimStartId = useId();
  const trimEndId = useId();
  const displayedTrimStart = trimStart > 0 ? trimStart : automaticRange?.start ?? 0;
  const displayedTrimEnd = trimEnd > 0 ? trimEnd : automaticRange?.end ?? 0;

  return (
    <div className="bg-[#1a1a1a] border-b border-white/5 px-6 py-3 flex items-center gap-6 animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-3 text-xs">
        <label htmlFor={trimStartId} className="text-slate-400 font-medium w-8">{t("preview.trimStart")}</label>
        <div className="flex items-center gap-1">
          <input
            id={trimStartId}
            type="number"
            min={0}
            max={displayedTrimEnd || duration || 100}
            step={0.1}
            value={displayedTrimStart}
            onChange={(e) => setTrimStart(Number(e.target.value))}
            className="bg-black/20 border border-white/10 rounded px-2 py-1 w-16 text-slate-200 focus:border-indigo-500 outline-none"
          />
          <span className="text-slate-400">{t("preview.seconds")}</span>
          <button
            type="button"
            onClick={() => setTrimStart(Number(currentTime.toFixed(1)))}
            className="ml-2 px-2 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-slate-300 hover:text-white transition-colors"
          >
            {t("preview.setCurrent")}
          </button>
        </div>
      </div>

      <div className="h-4 w-[1px] bg-white/5" />

      <div className="flex items-center gap-3 text-xs">
        <label htmlFor={trimEndId} className="text-slate-400 font-medium w-8">{t("preview.trimEnd")}</label>
        <div className="flex items-center gap-1">
          <input
            id={trimEndId}
            type="number"
            min={displayedTrimStart}
            max={duration || 10000}
            step={0.1}
            value={displayedTrimEnd}
            onChange={(e) => setTrimEnd(Number(e.target.value))}
            className="bg-black/20 border border-white/10 rounded px-2 py-1 w-16 text-slate-200 focus:border-indigo-500 outline-none"
          />
          <span className="text-slate-400">{t("preview.seconds")}</span>
          <button
            type="button"
            onClick={() => setTrimEnd(Number(currentTime.toFixed(1)))}
            className="ml-2 px-2 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-slate-300 hover:text-white transition-colors"
          >
            {t("preview.setCurrent")}
          </button>
        </div>
      </div>
      <div className="h-4 w-[1px] bg-white/5" />
      <button
        type="button"
        onClick={() => { setTrimStart(0); setTrimEnd(0); }}
        className="text-xs text-slate-400 hover:text-red-400 underline decoration-slate-700 hover:decoration-red-400/50 underline-offset-2 transition-colors"
      >
        {t("preview.reset")}
      </button>
    </div>
  );
}
