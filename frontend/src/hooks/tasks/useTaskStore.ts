import { useCallback, useState } from "react";

import type { Task } from "../../types/task";

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
      setTasks(sortTasks(message.tasks));
      return;
    }

    if (message.type === "update") {
      const updatedTask = message.task;
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
    setTasks((prev) => sortTasks([task, ...prev]));
  }, []);

  return {
    tasks,
    applyMessage,
    addTask,
  };
}
