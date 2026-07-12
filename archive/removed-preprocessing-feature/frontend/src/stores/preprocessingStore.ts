import { create } from "zustand";
import type { CleanRequest, OCRTextEvent } from "../types/api";
import {
  normalizeMediaReference,
  type MediaReference,
} from "../services/ui/mediaReference";
import {
  readWorkspaceStateValue,
  subscribeWorkspaceStateInitialized,
  writeWorkspaceStateValue,
} from "../services/persistence/workspaceState";

export interface ProjectFile extends MediaReference {
  size: number;
  resolution?: string;
}

export type PreprocessingTool = "enhance" | "clean" | "extract";
export type CleanupMethod = NonNullable<CleanRequest["method"]>;

export interface PreprocessingState {
  preprocessingActiveTool: PreprocessingTool;
  setPreprocessingActiveTool: (tool: PreprocessingTool) => void;

  enhanceModel: string;
  setEnhanceModel: (model: string) => void;

  enhanceScale: string;
  setEnhanceScale: (scale: string) => void;

  enhanceMethod: string;
  setEnhanceMethod: (method: string) => void;

  cleanMethod: CleanupMethod;
  setCleanMethod: (method: CleanupMethod) => void;

  ocrEngine: string;
  setOcrEngine: (engine: string) => void;
  ocrResults: OCRTextEvent[];
  setOcrResults: (results: OCRTextEvent[]) => void;

  preprocessingIsProcessing: boolean;
  setPreprocessingIsProcessing: (processing: boolean) => void;
  currentPreprocessingTaskId: string | null;
  currentPreprocessingTaskTool: PreprocessingTool | null;
  currentPreprocessingTaskVideoRef: MediaReference | null;
  setCurrentPreprocessingTask: (
    taskId: string,
    tool: PreprocessingTool,
    videoRef: MediaReference,
  ) => void;
  clearCurrentPreprocessingTask: () => void;

  preprocessingFiles: ProjectFile[];
  addPreprocessingFile: (file: ProjectFile) => void;
  removePreprocessingFile: (path: string) => void;
  updatePreprocessingFile: (
    path: string,
    updates: Partial<ProjectFile>,
  ) => void;

  preprocessingVideoRef: MediaReference | null;
  setPreprocessingVideoRef: (reference: MediaReference | null) => void;
}

const PREPROCESSING_STORE_KEY = "preprocessing-storage";

export type PreprocessingSnapshot = Pick<
  PreprocessingState,
  | "preprocessingActiveTool"
  | "enhanceModel"
  | "enhanceScale"
  | "enhanceMethod"
  | "cleanMethod"
  | "ocrEngine"
  | "ocrResults"
  | "preprocessingVideoRef"
  | "preprocessingFiles"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeProjectFiles(value: unknown): ProjectFile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const paths = new Set<string>();
  const files: ProjectFile[] = [];

  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      typeof candidate.size !== "number" ||
      !Number.isFinite(candidate.size) ||
      candidate.size < 0
    ) {
      continue;
    }

    const reference = normalizeMediaReference(candidate);
    if (!reference || paths.has(reference.path)) {
      continue;
    }

    paths.add(reference.path);
    const resolution =
      typeof candidate.resolution === "string" && candidate.resolution.trim()
        ? candidate.resolution.trim()
        : undefined;
    files.push({
      ...reference,
      size: candidate.size,
      ...(resolution ? { resolution } : {}),
    });
  }

  return files;
}

export function normalizePreprocessingSnapshot(
  payload: unknown,
): PreprocessingSnapshot {
  const snapshot = isRecord(payload) ? payload : {};

  return {
    preprocessingActiveTool:
      snapshot.preprocessingActiveTool === "enhance" ||
      snapshot.preprocessingActiveTool === "clean" ||
      snapshot.preprocessingActiveTool === "extract"
        ? snapshot.preprocessingActiveTool
        : "extract",
    enhanceModel:
      typeof snapshot.enhanceModel === "string"
        ? snapshot.enhanceModel
        : "RealESRGAN-x4plus",
    enhanceScale: typeof snapshot.enhanceScale === "string" ? snapshot.enhanceScale : "4x",
    enhanceMethod:
      typeof snapshot.enhanceMethod === "string" ? snapshot.enhanceMethod : "realesrgan",
    cleanMethod:
      snapshot.cleanMethod === "telea" || snapshot.cleanMethod === "navier"
        ? snapshot.cleanMethod
        : "telea",
    ocrEngine: typeof snapshot.ocrEngine === "string" ? snapshot.ocrEngine : "rapid",
    ocrResults: Array.isArray(snapshot.ocrResults) ? snapshot.ocrResults : [],
    preprocessingVideoRef: normalizeMediaReference(snapshot.preprocessingVideoRef),
    preprocessingFiles: normalizeProjectFiles(snapshot.preprocessingFiles),
  };
}

function readPreprocessingSnapshot() {
  return normalizePreprocessingSnapshot(
    readWorkspaceStateValue<Partial<PreprocessingSnapshot>>(PREPROCESSING_STORE_KEY),
  );
}

let isHydratingPreprocessingSnapshot = false;

function persistPreprocessingSnapshot(state: PreprocessingState) {
  if (isHydratingPreprocessingSnapshot) {
    return;
  }

  const snapshot = {
    preprocessingActiveTool: state.preprocessingActiveTool,
    enhanceModel: state.enhanceModel,
    enhanceScale: state.enhanceScale,
    enhanceMethod: state.enhanceMethod,
    cleanMethod: state.cleanMethod,
    ocrEngine: state.ocrEngine,
    ocrResults: state.ocrResults,
    preprocessingVideoRef: state.preprocessingVideoRef,
    preprocessingFiles: state.preprocessingFiles,
  } satisfies PreprocessingSnapshot;
  const serialized = JSON.stringify(snapshot);
  if (serialized === lastPersistedPreprocessingSnapshot) {
    return;
  }
  lastPersistedPreprocessingSnapshot = serialized;
  writeWorkspaceStateValue(PREPROCESSING_STORE_KEY, snapshot);
}

const initialSnapshot = readPreprocessingSnapshot();
let lastPersistedPreprocessingSnapshot = JSON.stringify(initialSnapshot);

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
  currentPreprocessingTaskVideoRef: null,
  setCurrentPreprocessingTask: (taskId, tool, videoRef) =>
    set({
      currentPreprocessingTaskId: taskId,
      currentPreprocessingTaskTool: tool,
      currentPreprocessingTaskVideoRef: videoRef,
      preprocessingIsProcessing: true,
    }),
  clearCurrentPreprocessingTask: () =>
    set({
      currentPreprocessingTaskId: null,
      currentPreprocessingTaskTool: null,
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

  preprocessingVideoRef: initialSnapshot.preprocessingVideoRef,
  setPreprocessingVideoRef: (reference) =>
    set({ preprocessingVideoRef: reference }),
}));

usePreprocessingStore.subscribe(persistPreprocessingSnapshot);

subscribeWorkspaceStateInitialized(() => {
  const snapshot = readPreprocessingSnapshot();
  isHydratingPreprocessingSnapshot = true;
  usePreprocessingStore.setState(snapshot);
  lastPersistedPreprocessingSnapshot = JSON.stringify(snapshot);
  isHydratingPreprocessingSnapshot = false;
});
