import React, { useEffect, useMemo, useState } from "react";
import { useTaskSocket } from "../hooks/tasks/useTaskSocket";
import { useTaskStore } from "../hooks/tasks/useTaskStore";
import { apiClient } from "../api/client";
import { desktopEventsService, desktopTaskService, isDesktopRuntime } from "../services/desktop";
import { TaskContext } from "./taskContext";
import { getRuntimeTaskOwnerMode } from "../contracts/runtimeContracts";
import {
  applyTaskSnapshot,
  normalizeTaskForOwnerMode,
} from "./taskSources/shared";
import { isTaskActive } from "../services/tasks/taskRuntimeState";
import { resetTaskSourceDiagnostics } from "./taskSources/diagnostics";

export const TaskProvider: React.FC<{ children: React.ReactNode; enabled?: boolean }> = ({
  children,
  enabled = true,
}) => {
  const desktopRuntime = isDesktopRuntime();
  const taskOwnerMode = getRuntimeTaskOwnerMode(desktopRuntime);
  const [desktopTasksReady, setDesktopTasksReady] = useState(!desktopRuntime);
  const [desktopSnapshotReady, setDesktopSnapshotReady] = useState(!desktopRuntime);
  const [remoteSnapshotReady, setRemoteSnapshotReady] = useState(desktopRuntime);
  const {
    tasks,
    applyMessage,
    addTask,
    deleteTask: removeLocalTask,
    clearTasks: clearLocalTasks,
  } = useTaskStore();
  const { connected: wsConnected, sendPause } = useTaskSocket({
    onMessage: applyMessage,
    enabled: enabled && !desktopRuntime,
  });
  const shouldPollRemoteTasks = useMemo(
    () => tasks.some((task) => isTaskActive(task)),
    [tasks],
  );
  const connected = desktopRuntime ? desktopTasksReady : enabled && wsConnected;
  const remoteTasksReady = desktopRuntime ? true : enabled && remoteSnapshotReady;
  const tasksSettled = desktopRuntime
    ? desktopSnapshotReady
    : !enabled || remoteSnapshotReady;

  const pauseTask = async (taskId: string) => {
    if (desktopRuntime) {
      await desktopTaskService.pauseTask(taskId);
      return;
    }
    sendPause?.(taskId);
  };

  const pauseLocalTasks = async () => {
    if (!desktopRuntime) {
      return;
    }
    const activeDesktopTasks = tasks.filter(
      (task) => task.status === "pending" || task.status === "running",
    );
    await Promise.all(activeDesktopTasks.map((task) => desktopTaskService.pauseTask(task.id)));
  };

  const pauseRemoteTasks = async () => {
    if (desktopRuntime) {
      return;
    }
    if (tasks.some((task) => isTaskActive(task))) {
      await apiClient.pauseAllTasks();
    }
  };

  const pauseAllTasks = async () => {
    await pauseLocalTasks();
    await pauseRemoteTasks();
  };

  const resumeTask = async (taskId: string) => {
    if (desktopRuntime) {
      await desktopTaskService.resumeTask(taskId);
      return;
    }
    await apiClient.resumeTask(taskId);
  };

  const deleteTask = async (taskId: string) => {
    if (desktopRuntime) {
      await desktopTaskService.cancelTask(taskId);
      removeLocalTask(taskId);
      return;
    }
    await apiClient.deleteTask(taskId);
    removeLocalTask(taskId);
  };

  const clearTasks = async () => {
    if (desktopRuntime) {
      await Promise.all(tasks.map((task) => desktopTaskService.cancelTask(task.id)));
      clearLocalTasks();
      return;
    }
    await apiClient.deleteAllTasks();
    clearLocalTasks();
  };

  useEffect(() => {
    resetTaskSourceDiagnostics();
  }, []);

  useEffect(() => {
    if (!desktopRuntime || desktopSnapshotReady) {
      return;
    }

    let cancelled = false;
    let frameId = 0;

    const loadDesktopTaskSnapshot = async () => {
      try {
        const desktopTasks = await desktopTaskService.listTasks();
        if (cancelled) {
          return;
        }

        applyTaskSnapshot(
          clearLocalTasks,
          applyMessage,
          () => true,
          desktopTasks,
          taskOwnerMode,
        );
        setDesktopTasksReady(true);
        setDesktopSnapshotReady(true);
      } catch (error) {
        console.error("Failed to load desktop task snapshot", error);
      }
    };

    frameId = window.requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      void loadDesktopTaskSnapshot();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [applyMessage, clearLocalTasks, desktopRuntime, desktopSnapshotReady, taskOwnerMode]);

  useEffect(() => {
    if (!enabled || desktopRuntime) {
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
    desktopRuntime,
    enabled,
    remoteSnapshotReady,
    shouldPollRemoteTasks,
    taskOwnerMode,
  ]);

  useEffect(() => {
    if (!desktopRuntime) {
      return;
    }

    const unsubscribe = desktopEventsService.onTaskEvent((payload) => {
      if (
        payload &&
        typeof payload === "object" &&
        "type" in payload &&
        typeof (payload as { type?: unknown }).type === "string"
      ) {
        setDesktopTasksReady(true);
        const message = payload as Parameters<typeof applyMessage>[0];
        if (message.type === "update") {
          const normalizedTask = normalizeTaskForOwnerMode(
            message.task,
            "event:desktop",
            taskOwnerMode,
          );
          if (!normalizedTask) {
            return;
          }
          applyMessage({
            ...message,
            task: normalizedTask,
          });
          return;
        }
        applyMessage(message);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [applyMessage, desktopRuntime, taskOwnerMode]);

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
