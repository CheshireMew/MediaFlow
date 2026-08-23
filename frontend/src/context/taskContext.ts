import { createContext, useContext } from "react";
import type { Task } from "../types/task";

export interface TaskContextType {
  tasks: Task[];
  connected: boolean;
  remoteTasksReady: boolean;
  tasksSettled: boolean;
  pauseAllTasks: () => Promise<void>;
  pauseTask: (taskId: string) => Promise<void> | void;
  resumeTask: (taskId: string) => Promise<void>;
  retryTask: (taskId: string) => Promise<void>;
  addTask: (task: Task) => void;
  deleteTask: (taskId: string) => Promise<void>;
  clearTasks: () => Promise<void>;
}

export type TaskActionsContextType = Pick<
  TaskContextType,
  | "pauseAllTasks"
  | "pauseTask"
  | "resumeTask"
  | "retryTask"
  | "addTask"
  | "deleteTask"
  | "clearTasks"
>;

export type TaskStatusContextType = Pick<
  TaskContextType,
  "connected" | "remoteTasksReady" | "tasksSettled"
>;

export const TaskContext = createContext<TaskContextType | null>(null);
export const TaskActionsContext = createContext<TaskActionsContextType | null>(null);
export const TaskStatusContext = createContext<TaskStatusContextType | null>(null);

export const useTaskContext = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error("useTaskContext must be used within a TaskProvider");
  }
  return context;
};

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
