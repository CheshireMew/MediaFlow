import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OCRTextEvent } from "../types/api";

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
  setPreprocessingActiveTask: (
    taskId: string,
    tool: PreprocessingTool,
    videoPath: string,
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
  setPreprocessingVideoPath: (path: string | null) => void;
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
      setPreprocessingActiveTask: (taskId, tool, videoPath) =>
        set({
          preprocessingActiveTaskId: taskId,
          preprocessingActiveTaskTool: tool,
          preprocessingActiveTaskVideoPath: videoPath,
          preprocessingIsProcessing: true,
        }),
      clearPreprocessingActiveTask: () =>
        set({
          preprocessingActiveTaskId: null,
          preprocessingActiveTaskTool: null,
          preprocessingActiveTaskVideoPath: null,
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
    }),
    {
      name: "preprocessing-storage",
      partialize: (state) => ({
        preprocessingActiveTool: state.preprocessingActiveTool,
        enhanceModel: state.enhanceModel,
        enhanceScale: state.enhanceScale,
        enhanceMethod: state.enhanceMethod,
        cleanMethod: state.cleanMethod,
        ocrEngine: state.ocrEngine,
        ocrResults: state.ocrResults,
        preprocessingVideoPath: state.preprocessingVideoPath,
        // We typically don't persist results or files if they are transient,
        // but editorStore persisted files. logic says yes for files.
        preprocessingFiles: state.preprocessingFiles,
      }),
    },
  ),
);
