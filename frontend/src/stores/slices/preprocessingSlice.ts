import type { StateCreator } from "zustand";

export interface ProjectFile {
  path: string;
  name: string;
  size: number;
  resolution?: string;
}

export interface PreprocessingSlice {
  // Tool State
  preprocessingActiveTool: "enhance" | "clean" | "extract";
  setPreprocessingActiveTool: (tool: "enhance" | "clean" | "extract") => void;

  enhanceModel: string;
  setEnhanceModel: (model: string) => void;

  ocrEngine: string;
  setOcrEngine: (engine: string) => void;

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

export const createPreprocessingSlice: StateCreator<PreprocessingSlice> = (
  set,
) => ({
  preprocessingActiveTool: "extract",
  setPreprocessingActiveTool: (tool) => set({ preprocessingActiveTool: tool }),

  enhanceModel: "RealESRGAN-x4plus",
  setEnhanceModel: (model) => set({ enhanceModel: model }),

  ocrEngine: "rapid",
  setOcrEngine: (engine) => set({ ocrEngine: engine }),

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
  setPreprocessingVideoPath: (path) => set({ preprocessingVideoPath: path }),
});
