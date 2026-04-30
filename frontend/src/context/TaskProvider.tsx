import React, { useEffect, useMemo, useState } from "react";
import { useTaskSocket } from "../hooks/tasks/useTaskSocket";
import { useTaskStore } from "../hooks/tasks/useTaskStore";
import { apiClient } from "../api/client";
import { TaskContext } from "./taskContext";
import { TASK_OWNER_MODE } from "../contracts/runtimeContracts";
import { applyTaskSnapshot } from "./taskSources/shared";
import { isTaskActive } from "../services/tasks/taskRuntimeState";
import { resetTaskSourceDiagnostics } from "./taskSources/diagnostics";

export const TaskProvider: React.FC<{ children: React.ReactNode; enabled?: boolean }> = ({
  children,
  enabled = true,
}) => {
  const taskOwnerMode = TASK_OWNER_MODE;
  const [remoteSnapshotReady, setRemoteSnapshotReady] = useState(false);
  const {
    tasks,
    applyMessage,
    addTask,
    deleteTask: removeLocalTask,
    clearTasks: clearLocalTasks,
  } = useTaskStore();
  const { connected: wsConnected, sendPause } = useTaskSocket({
    onMessage: applyMessage,
    enabled,
  });
  const shouldPollRemoteTasks = useMemo(
    () => tasks.some((task) => isTaskActive(task)),
    [tasks],
  );
  const connected = enabled && wsConnected;
  const remoteTasksReady = enabled && remoteSnapshotReady;
  const tasksSettled = !enabled || remoteSnapshotReady;

  const pauseTask = async (taskId: string) => {
    sendPause?.(taskId);
  };

  const pauseLocalTasks = async () => {
    return;
  };

  const pauseRemoteTasks = async () => {
    if (tasks.some((task) => isTaskActive(task))) {
      await apiClient.pauseAllTasks();
    }
  };

  const pauseAllTasks = async () => {
    await pauseRemoteTasks();
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
      return;
    }

    let cancelled = false;

    const syncRemoteTasks = async () => {
      try {
        const remoteTasks = await apiClient.listTasks();
        if (cancelled) {
          return;
        }

        applyTaskSnapshot(
          clearLocalTasks,
          applyMessage,
          () => true,
          remoteTasks,
          taskOwnerMode,
        );
        setRemoteSnapshotReady(true);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load backend task snapshot", error);
        }
      }
    };

    const shouldKeepPolling = !remoteSnapshotReady || shouldPollRemoteTasks;
    if (!shouldKeepPolling) {
      return;
    }

    void syncRemoteTasks();

    const interval = setInterval(() => {
      void syncRemoteTasks();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    applyMessage,
    clearLocalTasks,
    enabled,
    remoteSnapshotReady,
    shouldPollRemoteTasks,
    taskOwnerMode,
  ]);

  return React.createElement(
    TaskContext.Provider,
    {
      value: {
        tasks,
        connected,
        remoteTasksReady,
        tasksSettled,
        taskOwnerMode,
        pauseLocalTasks,
        pauseRemoteTasks,
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
