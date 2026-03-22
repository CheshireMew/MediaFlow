import { useCallback, useState } from "react";

import type { Task } from "../../types/task";
import { normalizeTaskForRenderer } from "../../context/taskSources/shared";

export type TaskSocketMessage =
  | { type: "snapshot"; tasks: Task[] }
  | { type: "update"; task: Task }
  | { type: "delete"; task_id: string };

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => b.created_at - a.created_at);
}

export function useTaskStore() {
  const [tasks, setTasks] = useState<Task[]>([]);

  const applyMessage = useCallback((message: TaskSocketMessage) => {
    if (message.type === "snapshot") {
      setTasks(
        sortTasks(
          message.tasks
            .map((task) => normalizeTaskForRenderer(task, "event:snapshot"))
            .filter((task): task is Task => task !== null),
        ),
      );
      return;
    }

    if (message.type === "update") {
      const updatedTask = normalizeTaskForRenderer(message.task, "event:update");
      if (!updatedTask) {
        return;
      }
      setTasks((prev) => {
        const index = prev.findIndex((task) => task.id === updatedTask.id);
        if (index === -1) {
          return sortTasks([updatedTask, ...prev]);
        }

        const next = [...prev];
        next[index] = updatedTask;
        return sortTasks(next);
      });
      return;
    }

    setTasks((prev) => prev.filter((task) => task.id !== message.task_id));
  }, []);

  const addTask = useCallback((task: Task) => {
    const normalizedTask = normalizeTaskForRenderer(task, "local:add");
    if (!normalizedTask) {
      return;
    }
    setTasks((prev) => sortTasks([normalizedTask, ...prev]));
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  }, []);

  const clearTasks = useCallback((predicate?: (task: Task) => boolean) => {
    setTasks((prev) => {
      if (!predicate) {
        return [];
      }
      return prev.filter((task) => !predicate(task));
    });
  }, []);

  return {
    tasks,
    applyMessage,
    addTask,
    deleteTask,
    clearTasks,
  };
}
