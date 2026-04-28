import { ChevronDown, Scissors, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CropState } from "../hooks/useCrop";
import type { OutputSettingsState } from "../hooks/useOutputSettings";

type PreviewToolbarProps = {
  output: OutputSettingsState;
  crop: CropState;
  isTrimOpen: boolean;
  setIsTrimOpen: (value: boolean) => void;
  onClose: () => void;
};

export function PreviewToolbar({
  output,
  crop,
  isTrimOpen,
  setIsTrimOpen,
  onClose,
}: PreviewToolbarProps) {
  const { t } = useTranslation("synthesis");
  const { quality, setQuality, isQualityMenuOpen, setIsQualityMenuOpen } = output;
  const qualityOptions: Array<{
    id: OutputSettingsState["quality"];
    label: string;
    desc: string;
  }> = [
    { id: "high", label: t("preview.qualityHigh"), desc: t("preview.qualityHighDesc") },
    { id: "balanced", label: t("preview.qualityBalanced"), desc: t("preview.qualityBalancedDesc") },
    { id: "small", label: t("preview.qualitySmall"), desc: t("preview.qualitySmallDesc") },
  ];

  return (
    <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#1a1a1a] shrink-0">
      <div className="flex items-center gap-4">
        <span className="text-slate-400 text-xs font-medium bg-white/5 px-2 py-1 rounded border border-white/5">
          {t("preview.previewMode")}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            onClick={() => setIsQualityMenuOpen(!isQualityMenuOpen)}
            className="flex items-center gap-2 bg-black/20 hover:bg-white/5 border border-white/5 hover:border-white/10 rounded-lg pl-3 pr-2 py-1.5 transition-all outline-none focus:ring-1 focus:ring-indigo-500/50 group"
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider leading-none">{t("preview.quality")}</span>
              <span className="text-xs text-slate-200 font-medium leading-none group-hover:text-white transition-colors">
                {quality === "high" ? t("preview.qualityHigh") : quality === "balanced" ? t("preview.qualityBalanced") : t("preview.qualitySmall")}
              </span>
            </div>
            <ChevronDown size={14} className={`text-slate-500 transition-transform duration-200 ${isQualityMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {isQualityMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsQualityMenuOpen(false)} />
              <div className="absolute top-full mt-2 right-0 w-56 bg-[#161616] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 py-1 ring-1 ring-black/50 animate-in fade-in zoom-in-95 duration-100">
                {qualityOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setQuality(opt.id);
                      setIsQualityMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 flex items-start gap-3 hover:bg-white/5 transition-colors ${quality === opt.id ? "bg-indigo-500/10" : ""}`}
                  >
                    <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${quality === opt.id ? "border-indigo-500 bg-indigo-500" : "border-slate-600"}`}>
                      {quality === opt.id && <div className="w-1 h-1 bg-white rounded-full" />}
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-xs font-medium ${quality === opt.id ? "text-indigo-300" : "text-slate-200"}`}>
                        {opt.label}
                      </span>
                      <span className="text-[10px] text-slate-500">{opt.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="h-4 w-[1px] bg-white/10" />

        <button
          onClick={() => setIsTrimOpen(!isTrimOpen)}
          className={`p-1.5 rounded-lg transition-all ${isTrimOpen ? "bg-indigo-500/20 text-indigo-400" : "hover:bg-white/10 text-slate-400 hover:text-white"}`}
          title={t("preview.trimVideo")}
        >
          <Scissors size={18} />
        </button>

        <button
          onClick={() => crop.setIsEnabled(!crop.isEnabled)}
          className={`p-1.5 rounded-lg transition-all ${crop.isEnabled ? "bg-indigo-500/20 text-indigo-400" : "hover:bg-white/10 text-slate-400 hover:text-white"}`}
          title={t("preview.cropVideo")}
        >
          <div className="relative">
            <div className="absolute inset-0 border-2 border-current opacity-50 rounded-sm" />
            <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-current" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-current" />
            <div className="w-4 h-4" />
          </div>
        </button>

        <div className="h-4 w-[1px] bg-white/10" />
        <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
