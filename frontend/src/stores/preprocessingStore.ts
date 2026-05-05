import { create } from "zustand";
import type { OCRTextEvent } from "../types/api";
import type { MediaReference } from "../services/ui/mediaReference";
import { readUiStateValue, writeUiStateValue } from "../services/persistence/uiStateSettings";

export interface ProjectFile {
  path: string;
  name: string;
  size: number;
  resolution?: string;
}

export type PreprocessingTool = "enhance" | "clean" | "extract";

export interface PreprocessingState {
  preprocessingActiveTool: PreprocessingTool;
  setPreprocessingActiveTool: (tool: PreprocessingTool) => void;

  enhanceModel: string;
  setEnhanceModel: (model: string) => void;

  enhanceScale: string;
  setEnhanceScale: (scale: string) => void;

  enhanceMethod: string;
  setEnhanceMethod: (method: string) => void;

  cleanMethod: string;
  setCleanMethod: (method: string) => void;

  ocrEngine: string;
  setOcrEngine: (engine: string) => void;
  ocrResults: OCRTextEvent[];
  setOcrResults: (results: OCRTextEvent[]) => void;

  preprocessingIsProcessing: boolean;
  setPreprocessingIsProcessing: (processing: boolean) => void;
  currentPreprocessingTaskId: string | null;
  currentPreprocessingTaskTool: PreprocessingTool | null;
  currentPreprocessingTaskVideoPath: string | null;
  currentPreprocessingTaskVideoRef: MediaReference | null;
  setCurrentPreprocessingTask: (
    taskId: string,
    tool: PreprocessingTool,
    videoPath: string,
    videoRef?: MediaReference | null,
  ) => void;
  clearCurrentPreprocessingTask: () => void;

  preprocessingFiles: ProjectFile[];
  addPreprocessingFile: (file: ProjectFile) => void;
  removePreprocessingFile: (path: string) => void;
  updatePreprocessingFile: (
    path: string,
    updates: Partial<ProjectFile>,
  ) => void;

  preprocessingVideoPath: string | null;
  preprocessingVideoRef: MediaReference | null;
  setPreprocessingVideoPath: (path: string | null) => void;
  setPreprocessingVideoRef: (reference: MediaReference | null) => void;
}

const PREPROCESSING_STORE_KEY = "preprocessing-storage";

type PreprocessingSnapshot = Pick<
  PreprocessingState,
  | "preprocessingActiveTool"
  | "enhanceModel"
  | "enhanceScale"
  | "enhanceMethod"
  | "cleanMethod"
  | "ocrEngine"
  | "ocrResults"
  | "preprocessingVideoPath"
  | "preprocessingVideoRef"
  | "preprocessingFiles"
>;

function normalizePreprocessingSnapshot(
  payload: Partial<PreprocessingSnapshot> | null | undefined,
): PreprocessingSnapshot {
  return {
    preprocessingActiveTool:
      payload?.preprocessingActiveTool === "enhance" ||
      payload?.preprocessingActiveTool === "clean" ||
      payload?.preprocessingActiveTool === "extract"
        ? payload.preprocessingActiveTool
        : "extract",
    enhanceModel:
      typeof payload?.enhanceModel === "string"
        ? payload.enhanceModel
        : "RealESRGAN-x4plus",
    enhanceScale: typeof payload?.enhanceScale === "string" ? payload.enhanceScale : "4x",
    enhanceMethod:
      typeof payload?.enhanceMethod === "string" ? payload.enhanceMethod : "realesrgan",
    cleanMethod: typeof payload?.cleanMethod === "string" ? payload.cleanMethod : "telea",
    ocrEngine: typeof payload?.ocrEngine === "string" ? payload.ocrEngine : "rapid",
    ocrResults: Array.isArray(payload?.ocrResults) ? payload.ocrResults : [],
    preprocessingVideoPath:
      typeof payload?.preprocessingVideoPath === "string"
        ? payload.preprocessingVideoPath
        : null,
    preprocessingVideoRef:
      payload?.preprocessingVideoRef && typeof payload.preprocessingVideoRef === "object"
        ? (payload.preprocessingVideoRef as MediaReference)
        : null,
    preprocessingFiles: Array.isArray(payload?.preprocessingFiles)
      ? payload.preprocessingFiles
      : [],
  };
}

function readPreprocessingSnapshot() {
  return normalizePreprocessingSnapshot(
    readUiStateValue<Partial<PreprocessingSnapshot>>(PREPROCESSING_STORE_KEY),
  );
}

function persistPreprocessingSnapshot(state: PreprocessingState) {
  writeUiStateValue(PREPROCESSING_STORE_KEY, {
    preprocessingActiveTool: state.preprocessingActiveTool,
    enhanceModel: state.enhanceModel,
    enhanceScale: state.enhanceScale,
    enhanceMethod: state.enhanceMethod,
    cleanMethod: state.cleanMethod,
    ocrEngine: state.ocrEngine,
    ocrResults: state.ocrResults,
    preprocessingVideoPath: state.preprocessingVideoPath,
    preprocessingVideoRef: state.preprocessingVideoRef,
    preprocessingFiles: state.preprocessingFiles,
  } satisfies PreprocessingSnapshot);
}

const initialSnapshot = readPreprocessingSnapshot();

export const usePreprocessingStore = create<PreprocessingState>()((set) => ({
  preprocessingActiveTool: initialSnapshot.preprocessingActiveTool,
  setPreprocessingActiveTool: (tool) => set({ preprocessingActiveTool: tool }),

  enhanceModel: initialSnapshot.enhanceModel,
  setEnhanceModel: (model) => set({ enhanceModel: model }),

  enhanceScale: initialSnapshot.enhanceScale,
  setEnhanceScale: (scale) => set({ enhanceScale: scale }),

  enhanceMethod: initialSnapshot.enhanceMethod,
  setEnhanceMethod: (method) => set({ enhanceMethod: method }),

  cleanMethod: initialSnapshot.cleanMethod,
  setCleanMethod: (method) => set({ cleanMethod: method }),

  ocrEngine: initialSnapshot.ocrEngine,
  setOcrEngine: (engine) => set({ ocrEngine: engine }),

  ocrResults: initialSnapshot.ocrResults,
  setOcrResults: (results) => set({ ocrResults: results }),

  preprocessingIsProcessing: false,
  setPreprocessingIsProcessing: (processing) =>
    set({ preprocessingIsProcessing: processing }),
  currentPreprocessingTaskId: null,
  currentPreprocessingTaskTool: null,
  currentPreprocessingTaskVideoPath: null,
  currentPreprocessingTaskVideoRef: null,
  setCurrentPreprocessingTask: (taskId, tool, videoPath, videoRef = null) =>
    set({
      currentPreprocessingTaskId: taskId,
      currentPreprocessingTaskTool: tool,
      currentPreprocessingTaskVideoPath: videoPath,
      currentPreprocessingTaskVideoRef: videoRef,
      preprocessingIsProcessing: true,
    }),
  clearCurrentPreprocessingTask: () =>
    set({
      currentPreprocessingTaskId: null,
      currentPreprocessingTaskTool: null,
      currentPreprocessingTaskVideoPath: null,
      currentPreprocessingTaskVideoRef: null,
      preprocessingIsProcessing: false,
    }),

  preprocessingFiles: initialSnapshot.preprocessingFiles,
  addPreprocessingFile: (file) =>
    set((state) => {
      if (state.preprocessingFiles.some((f) => f.path === file.path)) {
        return state;
      }
      return { preprocessingFiles: [...state.preprocessingFiles, file] };
    }),
  removePreprocessingFile: (path) =>
    set((state) => ({
      preprocessingFiles: state.preprocessingFiles.filter(
        (f) => f.path !== path,
      ),
      preprocessingVideoPath:
        state.preprocessingVideoPath === path
          ? null
          : state.preprocessingVideoPath,
      preprocessingVideoRef:
        state.preprocessingVideoRef?.path === path
          ? null
          : state.preprocessingVideoRef,
    })),
  updatePreprocessingFile: (path, updates) =>
    set((state) => ({
      preprocessingFiles: state.preprocessingFiles.map((f) =>
        f.path === path ? { ...f, ...updates } : f,
      ),
    })),

  preprocessingVideoPath: initialSnapshot.preprocessingVideoPath,
  setPreprocessingVideoPath: (path) => set({ preprocessingVideoPath: path }),
  preprocessingVideoRef: initialSnapshot.preprocessingVideoRef,
  setPreprocessingVideoRef: (reference) =>
    set({ preprocessingVideoRef: reference }),
}));

usePreprocessingStore.subscribe(persistPreprocessingSnapshot);
