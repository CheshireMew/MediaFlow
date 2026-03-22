import { createContext, useContext } from "react";
import type { Task } from "../types/task";
export { TaskProvider } from "./TaskProvider";

export interface TaskContextType {
  tasks: Task[];
  connected: boolean;
  remoteTasksReady: boolean;
  tasksSettled: boolean;
  taskOwnerMode: import("../contracts/runtimeContracts").TaskOwnerMode;
  pauseLocalTasks: () => Promise<void>;
  pauseRemoteTasks: () => Promise<void>;
  pauseAllTasks: () => Promise<void>;
  pauseTask: (taskId: string) => Promise<void> | void;
  resumeTask: (taskId: string) => Promise<void>;
  addTask: (task: Task) => void;
  deleteTask: (taskId: string) => Promise<void>;
  clearTasks: () => Promise<void>;
}

export const TaskContext = createContext<TaskContextType | null>(null);

export const useTaskContext = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error("useTaskContext must be used within a TaskProvider");
  }
  return context;
};
