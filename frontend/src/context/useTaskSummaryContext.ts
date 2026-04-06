import { useContext } from "react";

import { TaskSummaryContext } from "./taskSummaryShared";

export function useTaskSummaryContext() {
  return useContext(TaskSummaryContext);
}
