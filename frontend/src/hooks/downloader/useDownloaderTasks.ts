import { useMemo } from "react";

import { useTasks } from "../../context/taskStoreContext";
import { useDownloaderStore } from "../../stores/downloaderStore";
import {
  buildDownloadTaskEntries,
  getActiveDownloadTasks,
} from "../tasks/taskSelectors";

export function useDownloaderTasks() {
  const tasks = useTasks();
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
