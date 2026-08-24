import { createContext, useContext } from "react";
import type { Task } from "../types/task";

export interface TaskActionsContextType {
  pauseAllTasks: () => Promise<void>;
  pauseTask: (taskId: string) => Promise<void>;
  resumeTask: (taskId: string) => Promise<void>;
  retryTask: (taskId: string) => Promise<void>;
  addTask: (task: Task) => void;
  deleteTask: (taskId: string) => Promise<void>;
  clearTasks: () => Promise<void>;
}

export interface TaskStatusContextType {
  connected: boolean;
  remoteTasksReady: boolean;
  tasksSettled: boolean;
}

export const TaskActionsContext = createContext<TaskActionsContextType | null>(null);
export const TaskStatusContext = createContext<TaskStatusContextType | null>(null);

export const useTaskActions = () => {
  const context = useContext(TaskActionsContext);
  if (!context) {
    throw new Error("useTaskActions must be used within a TaskProvider");
  }
  return context;
};

export const useTaskStatus = () => {
  const context = useContext(TaskStatusContext);
  if (!context) {
    throw new Error("useTaskStatus must be used within a TaskProvider");
  }
  return context;
};
