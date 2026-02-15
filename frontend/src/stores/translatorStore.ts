import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SubtitleSegment } from "../types/task";
import type { GlossaryTerm } from "../services/translator/translatorService";

export type TranslatorMode = "standard" | "intelligent" | "proofread";

interface TranslatorState {
  // Data
  sourceSegments: SubtitleSegment[];
  targetSegments: SubtitleSegment[];
  glossary: GlossaryTerm[];
  sourceFilePath: string | null;

  // UI State
  targetLang: string;
  mode: TranslatorMode;
  taskId: string | null;
  taskStatus: string;
  progress: number;

  // Computed
  isTranslating: () => boolean;

  // Actions
  setSourceSegments: (segments: SubtitleSegment[]) => void;
  setTargetSegments: (segments: SubtitleSegment[]) => void;
  updateTargetSegment: (index: number, text: string) => void;
  setGlossary: (terms: GlossaryTerm[]) => void;
  setSourceFilePath: (path: string | null) => void;
  setTargetLang: (lang: string) => void;
  setMode: (mode: TranslatorMode) => void;
  setTaskId: (id: string | null) => void;
  setTaskStatus: (status: string) => void;
  setProgress: (progress: number) => void;
  resetTask: () => void;
}

export const useTranslatorStore = create<TranslatorState>()(
  persist(
    (set, get) => ({
      // Initial State
      sourceSegments: [],
      targetSegments: [],
      glossary: [],
      sourceFilePath: null,
      targetLang: "Chinese",
      mode: "standard",
      taskId: null,
      taskStatus: "",
      progress: 0,

      // Computed
      isTranslating: () => {
        const status = get().taskStatus;
        return status === "translating" || status === "starting";
      },

      // Actions
      setSourceSegments: (segments) => set({ sourceSegments: segments }),
      setTargetSegments: (segments) => set({ targetSegments: segments }),

      updateTargetSegment: (index, text) =>
        set((state) => {
          const newSegments = [...state.targetSegments];
          if (newSegments[index]) {
            newSegments[index] = { ...newSegments[index], text };
          }
          return { targetSegments: newSegments };
        }),

      setGlossary: (terms) => set({ glossary: terms }),
      setSourceFilePath: (path) => set({ sourceFilePath: path }),
      setTargetLang: (lang) => set({ targetLang: lang }),
      setMode: (mode) => set({ mode }),
      setTaskId: (id) => set({ taskId: id }),
      setTaskStatus: (status) => set({ taskStatus: status }),
      setProgress: (progress) => set({ progress }),

      resetTask: () =>
        set({
          taskId: null,
          taskStatus: "",
          progress: 0,
        }),
    }),
    {
      name: "translator-storage",
      partialize: (state) => ({
        // Only persist data and user preferences, not transient task status
        sourceSegments: state.sourceSegments,
        targetSegments: state.targetSegments,
        sourceFilePath: state.sourceFilePath,
        targetLang: state.targetLang,
        mode: state.mode,
      }),
    },
  ),
);
