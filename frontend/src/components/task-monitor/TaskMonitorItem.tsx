import {
  Activity,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileAudio,
  FolderOpen,
  Languages,
  Loader,
  Pause,
  Play,
  Trash2,
  Video,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Task } from "../../types/task";
import { fileService } from "../../services/fileService";
import {
  createTaskDiagnostic,
  type RuntimeExecutionSummary,
} from "../../services/debug/runtimeDiagnostics";
import { canRetryTask } from "../../services/tasks/taskRuntimeState";
import {
  hasTaskSubtitleMedia,
  hasTaskTranscribableMedia,
  hasTaskVideoMedia,
  resolveTaskRevealTarget,
  resolveTaskNavigationPayload,
} from "../../services/ui/taskMedia";
import {
  createNavigationMediaPayload,
  NavigationService,
} from "../../services/ui/navigation";
import { clampProgress } from "../../utils/number";
import { TaskTraceView } from "../TaskTraceView";
import { formatTaskDisplayId } from "./taskIdDisplay";
import { useConfirmation } from "../ui/confirmationContext";
import { toast } from "../../utils/toast";
import { translateTaskMessage } from "../../services/ui/taskMessage";

type TaskMonitorItemProps = {
  task: Task;
  expanded: boolean;
  executionSummary: RuntimeExecutionSummary;
  onToggleExpand: (taskId: string) => void;
  onPause: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onResume: (task: Task) => void;
};

function TaskStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed": return <CheckCircle size={18} color="#10b981" />;
    case "failed": return <AlertCircle size={18} color="#ef4444" />;
    case "running": return <Loader size={18} className="spin" color="#4F46E5" />;
    case "pending": return <Clock size={18} color="#f59e0b" />;
    case "paused": return <Pause size={18} color="#f59e0b" />;
    case "cancelled": return <Pause size={18} color="#ef4444" />;
    default: return null;
  }
}

function useTaskTypeInfo(task: Task) {
  const { t } = useTranslation("taskmonitor");
  const { primary_operation } = task;

  if (primary_operation === "download") {
    return { icon: <Download size={16} />, label: t("taskTypes.download"), color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" };
  }

  switch (primary_operation) {
    case "transcribe": return { icon: <FileAudio size={16} />, label: t("taskTypes.transcribe"), color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" };
    case "translate": return { icon: <Languages size={16} />, label: t("taskTypes.translate"), color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20" };
    case "synthesis": return { icon: <Video size={16} />, label: t("taskTypes.synthesize"), color: "text-pink-400", bg: "bg-pink-400/10", border: "border-pink-400/20" };
    default: return { icon: <Activity size={16} />, label: t("taskTypes.generic"), color: "text-slate-400", bg: "bg-slate-400/10", border: "border-slate-400/20" };
  }
}

function QueueBadge({ task }: { task: Task }) {
  const { t } = useTranslation("taskmonitor");
  if (task.persistence_scope === "history") {
    return (
      <span className="px-2 py-0.5 rounded-md text-xs font-medium border bg-emerald-400/10 text-emerald-300 border-emerald-400/20">
        {t("badges.history")}
      </span>
    );
  }
  if (task.queue_state === "queued" || task.status === "pending") {
    return (
      <span className="px-2 py-0.5 rounded-md text-xs font-medium border bg-amber-400/10 text-amber-300 border-amber-400/20">
        {task.queue_position ? t("queue.position", { position: task.queue_position }) : t("queue.queued")}
      </span>
    );
  }
  if (task.queue_state === "running" || task.status === "running") {
    return <span className="px-2 py-0.5 rounded-md text-xs font-medium border bg-indigo-400/10 text-indigo-300 border-indigo-400/20">{t("queue.running")}</span>;
  }
  if (task.queue_state === "paused" || task.status === "paused") {
    return <span className="px-2 py-0.5 rounded-md text-xs font-medium border bg-slate-400/10 text-slate-300 border-slate-400/20">{t("queue.paused")}</span>;
  }
  return null;
}

export function TaskMonitorItem({
  task,
  expanded,
  executionSummary,
  onToggleExpand,
  onPause,
  onDelete,
  onResume,
}: TaskMonitorItemProps) {
  const { t } = useTranslation("taskmonitor");
  const confirmAction = useConfirmation();
  const typeInfo = useTaskTypeInfo(task);
  const hasVideo = task.status === "completed" && hasTaskVideoMedia(task);
  const hasTranscribableMedia = task.status === "completed" && hasTaskTranscribableMedia(task);
  const hasSubtitle = task.status === "completed" && hasTaskSubtitleMedia(task);
  const canPauseTask =
    task.status === "pending" ||
    task.status === "running";
  const traceId = `task-trace-${task.id}`;

  return (
    <article
      aria-label={t("taskCardLabel", { type: typeInfo.label, name: task.name || task.type })}
      className="p-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors group relative"
    >
      <div className="flex items-start gap-4">
        <div className="bg-white/5 p-2 rounded-lg shrink-0 mt-0.5">
          <TaskStatusIcon status={task.status} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border ${typeInfo.bg} ${typeInfo.color} ${typeInfo.border}`}>
                {typeInfo.icon}
                <span className="uppercase tracking-wider">{typeInfo.label}</span>
              </div>
              <QueueBadge task={task} />
              <span className="text-xs text-slate-400 font-mono tracking-wide">
                {formatTaskDisplayId(task.id)}
              </span>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1">
              {canPauseTask && (
                <button
                  type="button"
                  aria-label={t("actions.pause.tooltip")}
                  onClick={() => onPause(task.id)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  title={t("actions.pause.tooltip")}
                >
                  <Pause size={14} />
                </button>
              )}

              {(task.status === "paused" || canRetryTask(task)) && (
                <button
                  type="button"
                  aria-label={t("actions.resume.tooltip")}
                  onClick={() => onResume(task)}
                  className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-emerald-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  title={t("actions.resume.tooltip")}
                >
                  <Play size={14} />
                </button>
              )}

              <button
                type="button"
                aria-label={t("actions.delete.tooltip")}
                onClick={async () => {
                  const confirmed = await confirmAction({
                    title: t("actions.delete.tooltip"),
                    message: t("confirm.deleteTask"),
                    tone: "danger",
                  });
                  if (!confirmed) return;
                  try {
                    await onDelete(task.id);
                  } catch (error) {
                    console.error(error);
                    toast.error(t("messages.deleteFailed"));
                  }
                }}
                className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                title={t("actions.delete.tooltip")}
              >
                <Trash2 size={14} />
              </button>

              {task.status === "completed" && (
                <div className="flex items-center gap-1 ml-2">
                  <div aria-hidden="true" className="w-px h-3 bg-white/10 mx-1" />
                  {(hasVideo || hasSubtitle) && (
                    <button
                      type="button"
                      aria-label={t("actions.showFolder.tooltip")}
                      onClick={() => {
                        void (async () => {
                          try {
                            const target = await resolveTaskRevealTarget(task);
                            if (!target.path) {
                              toast.error(t("messages.mediaMissing"));
                              return;
                            }
                            if (target.usedFallback) {
                              toast.warning(t("messages.outputMissingUsingSource"));
                            }
                            await fileService.showInExplorer(target.path);
                          } catch {
                            toast.error(t("messages.showFolderFailed"));
                          }
                        })();
                      }}
                      className="p-1.5 rounded-lg hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                      title={t("actions.showFolder.tooltip")}
                    >
                      <FolderOpen size={14} />
                    </button>
                  )}
                  {hasTranscribableMedia && task.primary_operation !== "transcribe" && (
                    <TaskNavigationButton task={task} destination="transcriber" title={t("actions.transcribe.tooltip")}>
                      <FileAudio size={14} />
                    </TaskNavigationButton>
                  )}
                  {hasSubtitle && task.primary_operation !== "translate" && (
                    <TaskNavigationButton task={task} destination="translator" title={t("actions.translate.tooltip")}>
                      <Languages size={14} />
                    </TaskNavigationButton>
                  )}
                  {hasVideo && (
                    <TaskNavigationButton task={task} destination="editor" title={t("actions.edit.tooltip")}>
                      <Video size={14} />
                    </TaskNavigationButton>
                  )}
                </div>
              )}

              {task.result?.execution_trace?.length ? (
                <button
                  type="button"
                  aria-label={expanded ? t("actions.collapse.tooltip") : t("actions.expand.tooltip")}
                  aria-expanded={expanded}
                  aria-controls={traceId}
                  onClick={() => onToggleExpand(task.id)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              ) : null}
            </div>
          </div>

          <div className="font-medium text-slate-200 text-sm leading-relaxed truncate pr-8" title={task.name || task.type}>
            {task.name || (task.primary_operation === "download" ? t("messages.downloading") : t("taskTypes.generic"))}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 truncate flex items-center gap-2">
                {task.error ? (
                  <span className="text-rose-400 flex items-center gap-1.5">
                    <AlertCircle size={12} />
                    {task.error}
                  </span>
                ) : (
                  translateTaskMessage(t, task)
                )}
              </p>
            </div>

            {(task.status === "running" || task.progress > 0) && (
              <div className="flex w-full shrink-0 items-center gap-3 sm:w-48">
                <div
                  role="progressbar"
                  aria-label={t("progress.label")}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(clampProgress(task.progress))}
                  className="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden"
                >
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out"
                    style={{ width: `${clampProgress(task.progress)}%` }}
                  />
                </div>
                <div className="text-xs font-mono text-slate-400 w-8 text-right">
                  {Math.round(clampProgress(task.progress))}%
                </div>
              </div>
            )}
          </div>

          {import.meta.env.DEV && (
            <details className="mt-2 text-xs text-slate-400 cursor-pointer">
              <summary className="hover:text-slate-400">{t("debugInfo")}</summary>
              <pre className="mt-1 p-2 bg-black/50 rounded overflow-auto max-h-40 whitespace-pre-wrap">
                {JSON.stringify(createTaskDiagnostic(task, executionSummary), null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>

      {expanded && task.result?.execution_trace?.length ? (
        <div id={traceId} className="mt-3 pl-[52px]">
          <div className="bg-black/30 rounded-lg overflow-hidden border border-white/5">
            <TaskTraceView trace={task.result.execution_trace} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

function TaskNavigationButton({
  task,
  destination,
  title,
  children,
}: {
  task: Task;
  destination: "transcriber" | "translator" | "editor";
  title: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation("taskmonitor");
  return (
    <button
      type="button"
      aria-label={title}
      onClick={() => {
        void resolveTaskNavigationPayload(task).then((payload) => {
          const hasRequiredMedia =
            destination === "translator"
              ? Boolean(payload.subtitle_ref?.path)
              : Boolean(payload.video_ref?.path);
          if (hasRequiredMedia) {
            NavigationService.navigate(destination, payload);
            return;
          }
          toast.error(t("messages.mediaMissingOpenManually"));
          NavigationService.navigate(destination, createNavigationMediaPayload({}));
        }).catch(() => {
          toast.error(t("messages.mediaResolveFailed"));
        });
      }}
      className="p-1.5 rounded-lg hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      title={title}
    >
      {children}
    </button>
  );
}
