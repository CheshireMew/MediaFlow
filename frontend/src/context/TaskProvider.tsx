import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTaskSocket } from "../hooks/tasks/useTaskSocket";
import { useTaskStore } from "../hooks/tasks/useTaskStore";
import { TaskActionsContext, TaskContext, TaskStatusContext } from "./taskContext";
import { isTaskActive } from "../services/tasks/taskRuntimeState";
import { resetTaskSourceDiagnostics } from "./taskSources/diagnostics";
import type { TaskSocketMessage } from "../hooks/tasks/useTaskStore";
import { apiClient } from "../api/client";
import { TaskStoreContext } from "./taskStoreContext";

const ACTIVE_TASK_RECONCILE_INTERVAL_MS = 5000;

type TaskProviderProps = { children: React.ReactNode; enabled?: boolean };

const TaskProviderSession: React.FC<TaskProviderProps> = ({
  children,
  enabled = true,
}) => {
  const [remoteSnapshotReady, setRemoteSnapshotReady] = useState(false);
  const {
    tasks,
    store,
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
  const handleSocketDisconnected = useCallback(() => {
    setRemoteSnapshotReady(false);
  }, []);
  const { connected: wsConnected, sendPause } = useTaskSocket({
    onMessage: applySocketMessage,
    onDisconnected: handleSocketDisconnected,
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

  const pauseTask = useCallback(async (taskId: string) => {
    if (!sendPause(taskId)) {
      await apiClient.pauseTask(taskId);
    }
  }, [sendPause]);

  const pauseAllTasks = useCallback(async () => {
    if (store.getSnapshot().some((task) => isTaskActive(task))) {
      await apiClient.pauseAllTasks();
    }
  }, [store]);

  const resumeTask = useCallback(async (taskId: string) => {
    await apiClient.resumeTask(taskId);
  }, []);

  const retryTask = useCallback(async (taskId: string) => {
    const receipt = await apiClient.retryTask(taskId);
    const task = await apiClient.getTaskStatus(receipt.task_id);
    applyMessage({ type: "merge_one", task });
  }, [applyMessage]);

  const deleteTask = useCallback(async (taskId: string) => {
    await apiClient.deleteTask(taskId);
    removeLocalTask(taskId);
  }, [removeLocalTask]);

  const clearTasks = useCallback(async () => {
    await apiClient.deleteAllTasks();
    clearLocalTasks();
  }, [clearLocalTasks]);

  useEffect(() => {
    resetTaskSourceDiagnostics();
  }, []);

  useEffect(() => {
    if (!enabled || !remoteSnapshotReady) {
      return;
    }

    let cancelled = false;
    void apiClient
      .listTasks()
      .then((historyTasks) => {
        if (!cancelled) {
          applyMessage({ type: "merge", tasks: historyTasks });
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
            applyMessage({ type: "merge_one", task });
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

  const actions = useMemo(() => ({
    pauseAllTasks,
    pauseTask,
    resumeTask,
    retryTask,
    addTask,
    deleteTask,
    clearTasks,
  }), [addTask, clearTasks, deleteTask, pauseAllTasks, pauseTask, resumeTask, retryTask]);
  const status = useMemo(() => ({
    connected,
    remoteTasksReady,
    tasksSettled,
  }), [connected, remoteTasksReady, tasksSettled]);
  const legacyValue = useMemo(() => ({
    tasks,
    ...status,
    ...actions,
  }), [actions, status, tasks]);

  return React.createElement(
    TaskStatusContext.Provider,
    { value: status },
    React.createElement(
      TaskActionsContext.Provider,
      { value: actions },
      React.createElement(
        TaskStoreContext.Provider,
        { value: store },
        React.createElement(TaskContext.Provider, { value: legacyValue }, children),
      ),
    ),
  );
};

export const TaskProvider: React.FC<TaskProviderProps> = ({
  children,
  enabled = true,
}) => (
  <TaskProviderSession key={enabled ? "enabled" : "disabled"} enabled={enabled}>
    {children}
  </TaskProviderSession>
);
