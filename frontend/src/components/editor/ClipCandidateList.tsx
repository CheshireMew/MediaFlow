import { Check, Download, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ClipCandidate } from "../../types/task";

type ClipCandidateListProps = {
  candidates: ClipCandidate[];
  activeClipId: string | null;
  isDetecting: boolean;
  isExporting: boolean;
  canDetect: boolean;
  onDetect: () => void | Promise<void>;
  onExportSelected: () => void | Promise<void>;
  onExportSourceSelected: () => void | Promise<void>;
  onClipClick: (id: string) => void;
  onToggleSelected: (id: string) => void;
  onDeleteClip: (id: string) => void;
};

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}.${ms}`;
}

export function ClipCandidateList({
  candidates,
  activeClipId,
  isDetecting,
  isExporting,
  canDetect,
  onDetect,
  onExportSelected,
  onExportSourceSelected,
  onClipClick,
  onToggleSelected,
  onDeleteClip,
}: ClipCandidateListProps) {
  const { t } = useTranslation("editor");
  const selectedCount = candidates.filter((candidate) => candidate.selected).length;

  return (
    <div className="flex h-full flex-col border-r border-white/5 bg-[#141414]">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/5 bg-[#181818] px-3 py-2">
        <button
          onClick={onDetect}
          disabled={isDetecting || !canDetect}
          title={canDetect ? t("clips.detectTooltip") : t("clips.requiresSubtitlesTooltip")}
          className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {isDetecting ? t("clips.detectingButton") : t("clips.detectButton")}
        </button>
        <button
          onClick={onExportSelected}
          disabled={selectedCount === 0 || isExporting}
          title={t("clips.exportBurnedTooltip")}
          className="ml-auto flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {isExporting
            ? t("clips.exportingButton")
            : t("clips.exportSelectedButton", { count: selectedCount })}
        </button>
        <button
          onClick={onExportSourceSelected}
          disabled={selectedCount === 0 || isExporting}
          title={t("clips.exportSourceTooltip")}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-400 transition-colors hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex bg-[#111] text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <div className="w-[72px] px-3 py-1.5">{t("clips.columnRange")}</div>
        <div className="flex-1 px-3 py-1.5">{t("clips.columnCandidate")}</div>
        <div className="w-16 py-1.5 text-center">{t("clips.columnUse")}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[#090909] custom-scrollbar">
        {candidates.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-slate-600/70">
            <Sparkles className="h-10 w-10 text-slate-700" />
            <p>{t("clips.emptyState")}</p>
          </div>
        ) : (
          candidates.map((candidate, index) => {
            const isActive = activeClipId === candidate.id;
            return (
              <div
                key={candidate.id}
                onClick={() => onClipClick(candidate.id)}
                className={[
                  "group relative flex min-h-[74px] cursor-pointer border-b border-white/[0.035] transition-colors",
                  isActive
                    ? "bg-amber-500/12 shadow-[inset_3px_0_0_rgba(251,191,36,0.9)]"
                    : "hover:bg-white/[0.025]",
                  candidate.selected ? "" : "opacity-55",
                ].join(" ")}
              >
                <div className="flex w-[72px] shrink-0 flex-col items-center justify-center gap-1 px-2 font-mono text-[10px] text-slate-500">
                  <span className={isActive ? "text-amber-300" : ""}>
                    {formatTime(candidate.start)}
                  </span>
                  <span className="text-slate-700">-</span>
                  <span className={isActive ? "text-amber-300" : ""}>
                    {formatTime(candidate.end)}
                  </span>
                </div>

                <div className="min-w-0 flex-1 py-2 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                      #{index + 1}
                    </span>
                    <p
                      className={[
                        "truncate text-[13px] font-semibold",
                        isActive ? "text-white" : "text-slate-300",
                      ].join(" ")}
                      title={candidate.title ?? undefined}
                    >
                      {candidate.title || t("clips.untitled")}
                    </p>
                  </div>
                  <p className="mt-1 overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] text-[11px] leading-relaxed text-slate-500">
                    {candidate.reason || t("clips.noReason")}
                  </p>
                </div>

                <div className="flex w-16 shrink-0 items-center justify-center gap-1 pr-2">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleSelected(candidate.id);
                    }}
                    className={[
                      "flex h-7 w-7 items-center justify-center rounded-lg border transition-colors",
                      candidate.selected
                        ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                        : "border-white/10 bg-white/[0.03] text-slate-500 hover:text-slate-300",
                    ].join(" ")}
                    title={t("clips.toggleSelectedTooltip")}
                  >
                    <Check size={13} />
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteClip(candidate.id);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/5 bg-white/[0.02] text-slate-600 opacity-0 transition-colors hover:border-rose-500/20 hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"
                    title={t("clips.deleteTooltip")}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
