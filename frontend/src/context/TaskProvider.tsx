import React, { useCallback, useEffect, useState } from "react";
import { useTaskSocket } from "../hooks/tasks/useTaskSocket";
import { useTaskStore } from "../hooks/tasks/useTaskStore";
import { apiClient } from "../api/client";
import { TaskContext } from "./taskContext";
import { isTaskActive } from "../services/tasks/taskRuntimeState";
import { resetTaskSourceDiagnostics } from "./taskSources/diagnostics";
import type { TaskSocketMessage } from "../hooks/tasks/useTaskStore";

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
