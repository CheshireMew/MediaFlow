import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OCRTextEvent } from "../types/api";
import type { MediaReference } from "../services/ui/mediaReference";

export interface ProjectFile {
  path: string;
  name: string;
  size: number;
  resolution?: string;
}

export type PreprocessingTool = "enhance" | "clean" | "extract";

export interface PreprocessingState {
  // Tool State
  preprocessingActiveTool: PreprocessingTool;
  setPreprocessingActiveTool: (tool: PreprocessingTool) => void;

  enhanceModel: string;
  setEnhanceModel: (model: string) => void;

  enhanceScale: string;
  setEnhanceScale: (scale: string) => void;

  enhanceMethod: string;
  setEnhanceMethod: (method: string) => void;

  // Cleanup Settings
  cleanMethod: string;
  setCleanMethod: (method: string) => void;

  // OCR Settings & Results
  ocrEngine: string;
  setOcrEngine: (engine: string) => void;
  ocrResults: OCRTextEvent[];
  setOcrResults: (results: OCRTextEvent[]) => void;

  // Active Task State
  preprocessingIsProcessing: boolean;
  setPreprocessingIsProcessing: (processing: boolean) => void;
  preprocessingActiveTaskId: string | null;
  preprocessingActiveTaskTool: PreprocessingTool | null;
  preprocessingActiveTaskVideoPath: string | null;
  preprocessingActiveTaskVideoRef: MediaReference | null;
  setPreprocessingActiveTask: (
    taskId: string,
    tool: PreprocessingTool,
    videoPath: string,
    videoRef?: MediaReference | null,
  ) => void;
  clearPreprocessingActiveTask: () => void;

  // File State
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

export const usePreprocessingStore = create<PreprocessingState>()(
  persist(
    (set) => ({
      preprocessingActiveTool: "extract",
      setPreprocessingActiveTool: (tool) =>
        set({ preprocessingActiveTool: tool }),

      enhanceModel: "RealESRGAN-x4plus", // Default matches slice
      setEnhanceModel: (model) => set({ enhanceModel: model }),

      enhanceScale: "4x",
      setEnhanceScale: (scale) => set({ enhanceScale: scale }),

      enhanceMethod: "realesrgan",
      setEnhanceMethod: (method) => set({ enhanceMethod: method }),

      cleanMethod: "telea",
      setCleanMethod: (method) => set({ cleanMethod: method }),

      ocrEngine: "rapid",
      setOcrEngine: (engine) => set({ ocrEngine: engine }),

      ocrResults: [],
      setOcrResults: (results) => set({ ocrResults: results }),

      preprocessingIsProcessing: false,
      setPreprocessingIsProcessing: (processing) =>
        set({ preprocessingIsProcessing: processing }),
      preprocessingActiveTaskId: null,
      preprocessingActiveTaskTool: null,
      preprocessingActiveTaskVideoPath: null,
      preprocessingActiveTaskVideoRef: null,
      setPreprocessingActiveTask: (taskId, tool, videoPath, videoRef = null) =>
        set({
          preprocessingActiveTaskId: taskId,
          preprocessingActiveTaskTool: tool,
          preprocessingActiveTaskVideoPath: videoPath,
          preprocessingActiveTaskVideoRef: videoRef,
          preprocessingIsProcessing: true,
        }),
      clearPreprocessingActiveTask: () =>
        set({
          preprocessingActiveTaskId: null,
          preprocessingActiveTaskTool: null,
          preprocessingActiveTaskVideoPath: null,
          preprocessingActiveTaskVideoRef: null,
          preprocessingIsProcessing: false,
        }),

      preprocessingFiles: [],
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
          // Clear active path if removed file was selected
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

      preprocessingVideoPath: null,
      setPreprocessingVideoPath: (path) =>
        set({ preprocessingVideoPath: path }),
      preprocessingVideoRef: null,
      setPreprocessingVideoRef: (reference) =>
        set({ preprocessingVideoRef: reference }),
    }),
    {
      name: "preprocessing-storage",
      version: 1,
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as Partial<PreprocessingState>;
        return {
          preprocessingActiveTool:
            state.preprocessingActiveTool === "enhance" ||
            state.preprocessingActiveTool === "clean" ||
            state.preprocessingActiveTool === "extract"
              ? state.preprocessingActiveTool
              : "extract",
          enhanceModel:
            typeof state.enhanceModel === "string" ? state.enhanceModel : "RealESRGAN-x4plus",
          enhanceScale: typeof state.enhanceScale === "string" ? state.enhanceScale : "4x",
          enhanceMethod:
            typeof state.enhanceMethod === "string" ? state.enhanceMethod : "realesrgan",
          cleanMethod: typeof state.cleanMethod === "string" ? state.cleanMethod : "telea",
          ocrEngine: typeof state.ocrEngine === "string" ? state.ocrEngine : "rapid",
          ocrResults: Array.isArray(state.ocrResults) ? state.ocrResults : [],
          preprocessingVideoPath:
            typeof state.preprocessingVideoPath === "string"
              ? state.preprocessingVideoPath
              : null,
          preprocessingVideoRef:
            state.preprocessingVideoRef &&
            typeof state.preprocessingVideoRef === "object"
              ? (state.preprocessingVideoRef as MediaReference)
              : null,
          preprocessingFiles: Array.isArray(state.preprocessingFiles)
            ? state.preprocessingFiles
            : [],
        };
      },
      partialize: (state) => ({
        // Snapshot durable workspace context only. Active task execution stays runtime-only.
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
      }),
    },
  ),
);
