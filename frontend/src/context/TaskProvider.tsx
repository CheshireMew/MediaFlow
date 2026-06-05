import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTaskSocket } from "../hooks/tasks/useTaskSocket";
import { useTaskStore } from "../hooks/tasks/useTaskStore";
import { TaskContext } from "./taskContext";
import { isTaskActive } from "../services/tasks/taskRuntimeState";
import { resetTaskSourceDiagnostics } from "./taskSources/diagnostics";
import type { TaskSocketMessage } from "../hooks/tasks/useTaskStore";
import { apiClient } from "../api/client";

const ACTIVE_TASK_RECONCILE_INTERVAL_MS = 5000;

export const TaskProvider: React.FC<{ children: React.ReactNode; enabled?: boolean }> = ({
  children,
  enabled = true,
}) => {
  const [remoteSnapshotReady, setRemoteSnapshotReady] = useState(false);
  const {
    tasks,
    applyMessage,
    addTask,
    deleteTask: removeLocalTask,
    clearTasks: clearLocalTasks,
  } = useTaskStore();
  const applySocketMessage = useCallback(
    (message: TaskSocketMessage) => {
      applyMessage(message);
      if (message.type === "snapshot") {
        setRemoteSnapshotReady(true);
      }
    },
    [applyMessage],
  );
  const { connected: wsConnected, sendPause } = useTaskSocket({
    onMessage: applySocketMessage,
    enabled,
  });
  const connected = enabled && wsConnected;
  const remoteTasksReady = enabled && remoteSnapshotReady;
  const tasksSettled = !enabled || remoteSnapshotReady;
  const activeTaskKey = useMemo(
    () =>
      tasks
        .filter((task) => isTaskActive(task))
        .map((task) => task.id)
        .sort()
        .join("\u0000"),
    [tasks],
  );

  const pauseTask = async (taskId: string) => {
    sendPause?.(taskId);
  };

  const pauseAllTasks = async () => {
    if (tasks.some((task) => isTaskActive(task))) {
      await apiClient.pauseAllTasks();
    }
  };

  const resumeTask = async (taskId: string) => {
    await apiClient.resumeTask(taskId);
  };

  const deleteTask = async (taskId: string) => {
    await apiClient.deleteTask(taskId);
    removeLocalTask(taskId);
  };

  const clearTasks = async () => {
    await apiClient.deleteAllTasks();
    clearLocalTasks();
  };

  useEffect(() => {
    resetTaskSourceDiagnostics();
  }, []);

  useEffect(() => {
    if (!enabled) {
      setRemoteSnapshotReady(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !remoteSnapshotReady) {
      return;
    }

    let cancelled = false;
    void apiClient
      .listTasks()
      .then((historyTasks) => {
        if (!cancelled) {
          applyMessage({ type: "snapshot", tasks: historyTasks });
        }
      })
      .catch((error) => {
        console.error("Failed to load task history:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [applyMessage, enabled, remoteSnapshotReady]);

  useEffect(() => {
    if (!enabled || !remoteSnapshotReady || !activeTaskKey) {
      return;
    }

    let cancelled = false;
    const activeTaskIds = activeTaskKey.split("\u0000").filter(Boolean);

    const reconcileActiveTasks = async () => {
      try {
        const taskResults = await Promise.all(
          activeTaskIds.map(async (taskId) => {
            try {
              return await apiClient.getTaskStatus(taskId);
            } catch (error) {
              console.error(`Failed to reconcile task ${taskId}:`, error);
              return null;
            }
          }),
        );

        if (cancelled) {
          return;
        }

        taskResults.forEach((task) => {
          if (task) {
            applyMessage({ type: "update", task });
          }
        });
      } catch (error) {
        console.error("Failed to reconcile active tasks:", error);
      }
    };

    void reconcileActiveTasks();
    const intervalId = setInterval(
      () => void reconcileActiveTasks(),
      ACTIVE_TASK_RECONCILE_INTERVAL_MS,
    );

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [activeTaskKey, applyMessage, enabled, remoteSnapshotReady]);

  return React.createElement(
    TaskContext.Provider,
    {
      value: {
        tasks,
        connected,
        remoteTasksReady,
        tasksSettled,
        pauseAllTasks,
        pauseTask,
        resumeTask,
        addTask,
        deleteTask,
        clearTasks,
      },
    },
    children,
  );
};
