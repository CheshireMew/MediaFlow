import {
  AlertCircle,
  Check,
  CheckCircle2,
  FolderOpen,
  Loader2,
  PauseCircle,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ClipCandidate } from "../../types/task";

type ClipCandidateListProps = {
  candidates: ClipCandidate[];
  activeClipId: string | null;
  isDetecting: boolean;
  isExporting: boolean;
  exportTask?: {
    status: string;
    progress: number;
    message?: string | null;
    error?: string | null;
    outputCount?: number;
    onOpenOutput?: () => void;
  } | null;
  canDetect: boolean;
  canCreate: boolean;
  onDetect: () => void | Promise<void>;
  onCreateClip: () => void;
  onConfigureExport: () => void;
  onQuickExport: () => void | Promise<void>;
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
  exportTask,
  canDetect,
  canCreate,
  onDetect,
  onCreateClip,
  onConfigureExport,
  onQuickExport,
  onClipClick,
  onToggleSelected,
  onDeleteClip,
}: ClipCandidateListProps) {
  const { t } = useTranslation("editor");
  const selectedCount = candidates.filter((candidate) => candidate.selected).length;
  const exportTaskIsTerminal = exportTask?.status === "completed" ||
    exportTask?.status === "failed" ||
    exportTask?.status === "cancelled";

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
          onClick={onCreateClip}
          disabled={!canCreate}
          title={t("clips.createTooltip")}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("clips.createButton")}
        </button>
        <button
          onClick={onConfigureExport}
          disabled={selectedCount === 0 || isExporting}
          title={t("clips.configureExportTooltip")}
          className="ml-auto flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Settings2 className="h-3.5 w-3.5" />
          {t("clips.configureExportButton", { count: selectedCount })}
        </button>
        <button
          onClick={onQuickExport}
          disabled={selectedCount === 0 || isExporting}
          title={t("clips.quickExportTooltip")}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          {isExporting ? t("clips.submittingButton") : t("clips.quickExportButton")}
        </button>
      </div>

      {exportTask && (
        <div className="flex items-center gap-2 border-b border-white/5 bg-[#121212] px-3 py-2 text-[11px]">
          {exportTask.status === "completed" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : exportTask.status === "failed" ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          ) : exportTask.status === "paused" || exportTask.status === "cancelled" ? (
            <PauseCircle className="h-4 w-4 shrink-0 text-amber-400" />
          ) : (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-400" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-slate-300">
              {exportTask.status === "completed"
                ? t("clips.exportCompleted", { count: exportTask.outputCount ?? 0 })
                : exportTask.status === "failed"
                  ? exportTask.error || t("clips.exportError")
                  : exportTask.status === "cancelled"
                    ? t("clips.exportCancelled")
                    : exportTask.status === "paused"
                      ? t("clips.exportPaused")
                  : exportTask.message || t("clips.exportInProgress")}
            </p>
            {!exportTaskIsTerminal && exportTask.status !== "paused" && (
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${Math.max(2, Math.min(100, exportTask.progress))}%` }}
                />
              </div>
            )}
          </div>
          {exportTask.status === "completed" && exportTask.onOpenOutput && (
            <button
              onClick={exportTask.onOpenOutput}
              className="flex shrink-0 items-center gap-1 rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-blue-300 hover:bg-blue-500/20"
            >
              <FolderOpen size={12} /> {t("clips.openOutputFolder")}
            </button>
          )}
        </div>
      )}

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
