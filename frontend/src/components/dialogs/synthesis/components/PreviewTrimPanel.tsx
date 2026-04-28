import { useTranslation } from "react-i18next";
import type { OutputSettingsState } from "../hooks/useOutputSettings";

type PreviewTrimPanelProps = {
  output: OutputSettingsState;
  currentTime: number;
  duration: number;
};

export function PreviewTrimPanel({ output, currentTime, duration }: PreviewTrimPanelProps) {
  const { t } = useTranslation("synthesis");
  const { trimStart, setTrimStart, trimEnd, setTrimEnd } = output;

  return (
    <div className="bg-[#1a1a1a] border-b border-white/5 px-6 py-3 flex items-center gap-6 animate-in slide-in-from-top-2 duration-200">
      <div className="flex items-center gap-3 text-xs">
        <span className="text-slate-400 font-medium w-8">{t("preview.trimStart")}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={trimEnd || duration || 100}
            step={0.1}
            value={trimStart}
            onChange={(e) => setTrimStart(Number(e.target.value))}
            className="bg-black/20 border border-white/10 rounded px-2 py-1 w-16 text-slate-200 focus:border-indigo-500 outline-none"
          />
          <span className="text-slate-500">{t("preview.seconds")}</span>
          <button
            onClick={() => setTrimStart(Number(currentTime.toFixed(1)))}
            className="ml-2 px-2 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-slate-300 hover:text-white transition-colors"
          >
            {t("preview.setCurrent")}
          </button>
        </div>
      </div>

      <div className="h-4 w-[1px] bg-white/5" />

      <div className="flex items-center gap-3 text-xs">
        <span className="text-slate-400 font-medium w-8">{t("preview.trimEnd")}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={trimStart}
            max={duration || 10000}
            step={0.1}
            value={trimEnd}
            onChange={(e) => setTrimEnd(Number(e.target.value))}
            className="bg-black/20 border border-white/10 rounded px-2 py-1 w-16 text-slate-200 focus:border-indigo-500 outline-none"
          />
          <span className="text-slate-500">{t("preview.seconds")}</span>
          <button
            onClick={() => setTrimEnd(Number(currentTime.toFixed(1)))}
            className="ml-2 px-2 py-1 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-slate-300 hover:text-white transition-colors"
          >
            {t("preview.setCurrent")}
          </button>
        </div>
      </div>
      <div className="h-4 w-[1px] bg-white/5" />
      <button
        onClick={() => { setTrimStart(0); setTrimEnd(0); }}
        className="text-xs text-slate-500 hover:text-red-400 underline decoration-slate-700 hover:decoration-red-400/50 underline-offset-2 transition-colors"
      >
        {t("preview.reset")}
      </button>
    </div>
  );
}
