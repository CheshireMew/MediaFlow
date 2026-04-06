import { createContext } from "react";

export type TaskSummaryContextType = {
  activeTaskCount: number;
  ready: boolean;
};

export const TaskSummaryContext = createContext<TaskSummaryContextType | null>(
  null,
);
