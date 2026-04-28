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
import type { Task, TaskResult } from "../../types/task";
import { fileService } from "../../services/fileService";
import {
  createTaskDiagnostic,
  type RuntimeExecutionSummary,
} from "../../services/debug/runtimeDiagnostics";
import { canRetryTask } from "../../services/tasks/taskRetry";
import {
  hasTaskSubtitleMedia,
  hasTaskVideoMedia,
  resolveTaskMediaPaths,
  resolveTaskNavigationPayload,
} from "../../services/ui/taskMedia";
import { NavigationService } from "../../services/ui/navigation";
import { TaskTraceView } from "../TaskTraceView";
import { formatTaskDisplayId } from "./taskIdDisplay";

type TaskWithDetails = Task & { result?: TaskResult };

type TaskMonitorItemProps = {
  task: TaskWithDetails;
  expanded: boolean;
  executionSummary: RuntimeExecutionSummary;
  onToggleExpand: (taskId: string) => void;
  onPause: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onResume: (task: TaskWithDetails) => void;
};

const clampProgress = (progress: number) => {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
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

function useTaskTypeInfo(task: TaskWithDetails) {
  const { t } = useTranslation("taskmonitor");
  const { type, name, request_params } = task;
  const isDownloadPipeline = type === "pipeline" && (
    name?.toLowerCase().includes("download") ||
    request_params?.steps?.some((step) => step.step_name === "download" || step.action === "download")
  );

  if (type === "download" || isDownloadPipeline) {
    return { icon: <Download size={16} />, label: t("taskTypes.download"), color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" };
  }

  switch (type) {
    case "transcribe": return { icon: <FileAudio size={16} />, label: t("taskTypes.transcribe"), color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" };
    case "translate": return { icon: <Languages size={16} />, label: t("taskTypes.translate"), color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20" };
    case "pipeline":
    case "synthesize":
    case "synthesis": return { icon: <Video size={16} />, label: t("taskTypes.synthesize"), color: "text-pink-400", bg: "bg-pink-400/10", border: "border-pink-400/20" };
    default: return { icon: <Activity size={16} />, label: t("taskTypes.generic"), color: "text-slate-400", bg: "bg-slate-400/10", border: "border-slate-400/20" };
  }
}

function QueueBadge({ task }: { task: TaskWithDetails }) {
  const { t } = useTranslation("taskmonitor");
  if (task.persistence_scope === "history") {
    return (
      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border bg-emerald-400/10 text-emerald-300 border-emerald-400/20">
        {t("badges.history")}
      </span>
    );
  }
  if (task.queue_state === "queued" || task.status === "pending") {
    return (
      <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border bg-amber-400/10 text-amber-300 border-amber-400/20">
        {task.queue_position ? `Queue #${task.queue_position}` : "Queued"}
      </span>
    );
  }
  if (task.queue_state === "running" || task.status === "running") {
    return <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border bg-indigo-400/10 text-indigo-300 border-indigo-400/20">Running</span>;
  }
  if (task.queue_state === "paused" || task.status === "paused") {
    return <span className="px-2 py-0.5 rounded-md text-[10px] font-medium border bg-slate-400/10 text-slate-300 border-slate-400/20">Paused</span>;
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
  const typeInfo = useTaskTypeInfo(task);
  const hasVideo = task.status === "completed" && hasTaskVideoMedia(task);
  const hasSubtitle = task.status === "completed" && hasTaskSubtitleMedia(task);

  return (
    <div className="p-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors group relative">
      <div className="flex items-start gap-4">
        <div className="bg-white/5 p-2 rounded-lg shrink-0 mt-0.5">
          <TaskStatusIcon status={task.status} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium border ${typeInfo.bg} ${typeInfo.color} ${typeInfo.border}`}>
                {typeInfo.icon}
                <span className="uppercase tracking-wider">{typeInfo.label}</span>
              </div>
              <QueueBadge task={task} />
              <span className="text-[10px] text-slate-600 font-mono tracking-wide">
                {formatTaskDisplayId(task.id)}
              </span>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {(task.status === "running" || task.status === "pending") && (
                <button
                  onClick={() => onPause(task.id)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                  title={t("actions.pause.tooltip")}
                >
                  <Pause size={14} />
                </button>
              )}

              {(task.status === "paused" || canRetryTask(task)) && (
                <button
                  onClick={() => onResume(task)}
                  className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-emerald-500 transition-colors"
                  title={t("actions.resume.tooltip")}
                >
                  <Play size={14} />
                </button>
              )}

              <button
                onClick={() => {
                  if (confirm(t("confirm.deleteTask"))) onDelete(task.id);
                }}
                className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 transition-colors"
                title={t("actions.delete.tooltip")}
              >
                <Trash2 size={14} />
              </button>

              {task.status === "completed" && (
                <div className="flex items-center gap-1 ml-2">
                  <div className="w-px h-3 bg-white/10 mx-1" />
                  {(hasVideo || hasSubtitle) && (
                    <button
                      onClick={() => {
                        void resolveTaskMediaPaths(task).then(({ contextPath }) => {
                          if (contextPath) return fileService.showInExplorer(contextPath);
                        });
                      }}
                      className="p-1.5 rounded-lg hover:bg-blue-500/20 text-slate-400 hover:text-blue-400 transition-colors"
                      title={t("actions.showFolder.tooltip")}
                    >
                      <FolderOpen size={14} />
                    </button>
                  )}
                  {hasVideo && task.type !== "transcribe" && (
                    <TaskNavigationButton task={task} destination="transcriber" title="Transcribe">
                      <FileAudio size={14} />
                    </TaskNavigationButton>
                  )}
                  {hasSubtitle && task.type !== "translate" && (
                    <TaskNavigationButton task={task} destination="translator" title="Translate">
                      <Languages size={14} />
                    </TaskNavigationButton>
                  )}
                  {hasVideo && (
                    <TaskNavigationButton task={task} destination="editor" title="Edit Video">
                      <Video size={14} />
                    </TaskNavigationButton>
                  )}
                </div>
              )}

              {task.result?.meta?.execution_trace && (
                <button
                  onClick={() => onToggleExpand(task.id)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors ml-1"
                >
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              )}
            </div>
          </div>

          <div className="font-medium text-slate-200 text-sm leading-relaxed truncate pr-8" title={task.name || task.type}>
            {task.name || (task.type === "download" ? t("messages.downloading") : t("taskTypes.generic"))}
          </div>

          <div className="mt-3 flex items-center justify-between gap-6">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 truncate flex items-center gap-2">
                {task.error ? (
                  <span className="text-rose-400 flex items-center gap-1.5">
                    <AlertCircle size={12} />
                    {task.error}
                  </span>
                ) : (
                  task.message || t("messages.initializing")
                )}
              </p>
            </div>

            {(task.status === "running" || task.progress > 0) && (
              <div className="w-48 flex items-center gap-3 shrink-0">
                <div className="h-1.5 flex-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out"
                    style={{ width: `${clampProgress(task.progress)}%` }}
                  />
                </div>
                <div className="text-[10px] font-mono text-slate-400 w-8 text-right">
                  {Math.round(clampProgress(task.progress))}%
                </div>
              </div>
            )}
          </div>

          {import.meta.env.DEV && (
            <details className="mt-2 text-[10px] text-slate-600 cursor-pointer">
              <summary className="hover:text-slate-400">Debug Info</summary>
              <pre className="mt-1 p-2 bg-black/50 rounded overflow-auto max-h-40 whitespace-pre-wrap">
                {JSON.stringify(createTaskDiagnostic(task, executionSummary), null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>

      {expanded && task.result?.meta?.execution_trace && (
        <div className="mt-3 pl-[52px]">
          <div className="bg-black/30 rounded-lg overflow-hidden border border-white/5">
            <TaskTraceView trace={task.result.meta.execution_trace} />
          </div>
        </div>
      )}
    </div>
  );
}

function TaskNavigationButton({
  task,
  destination,
  title,
  children,
}: {
  task: TaskWithDetails;
  destination: "transcriber" | "translator" | "editor";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => {
        void resolveTaskNavigationPayload(task).then((payload) => {
          const hasRequiredMedia =
            destination === "translator"
              ? Boolean(payload.subtitle_ref?.path)
              : Boolean(payload.video_ref?.path);
          if (hasRequiredMedia) {
            NavigationService.navigate(destination, payload);
          }
        });
      }}
      className="p-1.5 rounded-lg hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-400 transition-colors"
      title={title}
    >
      {children}
    </button>
  );
}
