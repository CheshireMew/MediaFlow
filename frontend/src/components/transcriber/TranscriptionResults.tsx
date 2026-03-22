import { FileText, Clapperboard, ArrowRight, FolderOpen, Scissors } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isDesktopRuntime } from "../../services/domain";
import { fileService } from "../../services/fileService";
import { createNavigationMediaPayload } from "../../services/ui/navigation";
import { normalizeTranscribeResult } from "../../services/ui/transcribeResult";
import type { TranscribeResult } from "../../types/transcriber";

interface TranscriptionResultsProps {
  result: TranscribeResult | null;
  isSmartSplitting: boolean;
  onSmartSplit: () => void | Promise<void>;
  onSendToEditor: () => void;
  onSendToTranslator: (payload: {
    video_ref?: TranscribeResult["video_ref"] | null;
    subtitle_ref?: TranscribeResult["subtitle_ref"] | null;
  }) => void;
}

type TranslatorPayload = {
  video_ref?: TranscribeResult["video_ref"] | null;
  subtitle_ref?: TranscribeResult["subtitle_ref"] | null;
};

export function TranscriptionResults({
  result,
  isSmartSplitting,
  onSmartSplit,
  onSendToEditor,
  onSendToTranslator,
}: TranscriptionResultsProps) {
  const { t } = useTranslation("transcriber");
  const normalizedResult = normalizeTranscribeResult(result);

  return (
    <div className="h-full flex flex-col bg-[#1a1a1a] border border-white/5 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
           <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
             <FileText className="w-4 h-4 text-indigo-400" />
           </div>
           {t("results.title")}
        </h2>
        {result && result.segments && (
          <div className="flex items-center gap-3">
            <button
              onClick={onSmartSplit}
              disabled={isSmartSplitting}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 disabled:bg-white/5 text-amber-300 disabled:text-slate-500 border border-amber-500/20 disabled:border-white/5 text-sm font-medium transition-colors"
            >
              <Scissors className="w-4 h-4" />
              {isSmartSplitting ? t("actions.smartSplitting") : t("actions.smartSplit")}
            </button>
            <div className="px-2.5 py-1 rounded-md bg-white/5 border border-white/5 text-xs font-mono text-slate-400 flex items-center gap-2">
              <span>{t("results.segmentsCount", { count: result.segments.length })}</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-0 scroll-smooth custom-scrollbar bg-black/20">
        {result && result.segments && result.segments.length > 0 ? (
          <div className="divide-y divide-white/5">
            {result.segments.map((seg, idx) => (
              <div key={seg.id} className="flex gap-4 p-4 hover:bg-white/[0.02] transition-colors group">
                <div className="w-8 text-xs text-slate-600 font-mono pt-1 text-right shrink-0 select-none">
                  {idx + 1}
                </div>
                <div className="text-slate-500 w-20 shrink-0 select-none text-xs font-mono pt-1">
                  {new Date(seg.start * 1000).toISOString().substr(11, 8)}
                </div>
                <div className="text-slate-300 group-hover:text-white transition-colors text-sm leading-relaxed">
                  {seg.text}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
               <FileText className="w-8 h-8 opacity-20" />
            </div>
            <p className="text-sm font-medium">{t("results.empty")}</p>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {normalizedResult && (
        <div className="p-4 border-t border-white/5 bg-white/[0.02] flex justify-between items-center gap-4">
             {normalizedResult.subtitle_ref?.path && (
                 <button 
                  onClick={() => isDesktopRuntime() && void fileService.showInExplorer(normalizedResult.subtitle_ref!.path)}
                  className="text-xs text-slate-500 hover:text-indigo-400 flex items-center gap-1.5 transition-colors px-3 py-2 rounded-lg hover:bg-white/5"
                 >
                   <FolderOpen className="w-3.5 h-3.5" />
                   <span className="truncate max-w-[200px]">{normalizedResult.subtitle_ref.path}</span>
                 </button>
             )}

            <div className="flex gap-3">
                <button
                onClick={() => {
                    const payload: TranslatorPayload = createNavigationMediaPayload({
                        videoPath: null,
                        subtitlePath: null,
                        videoRef: normalizedResult.video_ref ?? null,
                        subtitleRef: normalizedResult.subtitle_ref ?? null,
                    });
                    if (payload.video_ref?.path && payload.subtitle_ref?.path) {
                            onSendToTranslator(payload); 
                    } else {
                        alert(t("results.missingSubtitleAlert"));
                    }
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 hover:border-indigo-500/30 rounded-xl text-sm font-medium transition-all"
                >
                <ArrowRight size={16} />
                {t("actions.translate")}
                </button>
                <button
                onClick={onSendToEditor}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:shadow-lg hover:shadow-purple-500/20 text-white rounded-xl text-sm font-medium transition-all transform hover:-translate-y-0.5"
                >
                <Clapperboard size={16} />
                {t("actions.openEditor")}
                </button>
            </div>
        </div>
      )}
    </div>
  );
}
