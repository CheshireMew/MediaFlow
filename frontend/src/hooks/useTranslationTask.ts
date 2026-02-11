import { useRef, useCallback } from "react";
import {
  useTranslatorStore,
  type TranslatorMode,
} from "../stores/translatorStore";
import { translatorService } from "../services/translator/translatorService";

export const useTranslationTask = () => {
  const {
    sourceSegments,
    targetSegments,
    sourceFilePath,
    targetLang,
    mode,
    taskId,
    taskStatus,
    progress,
    setTaskId,
    setTaskStatus,
    setProgress,
    setTargetSegments,
    setTargetLang,
    setMode,
  } = useTranslatorStore();

  // Use ref for polling interval to clear it properly
  const pollInterval = useRef<NodeJS.Timeout | null>(null);

  const isTranslating =
    taskStatus === "translating" ||
    taskStatus === "starting" ||
    taskStatus === "processing_result" ||
    taskStatus === "running";

  const pollTask = useCallback(
    async (tid: string) => {
      if (pollInterval.current) clearInterval(pollInterval.current);

      pollInterval.current = setInterval(async () => {
        try {
          const statusRes = await translatorService.getTaskStatus(tid);

          if (statusRes.progress) setProgress(statusRes.progress);

          if (statusRes.status === "completed") {
            if (pollInterval.current) clearInterval(pollInterval.current);

            // Handle legacy vs new structure
            const segments =
              statusRes.result?.meta?.segments || statusRes.result?.segments;

            setTaskStatus("processing_result");

            if (segments && segments.length > 0) {
              setTargetSegments(segments);
            } else {
              console.warn(
                "Translation completed but no segments found:",
                statusRes,
              );
              alert("Translation finished but returned no segments.");
            }

            // Buffer UI update
            setTimeout(() => {
              setTaskStatus("completed");
            }, 600);
          } else if (statusRes.status === "failed") {
            if (pollInterval.current) clearInterval(pollInterval.current);
            setTaskStatus("failed");
            alert("Translation failed: " + statusRes.error);
          } else {
            setTaskStatus(statusRes.status);
          }
        } catch (e) {
          console.error("Polling error (will keep retrying):", e);
        }
      }, 1000);
    },
    [setProgress, setTaskStatus, setTargetSegments],
  );

  const startTranslation = async () => {
    if (sourceSegments.length === 0) return;

    setTaskStatus("starting");
    setProgress(0);

    try {
      const res = await translatorService.startTranslation({
        segments: sourceSegments,
        target_language: targetLang,
        mode: mode,
        context_path: sourceFilePath,
      });
      setTaskId(res.task_id);
      setTaskStatus("translating");

      pollTask(res.task_id);
    } catch (e) {
      console.error(e);
      setTaskStatus("failed");
      alert("Failed to start translation");
    }
  };

  // Cleanup on unmount
  // useEffect(() => {
  //     return () => {
  //         if (pollInterval.current) clearInterval(pollInterval.current);
  //     };
  // }, []);
  // Note: We might NOT want to clear interval on unmount if we want background polling?
  // For now, keeping it tied to the component lifecycle but arguably it should persist.

  return {
    taskId,
    taskStatus,
    progress,
    targetLang,
    mode,
    isTranslating,
    startTranslation,
    setTargetLang,
    setMode,
  };
};
