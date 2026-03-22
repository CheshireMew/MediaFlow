import { useEffect, useCallback } from "react";
import { useTaskContext } from "../../context/taskContext";
import { preprocessingService } from "../../services/domain";
import { createTaskFromSubmissionReceipt } from "../../services/domain/taskSubmission";
import type { OCRTextEvent } from "../../types/api";
import type { ROIRect } from "./useROIInteraction";
import type { TaskResult } from "../../types/task";
import { usePreprocessingStore } from "../../stores/preprocessingStore";
import {
  findRecoverablePreprocessingTask,
  getActivePreprocessingTask,
} from "./taskSelectors";
import type { MediaReference } from "../../services/ui/mediaReference";

// ─── Types ──────────────────────────────────────────────────────
interface UseOCRProcessorArgs {
  videoPath: string | null;
  videoRef: MediaReference | null;
  roi: ROIRect | null;
  /** Ref to the canvas div for coordinate conversion */
  canvasRef: React.RefObject<HTMLDivElement | null>;
  /** Actual video resolution for ROI scaling */
  videoResolution: { w: number; h: number };
  /** Current active tool (extract / clean / enhance) */
  activeTool: string;
  /** OCR engine (rapid / paddle) */
  ocrEngine: string;
  enhanceModel: string;
  enhanceScale: string;
  enhanceMethod: string;
  cleanMethod: string;
}

interface UseOCRProcessorReturn {
  isProcessing: boolean;
  ocrResults: OCRTextEvent[];
  setOcrResults: (results: OCRTextEvent[]) => void;
  handleStartProcessing: () => Promise<void>;
  handleStartOCR: () => Promise<void>;
}

interface OCRTaskResult extends TaskResult {
  events?: OCRTextEvent[];
}

// ─── Hook ───────────────────────────────────────────────────────
export function useOCRProcessor({
  videoPath,
  videoRef,
  roi,
  canvasRef,
  videoResolution,
  activeTool,
  ocrEngine,
  enhanceModel,
  enhanceScale,
  enhanceMethod,
  cleanMethod,
}: UseOCRProcessorArgs): UseOCRProcessorReturn {
  const { addTask, tasks } = useTaskContext();
  const resolvedVideoPath = videoRef?.path ?? videoPath;
  const isProcessing = usePreprocessingStore(
    (state) => state.preprocessingIsProcessing,
  );
  const setIsProcessing = usePreprocessingStore(
    (state) => state.setPreprocessingIsProcessing,
  );
  const ocrResults = usePreprocessingStore((state) => state.ocrResults);
  const setOcrResults = usePreprocessingStore((state) => state.setOcrResults);
  const activeTaskId = usePreprocessingStore(
    (state) => state.preprocessingActiveTaskId,
  );
  const setActiveTask = usePreprocessingStore(
    (state) => state.setPreprocessingActiveTask,
  );
  const clearActiveTask = usePreprocessingStore(
    (state) => state.clearPreprocessingActiveTask,
  );
  const activeTaskVideoPath = usePreprocessingStore(
    (state) => state.preprocessingActiveTaskVideoPath,
  );
  const activeTaskVideoRef = usePreprocessingStore(
    (state) => state.preprocessingActiveTaskVideoRef,
  );

  // ── Auto-load saved results ──────────────────────────────────
  useEffect(() => {
    if (!resolvedVideoPath) {
      setTimeout(() => setOcrResults([]), 0);
      return;
    }

    let isMounted = true;
    preprocessingService
      .getOcrResults({
        video_path: videoPath,
        video_ref: videoRef,
      })
      .then((res) => {
        if (isMounted && res.events && res.events.length > 0) {
          console.log("Loaded saved OCR results:", res.events.length);
          setOcrResults(res.events);
        }
      })
      .catch((err) => console.error("Failed to load saved OCR results:", err));

    return () => {
      isMounted = false;
    };
  }, [resolvedVideoPath, setOcrResults]);

  // ── OCR Extraction ──────────────────────────────────────────
  const handleStartOCR = useCallback(async () => {
    if (!resolvedVideoPath) return;

    // Convert display ROI to video-space coordinates
    let videoROI: [number, number, number, number] | undefined;
    if (roi && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = videoResolution.w / rect.width;
      const scaleY = videoResolution.h / rect.height;
      videoROI = [
        Math.round(roi.x * scaleX),
        Math.round(roi.y * scaleY),
        Math.round(roi.w * scaleX),
        Math.round(roi.h * scaleY),
      ];
    }

    setIsProcessing(true);
    try {
      const res = await preprocessingService.extractText({
        video_path: videoRef ? null : resolvedVideoPath,
        video_ref: videoRef,
        roi: videoROI,
        engine: ocrEngine as "rapid" | "paddle",
      });
      if (res.task_id) {
        addTask(
          createTaskFromSubmissionReceipt({
            receipt: {
              ...res,
              task_id: res.task_id,
            },
            type: "extract",
            name: "Extract text",
            request_params: {
              video_ref: videoRef,
              roi: videoROI,
              engine: ocrEngine,
            },
          }),
        );
        setActiveTask(res.task_id, "extract", resolvedVideoPath, videoRef);
      }
      setOcrResults([]); // Clear while processing
    } catch (error) {
      console.error("OCR Failed", error);
      setIsProcessing(false);
    }
  }, [
    resolvedVideoPath,
    roi,
    canvasRef,
    videoResolution,
    ocrEngine,
    videoRef,
    addTask,
    setActiveTask,
    setIsProcessing,
    setOcrResults,
  ]);

  // ── Watch for task completion ────────────────────────────────
  useEffect(() => {
    const task =
      (activeTaskId
        ? getActivePreprocessingTask(
            tasks,
            activeTaskId,
            activeTaskVideoPath,
            activeTaskVideoRef,
            resolvedVideoPath,
            videoRef,
          )
        : null) ??
      findRecoverablePreprocessingTask(tasks, resolvedVideoPath, videoRef);
    if (!task) return;

    if (task.status === "completed") {
      const result = task.result as OCRTaskResult | undefined;
      setTimeout(() => {
        clearActiveTask();
        setOcrResults(result?.events ?? []);
      }, 0);
    } else if (
      task.status === "failed" ||
      task.status === "cancelled" ||
      task.status === "paused"
    ) {
      setTimeout(() => {
        clearActiveTask();
      }, 0);
      if (task.status === "failed") {
        console.error("OCR Task Failed:", task.error);
      }
    } else {
      setTimeout(() => {
        if (!activeTaskId && resolvedVideoPath) {
          setActiveTask(task.id, task.type === "enhancement" ? "enhance" : task.type === "cleanup" ? "clean" : "extract", resolvedVideoPath, videoRef);
        }
        setIsProcessing(true);
      }, 0);
    }
  }, [
    tasks,
    activeTaskId,
    activeTaskVideoPath,
    activeTaskVideoRef,
    resolvedVideoPath,
    videoRef,
    clearActiveTask,
    setActiveTask,
    setIsProcessing,
    setOcrResults,
  ]);

  // ── General Processing (enhance / clean / extract) ──────────
  const handleStartProcessing = useCallback(async () => {
    if (!resolvedVideoPath) return;
    setIsProcessing(true);
    try {
      if (activeTool === "enhance") {
        const res = await preprocessingService.enhanceVideo({
          video_path: videoRef ? null : resolvedVideoPath,
          video_ref: videoRef,
          model: enhanceModel,
          scale: enhanceScale,
          method: enhanceMethod,
        });
        console.log("Enhance started:", res);
        if (res.task_id) {
          addTask(
            createTaskFromSubmissionReceipt({
              receipt: {
                ...res,
                task_id: res.task_id,
              },
              type: "enhancement",
              name: "Enhance video",
              request_params: {
                video_ref: videoRef,
                model: enhanceModel,
                scale: enhanceScale,
                method: enhanceMethod,
              },
            }),
          );
          setActiveTask(res.task_id, "enhance", resolvedVideoPath, videoRef);
        }
      } else if (activeTool === "clean") {
        const cleanRoi: [number, number, number, number] = roi
          ? [roi.x, roi.y, roi.w, roi.h]
          : [0, 0, 0, 0];
        const res = await preprocessingService.cleanVideo({
          video_path: videoRef ? null : resolvedVideoPath,
          video_ref: videoRef,
          roi: cleanRoi,
          method: cleanMethod,
        });
        console.log("Clean started:", res);
        if (res.task_id) {
          addTask(
            createTaskFromSubmissionReceipt({
              receipt: {
                ...res,
                task_id: res.task_id,
              },
              type: "cleanup",
              name: "Clean video",
              request_params: {
                video_ref: videoRef,
                roi: cleanRoi,
                method: cleanMethod,
              },
            }),
          );
          setActiveTask(res.task_id, "clean", resolvedVideoPath, videoRef);
        }
      } else if (activeTool === "extract") {
        await handleStartOCR();
      }
    } catch (error) {
      console.error("Processing failed:", error);
      setIsProcessing(false);
    }
  }, [
    resolvedVideoPath,
    videoRef,
    activeTool,
    addTask,
    roi,
    handleStartOCR,
    enhanceModel,
    enhanceScale,
    enhanceMethod,
    cleanMethod,
    setActiveTask,
    setIsProcessing,
  ]);

  return {
    isProcessing,
    ocrResults,
    setOcrResults,
    handleStartProcessing,
    handleStartOCR,
  };
}
