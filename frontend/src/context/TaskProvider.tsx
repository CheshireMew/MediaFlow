import React, { useCallback, useEffect, useState } from "react";
import { useTaskSocket } from "../hooks/tasks/useTaskSocket";
import { useTaskStore } from "../hooks/tasks/useTaskStore";
import { TaskContext } from "./taskContext";
import { isTaskActive } from "../services/tasks/taskRuntimeState";
import { resetTaskSourceDiagnostics } from "./taskSources/diagnostics";
import type { TaskSocketMessage } from "../hooks/tasks/useTaskStore";

async function getTaskApiClient() {
  return (await import("../api/client")).apiClient;
}

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
      const apiClient = await getTaskApiClient();
      await apiClient.pauseAllTasks();
    }
  };

  const resumeTask = async (taskId: string) => {
    const apiClient = await getTaskApiClient();
    await apiClient.resumeTask(taskId);
  };

  const deleteTask = async (taskId: string) => {
    const apiClient = await getTaskApiClient();
    await apiClient.deleteTask(taskId);
    removeLocalTask(taskId);
  };

  const clearTasks = async () => {
    const apiClient = await getTaskApiClient();
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
    void getTaskApiClient()
      .then((apiClient) => apiClient.listTasks())
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
