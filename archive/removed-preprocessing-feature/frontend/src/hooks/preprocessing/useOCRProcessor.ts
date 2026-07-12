import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTaskContext } from "../../context/taskContext";
import {
  preprocessingService,
  createTaskFromExecutionOutcome,
  getExecutionSubmission,
} from "../../services/domain";
import type { OCRTextEvent } from "../../types/api";
import {
  viewportRoiToMediaPixels,
  type MediaPixelROI,
  type ROIRect,
} from "./roiMapping";
import type { TaskResult } from "../../types/task";
import { usePreprocessingStore } from "../../stores/preprocessingStore";
import type { CleanupMethod, PreprocessingTool } from "../../stores/preprocessingStore";
import {
  findRecoverablePreprocessingTask,
  getActivePreprocessingTask,
} from "./taskSelectors";
import type { MediaReference } from "../../services/ui/mediaReference";
import { getTaskMediaRefs } from "../../services/ui/taskMedia";
import type { TaskMessageDescriptor } from "../../services/ui/taskMessage";

// ─── Types ──────────────────────────────────────────────────────
interface UseOCRProcessorArgs {
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
  cleanMethod: CleanupMethod;
}

interface UseOCRProcessorReturn {
  isProcessing: boolean;
  ocrResults: OCRTextEvent[];
  setOcrResults: (results: OCRTextEvent[]) => void;
  handleStartProcessing: () => Promise<void>;
  handleStartOCR: () => Promise<void>;
  processingOutcome: PreprocessingOutcome | null;
  clearProcessingOutcome: () => void;
}

export interface PreprocessingOutcome {
  taskId: string | null;
  status: "completed" | "failed" | "cancelled" | "paused";
  tool: PreprocessingTool;
  sourceRef: MediaReference;
  outputRef: MediaReference | null;
  taskMessage: TaskMessageDescriptor | null;
  detail: string | null;
}

function resolvePreprocessingTool(taskType: string): PreprocessingTool {
  if (taskType === "enhancement") return "enhance";
  if (taskType === "cleanup") return "clean";
  return "extract";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isOCRTextEvent(value: unknown): value is OCRTextEvent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const event = value as Partial<OCRTextEvent>;
  return (
    typeof event.start === "number" &&
    Number.isFinite(event.start) &&
    typeof event.end === "number" &&
    Number.isFinite(event.end) &&
    typeof event.text === "string" &&
    (event.box === undefined ||
      (Array.isArray(event.box) &&
        event.box.every(
          (point) =>
            Array.isArray(point) &&
            point.every(
              (coordinate) =>
                typeof coordinate === "number" && Number.isFinite(coordinate),
            ),
        )))
  );
}

function getOCRTaskEvents(result: TaskResult | undefined): OCRTextEvent[] {
  const events = result?.meta?.events;
  return Array.isArray(events) ? events.filter(isOCRTextEvent) : [];
}

// ─── Hook ───────────────────────────────────────────────────────
export function useOCRProcessor({
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
  const { t } = useTranslation("preprocessing");
  const { addTask, tasks } = useTaskContext();
  const activeVideoRef = videoRef;
  const isProcessing = usePreprocessingStore(
    (state) => state.preprocessingIsProcessing,
  );
  const setIsProcessing = usePreprocessingStore(
    (state) => state.setPreprocessingIsProcessing,
  );
  const ocrResults = usePreprocessingStore((state) => state.ocrResults);
  const setOcrResults = usePreprocessingStore((state) => state.setOcrResults);
  const currentPreprocessingTaskId = usePreprocessingStore(
    (state) => state.currentPreprocessingTaskId,
  );
  const setCurrentPreprocessingTask = usePreprocessingStore(
    (state) => state.setCurrentPreprocessingTask,
  );
  const clearCurrentPreprocessingTask = usePreprocessingStore(
    (state) => state.clearCurrentPreprocessingTask,
  );
  const currentPreprocessingTaskVideoRef = usePreprocessingStore(
    (state) => state.currentPreprocessingTaskVideoRef,
  );
  const [processingOutcome, setProcessingOutcome] = useState<PreprocessingOutcome | null>(null);
  const handledTaskStates = useRef(new Set<string>());
  const clearProcessingOutcome = useCallback(() => setProcessingOutcome(null), []);
  const resolveSelectedMediaROI = useCallback((): MediaPixelROI | undefined => {
    if (!roi) {
      return undefined;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      throw new Error(t("errors.invalidROI"));
    }
    const viewport = canvas.getBoundingClientRect();
    const mediaROI = viewportRoiToMediaPixels(
      roi,
      { w: viewport.width, h: viewport.height },
      videoResolution,
    );
    if (!mediaROI) {
      throw new Error(t("errors.invalidROI"));
    }
    return mediaROI;
  }, [canvasRef, roi, t, videoResolution]);

  // ── Auto-load saved results ──────────────────────────────────
  useEffect(() => {
    if (!activeVideoRef) {
      setTimeout(() => setOcrResults([]), 0);
      return;
    }

    let isMounted = true;
    preprocessingService
      .getOcrResults({
        video_ref: activeVideoRef,
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
  }, [setOcrResults, activeVideoRef]);

  // ── OCR Extraction ──────────────────────────────────────────
  const handleStartOCR = useCallback(async () => {
    if (!activeVideoRef) return;
    setProcessingOutcome(null);

    setIsProcessing(true);
    try {
      const videoROI = resolveSelectedMediaROI();
      const res = await preprocessingService.extractText({
        video_ref: activeVideoRef,
        roi: videoROI,
        engine: ocrEngine as "rapid" | "paddle",
      });
      const submission = getExecutionSubmission(res);
      addTask(
        createTaskFromExecutionOutcome({
          outcome: res,
          type: "extract",
          name: t("tasks.extract"),
          request_params: {
            video_ref: activeVideoRef,
            roi: videoROI,
            engine: ocrEngine,
          },
        }),
      );
      setCurrentPreprocessingTask(submission.task_id, "extract", activeVideoRef);
      setOcrResults([]); // Clear while processing
    } catch (error) {
      console.error("OCR Failed", error);
      setIsProcessing(false);
      setProcessingOutcome({
        taskId: null,
        status: "failed",
        tool: "extract",
        sourceRef: activeVideoRef,
        outputRef: null,
          taskMessage: null,
          detail: getErrorMessage(error),
      });
    }
  }, [
    resolveSelectedMediaROI,
    ocrEngine,
    activeVideoRef,
    addTask,
    setCurrentPreprocessingTask,
    setIsProcessing,
    setOcrResults,
    t,
  ]);

  // ── Watch for task completion ────────────────────────────────
  useEffect(() => {
    const task =
      (currentPreprocessingTaskId
        ? getActivePreprocessingTask(
            tasks,
            currentPreprocessingTaskId,
            currentPreprocessingTaskVideoRef,
            videoRef,
          )
        : null) ??
      findRecoverablePreprocessingTask(tasks, videoRef);
    if (!task) return;

    if (task.status === "completed") {
      const taskStateKey = `${task.id}:completed`;
      if (handledTaskStates.current.has(taskStateKey)) return;
      handledTaskStates.current.add(taskStateKey);
      const tool = resolvePreprocessingTool(task.type);
      const outputRef = getTaskMediaRefs(task).outputRef;
      setTimeout(() => {
        clearCurrentPreprocessingTask();
        if (tool === "extract") {
          setOcrResults(getOCRTaskEvents(task.result));
        }
        setProcessingOutcome({
          taskId: task.id,
          status: "completed",
          tool,
          sourceRef: videoRef!,
          outputRef,
          taskMessage: {
            message_code: task.message_code,
            message_params: task.message_params,
          },
          detail: null,
        });
      }, 0);
    } else if (
      task.status === "failed" ||
      task.status === "cancelled" ||
      task.status === "paused"
    ) {
      const taskStateKey = `${task.id}:${task.status}`;
      if (handledTaskStates.current.has(taskStateKey)) return;
      handledTaskStates.current.add(taskStateKey);
      const tool = resolvePreprocessingTool(task.type);
      const terminalStatus = task.status === "failed"
        ? "failed"
        : task.status === "cancelled"
          ? "cancelled"
          : "paused";
      setTimeout(() => {
        if (terminalStatus === "paused") {
          setIsProcessing(false);
        } else {
          clearCurrentPreprocessingTask();
        }
        setProcessingOutcome({
          taskId: task.id,
          status: terminalStatus,
          tool,
          sourceRef: videoRef!,
          outputRef: null,
          taskMessage: {
            message_code: task.message_code,
            message_params: task.message_params,
          },
          detail: task.error ?? null,
        });
      }, 0);
      if (task.status === "failed") {
        console.error("OCR Task Failed:", task.error);
      }
    } else {
      setTimeout(() => {
        setProcessingOutcome((current) => current?.taskId === task.id ? null : current);
        if (!currentPreprocessingTaskId && videoRef) {
          setCurrentPreprocessingTask(task.id, task.type === "enhancement" ? "enhance" : task.type === "cleanup" ? "clean" : "extract", videoRef);
        }
        setIsProcessing(true);
      }, 0);
    }
  }, [
    tasks,
    currentPreprocessingTaskId,
    currentPreprocessingTaskVideoRef,
    videoRef,
    clearCurrentPreprocessingTask,
    setCurrentPreprocessingTask,
    setIsProcessing,
    setOcrResults,
  ]);

  // ── General Processing (enhance / clean / extract) ──────────
  const handleStartProcessing = useCallback(async () => {
    if (!activeVideoRef) return;
    setProcessingOutcome(null);
    setIsProcessing(true);
    try {
      if (activeTool === "enhance") {
        const res = await preprocessingService.enhanceVideo({
          video_ref: activeVideoRef,
          model: enhanceModel,
          scale: enhanceScale,
          method: enhanceMethod,
        });
        const submission = getExecutionSubmission(res);
        console.log("Enhance started:", submission);
        if (submission.task_id) {
          addTask(
            createTaskFromExecutionOutcome({
              outcome: res,
              type: "enhancement",
              name: t("tasks.enhance"),
              request_params: {
                video_ref: activeVideoRef,
                model: enhanceModel,
                scale: enhanceScale,
                method: enhanceMethod,
              },
            }),
          );
          setCurrentPreprocessingTask(submission.task_id, "enhance", activeVideoRef);
        }
      } else if (activeTool === "clean") {
        const cleanRoi = resolveSelectedMediaROI();
        if (!cleanRoi) {
          throw new Error(t("errors.invalidROI"));
        }
        const res = await preprocessingService.cleanVideo({
          video_ref: activeVideoRef,
          roi: cleanRoi,
          method: cleanMethod,
        });
        const submission = getExecutionSubmission(res);
        if (submission.task_id) {
          addTask(
            createTaskFromExecutionOutcome({
              outcome: res,
              type: "cleanup",
              name: t("tasks.clean"),
              request_params: {
                video_ref: activeVideoRef,
                roi: cleanRoi,
                method: cleanMethod,
              },
            }),
          );
          setCurrentPreprocessingTask(submission.task_id, "clean", activeVideoRef);
        }
      } else if (activeTool === "extract") {
        await handleStartOCR();
      }
    } catch (error) {
      console.error("Processing failed:", error);
      setIsProcessing(false);
      setProcessingOutcome({
        taskId: null,
        status: "failed",
        tool: activeTool === "enhance" || activeTool === "clean" ? activeTool : "extract",
        sourceRef: activeVideoRef,
        outputRef: null,
        taskMessage: null,
        detail: getErrorMessage(error),
      });
    }
  }, [
    activeVideoRef,
    activeTool,
    addTask,
    resolveSelectedMediaROI,
    handleStartOCR,
    enhanceModel,
    enhanceScale,
    enhanceMethod,
    cleanMethod,
    setCurrentPreprocessingTask,
    setIsProcessing,
    t,
  ]);

  return {
    isProcessing,
    ocrResults,
    setOcrResults,
    handleStartProcessing,
    handleStartOCR,
    processingOutcome,
    clearProcessingOutcome,
  };
}
