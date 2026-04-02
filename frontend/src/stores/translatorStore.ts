import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SubtitleSegment } from "../types/task";
import type { GlossaryTerm } from "../services/domain";
import type { MediaReference } from "../services/ui/mediaReference";
import type { NullableExecutionMode } from "../services/domain";
import {
  persistStoredTranslationPreferences,
  restoreStoredTranslationPreferences,
  type TranslationExecutionMode,
} from "../services/persistence/translationPreferences";

export type TranslatorMode = TranslationExecutionMode;
export type TranslatorResultMode = TranslatorMode | null;
export type TranslatorExecutionMode = NullableExecutionMode;

interface TranslatorState {
  // Data
  sourceSegments: SubtitleSegment[];
  targetSegments: SubtitleSegment[];
  glossary: GlossaryTerm[];
  sourceFilePath: string | null;
  sourceFileRef: MediaReference | null;
  targetSubtitleRef: MediaReference | null;

  // UI State
  targetLang: string;
  mode: TranslatorMode;
  activeMode: TranslatorMode | null;
  resultMode: TranslatorResultMode;
  taskId: string | null;
  taskStatus: string;
  progress: number;
  taskError: string | null;
  executionMode: TranslatorExecutionMode;

  // Computed
  isTranslating: () => boolean;

  // Actions
  setSourceSegments: (segments: SubtitleSegment[]) => void;
  setTargetSegments: (segments: SubtitleSegment[]) => void;
  updateTargetSegment: (index: number, text: string) => void;
  setGlossary: (terms: GlossaryTerm[]) => void;
  setSourceFilePath: (path: string | null) => void;
  setSourceFileRef: (reference: MediaReference | null) => void;
  setTargetSubtitleRef: (reference: MediaReference | null) => void;
  setTargetLang: (lang: string) => void;
  setMode: (mode: TranslatorMode) => void;
  setActiveMode: (mode: TranslatorMode | null) => void;
  setResultMode: (mode: TranslatorResultMode) => void;
  setTaskId: (id: string | null) => void;
  setTaskStatus: (status: string) => void;
  setProgress: (progress: number) => void;
  setTaskError: (error: string | null) => void;
  setExecutionMode: (mode: TranslatorExecutionMode) => void;
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
      sourceFileRef: null,
      targetSubtitleRef: null,
      targetLang: restoreStoredTranslationPreferences().targetLanguage,
      mode: restoreStoredTranslationPreferences().mode,
      activeMode: null,
      resultMode: null,
      taskId: null,
      taskStatus: "",
      progress: 0,
      taskError: null,
      executionMode: null,

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
      setSourceFileRef: (sourceFileRef) => set({ sourceFileRef }),
      setTargetSubtitleRef: (targetSubtitleRef) => set({ targetSubtitleRef }),
      setTargetLang: (lang) => {
        persistStoredTranslationPreferences({
          ...restoreStoredTranslationPreferences(),
          targetLanguage: lang,
        });
        set({ targetLang: lang });
      },
      setMode: (mode) => {
        persistStoredTranslationPreferences({
          ...restoreStoredTranslationPreferences(),
          mode,
        });
        set({ mode });
      },
      setActiveMode: (activeMode) => set({ activeMode }),
      setResultMode: (resultMode) => set({ resultMode }),
      setTaskId: (id) => set({ taskId: id }),
      setTaskStatus: (status) => set({ taskStatus: status }),
      setProgress: (progress) => set({ progress }),
      setTaskError: (taskError) => set({ taskError }),
      setExecutionMode: (executionMode) => set({ executionMode }),

      resetTask: () =>
        set({
          taskId: null,
          taskStatus: "",
          progress: 0,
          taskError: null,
          executionMode: null,
          activeMode: null,
          resultMode: null,
          targetSubtitleRef: null,
        }),
    }),
    {
      name: "translator-storage",
      version: 2,
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as Partial<TranslatorState>;
        return {
          sourceSegments: Array.isArray(state.sourceSegments) ? state.sourceSegments : [],
          targetSegments: Array.isArray(state.targetSegments) ? state.targetSegments : [],
          sourceFilePath:
            typeof state.sourceFilePath === "string" ? state.sourceFilePath : null,
          sourceFileRef:
            state.sourceFileRef && typeof state.sourceFileRef === "object"
              ? (state.sourceFileRef as MediaReference)
              : null,
          targetSubtitleRef:
            state.targetSubtitleRef && typeof state.targetSubtitleRef === "object"
              ? (state.targetSubtitleRef as MediaReference)
              : null,
          targetLang: restoreStoredTranslationPreferences().targetLanguage,
          mode: restoreStoredTranslationPreferences().mode,
          resultMode:
            state.resultMode === "standard" ||
            state.resultMode === "intelligent" ||
            state.resultMode === "proofread"
              ? state.resultMode
              : null,
        };
      },
      partialize: (state) => ({
        // Snapshot only durable document/preference state. Runtime task state stays ephemeral.
        sourceSegments: state.sourceSegments,
        targetSegments: state.targetSegments,
        sourceFilePath: state.sourceFilePath,
        sourceFileRef: state.sourceFileRef,
        targetSubtitleRef: state.targetSubtitleRef,
        resultMode: state.resultMode,
      }),
    },
  ),
);
