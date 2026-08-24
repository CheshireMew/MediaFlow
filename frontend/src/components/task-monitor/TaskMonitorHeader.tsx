import { Activity, Pause, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTaskActions } from "../../context/taskContext";
import { useConfirmation } from "../ui/confirmationContext";
import { toast } from "../../utils/toast";

type TaskMonitorHeaderProps = {
  showHeaderOverview: boolean;
  connected: boolean;
  remoteTasksReady: boolean;
  summary: {
    pending: number;
    running: number;
    paused: number;
  };
  taskCount: number;
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
  remoteTasksReady,
  summary,
  taskCount,
  executionBadges,
}: TaskMonitorHeaderProps) {
  const { t } = useTranslation("taskmonitor");
  const confirmAction = useConfirmation();
  const {
    pauseAllTasks,
    clearTasks,
  } = useTaskActions();
  const taskFeedReady = connected && remoteTasksReady;

  return (
    <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-white/[0.02] p-3 sm:p-4">
      <h3 className="text-base font-semibold text-white flex items-center gap-2">
        <Activity className="w-4 h-4 text-indigo-400" />
        {t("title")}
      </h3>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
        {showHeaderOverview && (
          <>
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-400">
              <span className="px-2 py-1 rounded-md bg-amber-400/10 text-amber-300 border border-amber-400/20">
                {t("queue.pending")} {summary.pending}
              </span>
              <span className="px-2 py-1 rounded-md bg-indigo-400/10 text-indigo-300 border border-indigo-400/20">
                {t("queue.running")} {summary.running}
              </span>
              <span className="px-2 py-1 rounded-md bg-slate-400/10 text-slate-300 border border-slate-400/20">
                {t("queue.paused")} {summary.paused}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium flex items-center gap-1.5 ${taskFeedReady ? "text-emerald-400" : "text-rose-400"}`}>
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${taskFeedReady ? "bg-emerald-400" : "bg-rose-400"}`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${taskFeedReady ? "bg-emerald-500" : "bg-rose-500"}`} />
                </span>
                {t("status.tasks")}: {taskFeedReady ? t("status.ready") : t("status.waiting")}
              </span>
            </div>
            {executionBadges.length > 0 && (
              <div className="hidden lg:flex items-center gap-2 text-xs">
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
            type="button"
            onClick={async () => {
              const confirmed = await confirmAction({
                title: t("buttons.pauseAll.label"),
                message: t("confirm.pauseAllTasks"),
              });
              if (!confirmed) return;
              try {
                await pauseAllTasks();
              } catch (error) {
                console.error(error);
                toast.error(t("messages.pauseAllFailed"));
              }
            }}
            disabled={!taskFeedReady || summary.pending + summary.running === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 text-xs transition-all hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            title={t("buttons.pauseAll.tooltip")}
          >
            <Pause size={12} />
            <span className="hidden min-[1100px]:inline">{t("buttons.pauseAll.label")}</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              const confirmed = await confirmAction({
                title: t("buttons.clearAll.label"),
                message: t("confirm.deleteAllTasks"),
                tone: "danger",
              });
              if (!confirmed) return;
              try {
                await clearTasks();
              } catch (error) {
                console.error(error);
                toast.error(t("messages.clearAllFailed"));
              }
            }}
            disabled={taskCount === 0}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 text-xs transition-all hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
            title={t("buttons.clearAll.tooltip")}
          >
            <Trash2 size={12} />
            <span className="hidden min-[1100px]:inline">{t("buttons.clearAll.label")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
