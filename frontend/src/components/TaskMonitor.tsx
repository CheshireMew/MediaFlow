import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen } from "lucide-react";
import { useTaskContext } from "../context/taskContext";
import type { Task, TaskResult } from "../types/task";
import { useTaskMonitorOverview } from "./task-monitor/useTaskMonitorOverview";
import { canRetryTask, retryFailedTask } from "../services/tasks/taskRetry";
import { TaskMonitorHeader } from "./task-monitor/TaskMonitorHeader";
import { TaskMonitorItem } from "./task-monitor/TaskMonitorItem";

type TaskWithDetails = Task & { result?: TaskResult };

export const TaskMonitor: React.FC<{ filterTypes?: string[]; showHeaderOverview?: boolean }> = ({
  filterTypes,
  showHeaderOverview = true,
}) => {
  const { t } = useTranslation("taskmonitor");
  const { pauseTask, resumeTask, addTask, deleteTask } = useTaskContext();
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const {
    connected,
    desktopRuntime,
    executionBadges,
    executionSummary,
    filteredTasks,
    remoteTasksReady,
    summary,
    taskFeedDiagnostics,
    taskOwnerMode,
  } = useTaskMonitorOverview(filterTypes);

  const toggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleResumeAction = React.useCallback(async (task: TaskWithDetails) => {
    if (task.status === "paused") {
      await resumeTask(task.id);
      return;
    }

    if (task.status === "failed" && canRetryTask(task)) {
      await retryFailedTask(task, addTask);
    }
  }, [addTask, resumeTask]);

  return (
    <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl shadow-2xl overflow-hidden h-full flex flex-col">
      <TaskMonitorHeader
        showHeaderOverview={showHeaderOverview}
        connected={connected}
        desktopRuntime={desktopRuntime}
        remoteTasksReady={remoteTasksReady}
        taskOwnerMode={taskOwnerMode}
        summary={summary}
        executionBadges={executionBadges}
      />

      {taskFeedDiagnostics.lastIssue && (
        <div className="px-4 py-2 border-b border-amber-500/10 bg-amber-500/10 text-[11px] text-amber-200">
          Ignored incompatible task feed item.
          {` reason=${taskFeedDiagnostics.lastIssue.reason}, expected=${taskFeedDiagnostics.lastIssue.expected}, received=${taskFeedDiagnostics.lastIssue.received}, ignored=${taskFeedDiagnostics.ignoredTaskCount}`}
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
        {filteredTasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 p-8">
            <FolderOpen className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-sm">{t("emptyState.message")}</p>
          </div>
        ) : (
          filteredTasks.map((task) => (
            <TaskMonitorItem
              key={task.id}
              task={task}
              expanded={expandedTasks.has(task.id)}
              executionSummary={executionSummary}
              onToggleExpand={toggleExpand}
              onPause={(taskId) => {
                void pauseTask(taskId);
              }}
              onDelete={(taskId) => {
                void Promise.resolve(deleteTask(taskId)).catch((err) => console.error(err));
              }}
              onResume={(nextTask) => {
                void Promise.resolve(handleResumeAction(nextTask)).catch((err) => console.error(err));
              }}
            />
          ))
        )}
      </div>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { bg: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #444; }
      `}</style>
    </div>
  );
};
