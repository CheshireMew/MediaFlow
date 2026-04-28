import { Activity, Pause, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTaskContext } from "../../context/taskContext";

type TaskMonitorHeaderProps = {
  showHeaderOverview: boolean;
  connected: boolean;
  desktopRuntime: boolean;
  remoteTasksReady: boolean;
  taskOwnerMode: string;
  summary: {
    pending: number;
    running: number;
    paused: number;
  };
  executionBadges: Array<{
    key: string;
    label: string;
    count: number;
    className: string;
  }>;
};

export function TaskMonitorHeader({
  showHeaderOverview,
  connected,
  desktopRuntime,
  remoteTasksReady,
  taskOwnerMode,
  summary,
  executionBadges,
}: TaskMonitorHeaderProps) {
  const { t } = useTranslation("taskmonitor");
  const {
    pauseLocalTasks,
    pauseRemoteTasks,
    pauseAllTasks,
    clearTasks,
  } = useTaskContext();

  return (
    <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02] flex-none">
      <h3 className="text-base font-semibold text-white flex items-center gap-2">
        <Activity className="w-4 h-4 text-indigo-400" />
        {t("title")}
      </h3>
      <div className="flex items-center gap-4">
        {showHeaderOverview && (
          <>
            <div className="hidden md:flex items-center gap-2 text-[10px] text-slate-400">
              <span className="px-2 py-1 rounded-md bg-amber-400/10 text-amber-300 border border-amber-400/20">
                Queue {summary.pending}
              </span>
              <span className="px-2 py-1 rounded-md bg-indigo-400/10 text-indigo-300 border border-indigo-400/20">
                Running {summary.running}
              </span>
              <span className="px-2 py-1 rounded-md bg-slate-400/10 text-slate-300 border border-slate-400/20">
                Paused {summary.paused}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2 py-1 rounded-md bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 text-[10px] font-mono">
                owner {taskOwnerMode}
              </span>
              <span className={`text-[10px] font-medium flex items-center gap-1.5 ${connected ? "text-emerald-400" : "text-rose-400"}`}>
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${connected ? "bg-emerald-400" : "bg-rose-400"}`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${connected ? "bg-emerald-500" : "bg-rose-500"}`} />
                </span>
                {t("status.localTasks")}: {connected ? t("status.ready") : t("status.waiting")}
              </span>
              {!desktopRuntime && (
                <span className={`text-[10px] font-medium flex items-center gap-1.5 ${remoteTasksReady ? "text-emerald-400" : "text-rose-400"}`}>
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${remoteTasksReady ? "bg-emerald-400" : "bg-rose-400"}`} />
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${remoteTasksReady ? "bg-emerald-500" : "bg-rose-500"}`} />
                  </span>
                  {t("status.backendTasks")}: {remoteTasksReady ? t("status.ready") : t("status.waiting")}
                </span>
              )}
            </div>
            {executionBadges.length > 0 && (
              <div className="hidden lg:flex items-center gap-2 text-[10px]">
                {executionBadges.map((badge) => (
                  <span key={badge.key} className={`px-2 py-1 rounded-md border font-mono ${badge.className}`}>
                    {badge.label} {badge.count}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => {
              if (confirm(t("buttons.pauseLocal.tooltip"))) {
                pauseLocalTasks().catch((err) => console.error(err));
              }
            }}
            disabled={!connected}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 text-[10px] transition-all hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            title={t("buttons.pauseLocal.tooltip")}
          >
            <Pause size={12} />
            {t("buttons.pauseLocal.label")}
          </button>

          {!desktopRuntime && (
            <button
              onClick={() => {
                if (confirm(t("buttons.pauseBackend.tooltip"))) {
                  pauseRemoteTasks().catch((err) => console.error(err));
                }
              }}
              disabled={!remoteTasksReady}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 text-[10px] transition-all hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              title={t("buttons.pauseBackend.tooltip")}
            >
              <Pause size={12} />
              {t("buttons.pauseBackend.label")}
            </button>
          )}

          <button
            onClick={() => {
              if (confirm(t("buttons.pauseAll.tooltip"))) {
                pauseAllTasks().catch((err) => console.error(err));
              }
            }}
            disabled={desktopRuntime ? !connected : (!connected && !remoteTasksReady)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 text-[10px] transition-all hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            title={t("buttons.pauseAll.tooltip")}
          >
            <Pause size={12} />
            {t("buttons.pauseAll.label")}
          </button>

          <button
            onClick={() => {
              if (confirm(t("confirm.deleteAllTasks"))) {
                clearTasks().catch((err) => console.error(err));
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-[10px] transition-all hover:text-rose-300"
            title={t("buttons.clearAll.tooltip")}
          >
            <Trash2 size={12} />
            {t("buttons.clearAll.label")}
          </button>
        </div>
      </div>
    </div>
  );
}
