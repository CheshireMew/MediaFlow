import { useMemo } from "react";

import { useTaskContext } from "../../context/taskContext";
import { useDownloaderStore } from "../../stores/downloaderStore";
import {
  buildDownloadTaskEntries,
  getActiveDownloadTasks,
} from "../tasks/taskSelectors";

export function useDownloaderTasks() {
  const { tasks } = useTaskContext();
  const history = useDownloaderStore((state) => state.history);

  const entries = useMemo(
    () => buildDownloadTaskEntries(tasks, history),
    [history, tasks],
  );
  const activeTasks = useMemo(() => getActiveDownloadTasks(tasks), [tasks]);

  return {
    downloadEntries: entries,
    activeDownloadTasks: activeTasks,
    activeDownloadCount: activeTasks.length,
  };
}
