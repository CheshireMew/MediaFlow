import React, { createContext, useContext } from "react";
import type { Task } from "../types/task";
import { useTaskSocket } from "../hooks/tasks/useTaskSocket";
import { useTaskStore } from "../hooks/tasks/useTaskStore";

export interface TaskContextType {
  tasks: Task[];
  connected: boolean;
  pauseTask: (taskId: string) => void;
  addTask: (task: Task) => void;
}

export const TaskContext = createContext<TaskContextType | null>(null);

export const useTaskContext = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error("useTaskContext must be used within a TaskProvider");
  }
  return context;
};

export const TaskProvider: React.FC<{ children: React.ReactNode; enabled?: boolean }> = ({
  children,
  enabled = true,
}) => {
  const { tasks, applyMessage, addTask } = useTaskStore();
  const { connected, sendPause } = useTaskSocket({
    onMessage: applyMessage,
    enabled,
  });

  return React.createElement(
    TaskContext.Provider,
    { value: { tasks, connected, pauseTask: sendPause, addTask } },
    children,
  );
};
