import React, { useEffect, useMemo, useState } from "react";
import { useTaskSocket } from "../hooks/tasks/useTaskSocket";
import { useTaskStore } from "../hooks/tasks/useTaskStore";
import { desktopTaskService, isDesktopRuntime } from "../services/desktop";
import { TaskContext } from "./taskContext";
import { getRuntimeTaskOwnerMode } from "../contracts/runtimeContracts";
import {
  aggregateTaskSourceState,
  applyTaskSnapshot,
  createBackendTaskSource,
  createDesktopTaskSource,
  createTaskSourceBundle,
  getTaskSourceForTask,
  hasActiveRemoteTasks,
  normalizeTaskForOwnerMode,
} from "./taskSources";
import { resetTaskSourceDiagnostics } from "./taskSources/diagnostics";

export const TaskProvider: React.FC<{ children: React.ReactNode; enabled?: boolean }> = ({
  children,
  enabled = true,
}) => {
  const desktopRuntime = isDesktopRuntime();
  const taskOwnerMode = getRuntimeTaskOwnerMode(desktopRuntime);
  const desktopOwnsTaskState = taskOwnerMode === "desktop";
  const [desktopTasksReady, setDesktopTasksReady] = useState(!desktopRuntime);
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
    enabled: enabled && !desktopRuntime,
  });
  const shouldPollRemoteTasks = hasActiveRemoteTasks(tasks);
  const backendTaskSyncEnabled = enabled && !desktopOwnsTaskState;
  const backendSourceReady = desktopOwnsTaskState || (backendTaskSyncEnabled && remoteSnapshotReady);
  const backendSourceSettled = desktopOwnsTaskState || !backendTaskSyncEnabled || remoteSnapshotReady;
  const desktopSource = useMemo(
    () => createDesktopTaskSource(desktopTasksReady),
    [desktopTasksReady],
  );
  const backendSource = useMemo(
    () =>
      createBackendTaskSource(
        backendTaskSyncEnabled,
        shouldPollRemoteTasks,
        sendPause,
        !desktopRuntime,
      ),
    [backendTaskSyncEnabled, desktopRuntime, sendPause, shouldPollRemoteTasks],
  );
  const { taskSources } = useMemo(
    () => createTaskSourceBundle({ taskOwnerMode, desktopSource, backendSource }),
    [backendSource, desktopSource, taskOwnerMode],
  );
  const { connected, remoteTasksReady, tasksSettled } = useMemo(
    () =>
      aggregateTaskSourceState({
        desktopRuntime,
        enabled,
        wsConnected,
        localSource: desktopSource,
        remoteSource: {
          ready: backendSourceReady,
          settled: backendSourceSettled,
        },
      }),
    [
      backendSourceReady,
      backendSourceSettled,
      desktopRuntime,
      desktopSource,
      enabled,
      wsConnected,
    ],
  );

  const pauseTask = async (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }
    await getTaskSourceForTask(taskSources, task)?.pauseTask(taskId);
  };

  const pauseLocalTasks = async () => {
    await desktopSource.pauseAll(tasks);
  };

  const pauseRemoteTasks = async () => {
    if (desktopOwnsTaskState) {
      return;
    }
    await backendSource.pauseAll(tasks);
  };

  const pauseAllTasks = async () => {
    await pauseLocalTasks();
    if (!desktopOwnsTaskState) {
      await pauseRemoteTasks();
    }
  };

  const resumeTask = async (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }
    await getTaskSourceForTask(taskSources, task)?.resumeTask(taskId);
  };

  const deleteTask = async (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      return;
    }
    await getTaskSourceForTask(taskSources, task)?.deleteTask(task, removeLocalTask);
  };

  const clearTasks = async () => {
    await desktopSource.clearTasks(tasks, removeLocalTask, clearLocalTasks);
    if (!desktopOwnsTaskState) {
      await backendSource.clearTasks(tasks, removeLocalTask, clearLocalTasks);
    }
  };

  useEffect(() => {
    resetTaskSourceDiagnostics();
  }, []);

  useEffect(() => {
    if (!desktopRuntime) {
      return;
    }

    let cancelled = false;

    void desktopTaskService
      .listTasks()
      .then((desktopTasks) => {
        if (cancelled) {
          return;
        }

        applyTaskSnapshot(
          clearLocalTasks,
          applyMessage,
          desktopSource.clearPredicate,
          desktopTasks,
          taskOwnerMode,
        );
        setDesktopTasksReady(true);
      })
      .catch((error) => {
        console.error("Failed to load desktop task snapshot", error);
      });

    return () => {
      cancelled = true;
    };
  }, [applyMessage, clearLocalTasks, desktopRuntime, desktopSource, taskOwnerMode]);

  useEffect(() => {
    if (!backendTaskSyncEnabled) {
      return;
    }

    let cancelled = false;

    const syncRemoteTasks = async () => {
      try {
        const remoteTasks = await backendSource.loadSnapshot();
        if (cancelled) {
          return;
        }

        applyTaskSnapshot(
          clearLocalTasks,
          applyMessage,
          backendSource.clearPredicate,
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

    const shouldKeepPolling = !remoteSnapshotReady || backendSource.shouldPoll?.();
    if (!shouldKeepPolling) {
      return;
    }

    void syncRemoteTasks();

    const interval = setInterval(() => {
      void syncRemoteTasks();
    }, backendSource.pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    applyMessage,
    backendSource,
    clearLocalTasks,
      backendTaskSyncEnabled,
      remoteSnapshotReady,
      shouldPollRemoteTasks,
  ]);

  useEffect(() => {
    const unsubscribe =
      desktopSource.subscribe?.((message) => {
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
      }, () => {
      setDesktopTasksReady(true);
    }) ?? (() => undefined);

    return () => {
      unsubscribe();
    };
  }, [applyMessage, desktopSource, taskOwnerMode]);

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
