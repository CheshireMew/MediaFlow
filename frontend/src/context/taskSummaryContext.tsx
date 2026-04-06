import React, { useEffect, useMemo, useRef, useState } from "react";

import type { TaskQueueSummaryResponse } from "../types/api";
import type { Task } from "../types/task";
import type { TaskSocketMessage } from "../hooks/tasks/useTaskStore";
import { getApiUrl } from "../api/runtime";
import { desktopEventsService, desktopTaskService, isDesktopRuntime } from "../services/desktop";
import { isTaskQueued, isTaskRunning } from "../services/tasks/taskRuntimeState";
import { TaskSummaryContext, type TaskSummaryContextType } from "./taskSummaryShared";

function isActiveTask(task: Task) {
  return isTaskQueued(task) || isTaskRunning(task);
}

function countActiveTasks(tasks: Task[]) {
  return tasks.reduce((count, task) => count + (isActiveTask(task) ? 1 : 0), 0);
}

export function TaskSummaryProvider({
  children,
  enabled = true,
}: {
  children: React.ReactNode;
  enabled?: boolean;
}) {
  const desktopRuntime = isDesktopRuntime();
  const desktopActiveTaskIdsRef = useRef<Set<string>>(new Set());
  const [summaryState, setSummaryState] = useState<TaskSummaryContextType>({
    activeTaskCount: 0,
    ready: !enabled,
  });

  useEffect(() => {
    if (!enabled) {
      desktopActiveTaskIdsRef.current = new Set();
      setSummaryState({
        activeTaskCount: 0,
        ready: false,
      });
      return;
    }

    if (desktopRuntime) {
      let cancelled = false;
      let frameId = 0;

      const syncDesktopSummary = async () => {
        try {
          const tasks = await desktopTaskService.listTasks();
          if (cancelled) {
            return;
          }
          desktopActiveTaskIdsRef.current = new Set(
            tasks.filter(isActiveTask).map((task) => task.id),
          );
          setSummaryState({
            activeTaskCount: countActiveTasks(tasks),
            ready: true,
          });
        } catch (error) {
          if (!cancelled) {
            console.error("Failed to load task summary", error);
          }
        }
      };

      const applyDesktopEvent = (message: TaskSocketMessage) => {
        const nextActiveTaskIds = new Set(desktopActiveTaskIdsRef.current);
        if (message.type === "snapshot") {
          desktopActiveTaskIdsRef.current = new Set(
            message.tasks.filter(isActiveTask).map((task) => task.id),
          );
          setSummaryState({
            activeTaskCount: desktopActiveTaskIdsRef.current.size,
            ready: true,
          });
          return;
        }

        if (message.type === "delete") {
          nextActiveTaskIds.delete(message.task_id);
        } else if (isActiveTask(message.task)) {
          nextActiveTaskIds.add(message.task.id);
        } else {
          nextActiveTaskIds.delete(message.task.id);
        }

        desktopActiveTaskIdsRef.current = nextActiveTaskIds;
        setSummaryState({
          activeTaskCount: nextActiveTaskIds.size,
          ready: true,
        });
      };

      frameId = window.requestAnimationFrame(() => {
        void syncDesktopSummary();
      });
      const unsubscribe = desktopEventsService.onTaskEvent((payload) => {
        if (
          payload &&
          typeof payload === "object" &&
          "type" in payload &&
          typeof (payload as { type?: unknown }).type === "string"
        ) {
          applyDesktopEvent(payload as TaskSocketMessage);
        }
      });

      return () => {
        cancelled = true;
        window.cancelAnimationFrame(frameId);
        unsubscribe();
      };
    }

    let cancelled = false;
    let frameId = 0;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const syncRemoteSummary = async () => {
      try {
        const response = await fetch(getApiUrl("/tasks/queue/summary"));
        if (!response.ok) {
          throw new Error(`Task summary request failed: ${response.status} ${response.statusText}`);
        }
        const summary = (await response.json()) as TaskQueueSummaryResponse;
        if (cancelled) {
          return;
        }
        setSummaryState({
          activeTaskCount: summary.running + summary.queued,
          ready: true,
        });
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load task summary", error);
        }
      }
    };

    frameId = window.requestAnimationFrame(() => {
      void syncRemoteSummary();
      intervalId = setInterval(() => {
        void syncRemoteSummary();
      }, 5000);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [desktopRuntime, enabled]);

  const value = useMemo(
    () => summaryState,
    [summaryState],
  );

  return React.createElement(TaskSummaryContext.Provider, { value }, children);
}
