import { useEffect, useCallback } from "react";
import { useTaskContext } from "../../context/taskContext";
import { apiClient } from "../../api/client";
import { ocrService } from "../../services/ocrService";
import { preprocessingService } from "../../services/preprocessingService";
import type { OCRTextEvent } from "../../services/ocrService";
import type { ROIRect } from "./useROIInteraction";
import type { TaskResult } from "../../types/task";
import { usePreprocessingStore } from "../../stores/preprocessingStore";
import { getActivePreprocessingTask } from "./taskSelectors";

// ─── Types ──────────────────────────────────────────────────────
interface UseOCRProcessorArgs {
  videoPath: string | null;
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
  const { tasks } = useTaskContext();
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

  // ── Auto-load saved results ──────────────────────────────────
  useEffect(() => {
    if (!videoPath) {
      setTimeout(() => setOcrResults([]), 0);
      return;
    }

    let isMounted = true;
    apiClient
      .getOcrResults(videoPath)
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
  }, [videoPath, setOcrResults]);

  // ── OCR Extraction ──────────────────────────────────────────
  const handleStartOCR = useCallback(async () => {
    if (!videoPath) return;

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
      const res = await ocrService.extractText({
        video_path: videoPath,
        roi: videoROI,
        engine: ocrEngine as "rapid" | "paddle",
      });
      setActiveTask(res.task_id, "extract", videoPath);
      setOcrResults([]); // Clear while processing
    } catch (error) {
      console.error("OCR Failed", error);
      setIsProcessing(false);
    }
  }, [
    videoPath,
    roi,
    canvasRef,
    videoResolution,
    ocrEngine,
    setActiveTask,
    setIsProcessing,
    setOcrResults,
  ]);

  // ── Watch for task completion ────────────────────────────────
  useEffect(() => {
    if (!activeTaskId) return;
    const task = getActivePreprocessingTask(
      tasks,
      activeTaskId,
      activeTaskVideoPath,
      videoPath,
    );
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
      setTimeout(() => setIsProcessing(true), 0);
    }
  }, [
    tasks,
    activeTaskId,
    activeTaskVideoPath,
    videoPath,
    clearActiveTask,
    setIsProcessing,
    setOcrResults,
  ]);

  // ── General Processing (enhance / clean / extract) ──────────
  const handleStartProcessing = useCallback(async () => {
    if (!videoPath) return;
    setIsProcessing(true);
    try {
      if (activeTool === "enhance") {
        const res = await preprocessingService.enhanceVideo({
          video_path: videoPath,
          model: enhanceModel,
          scale: enhanceScale,
          method: enhanceMethod,
        });
        console.log("Enhance started:", res);
        if (res.task_id) setActiveTask(res.task_id, "enhance", videoPath);
      } else if (activeTool === "clean") {
        const cleanRoi: [number, number, number, number] = roi
          ? [roi.x, roi.y, roi.w, roi.h]
          : [0, 0, 0, 0];
        const res = await preprocessingService.cleanVideo({
          video_path: videoPath,
          roi: cleanRoi,
          method: cleanMethod,
        });
        console.log("Clean started:", res);
        if (res.task_id) setActiveTask(res.task_id, "clean", videoPath);
      } else if (activeTool === "extract") {
        await handleStartOCR();
      }
    } catch (error) {
      console.error("Processing failed:", error);
      setIsProcessing(false);
    }
  }, [
    videoPath,
    activeTool,
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
