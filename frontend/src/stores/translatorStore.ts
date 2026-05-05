import { create } from "zustand";
import type { SubtitleSegment } from "../types/task";
import type { GlossaryTerm } from "../services/domain";
import type { MediaReference } from "../services/ui/mediaReference";
import type { NullableExecutionMode } from "../services/domain";
import {
  persistStoredTranslationPreferences,
  restoreStoredTranslationPreferences,
  type TranslationExecutionMode,
} from "../services/persistence/translationPreferences";
import { readUiStateValue, writeUiStateValue } from "../services/persistence/uiStateSettings";

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

const TRANSLATOR_STORE_KEY = "translator-storage";

type TranslatorSnapshot = Pick<
  TranslatorState,
  | "sourceSegments"
  | "targetSegments"
  | "sourceFilePath"
  | "sourceFileRef"
  | "targetSubtitleRef"
  | "resultMode"
>;

function normalizeTranslatorSnapshot(
  payload: Partial<TranslatorSnapshot> | null | undefined,
): TranslatorSnapshot {
  return {
    sourceSegments: Array.isArray(payload?.sourceSegments)
      ? payload.sourceSegments
      : [],
    targetSegments: Array.isArray(payload?.targetSegments)
      ? payload.targetSegments
      : [],
    sourceFilePath:
      typeof payload?.sourceFilePath === "string" ? payload.sourceFilePath : null,
    sourceFileRef:
      payload?.sourceFileRef && typeof payload.sourceFileRef === "object"
        ? (payload.sourceFileRef as MediaReference)
        : null,
    targetSubtitleRef:
      payload?.targetSubtitleRef && typeof payload.targetSubtitleRef === "object"
        ? (payload.targetSubtitleRef as MediaReference)
        : null,
    resultMode:
      payload?.resultMode === "standard" ||
      payload?.resultMode === "intelligent" ||
      payload?.resultMode === "proofread"
        ? payload.resultMode
        : null,
  };
}

function readTranslatorSnapshot() {
  return normalizeTranslatorSnapshot(
    readUiStateValue<Partial<TranslatorSnapshot>>(TRANSLATOR_STORE_KEY),
  );
}

function persistTranslatorSnapshot(state: TranslatorState) {
  writeUiStateValue(TRANSLATOR_STORE_KEY, {
    sourceSegments: state.sourceSegments,
    targetSegments: state.targetSegments,
    sourceFilePath: state.sourceFilePath,
    sourceFileRef: state.sourceFileRef,
    targetSubtitleRef: state.targetSubtitleRef,
    resultMode: state.resultMode,
  } satisfies TranslatorSnapshot);
}

const initialTranslationPreferences = restoreStoredTranslationPreferences();
const initialTranslatorSnapshot = readTranslatorSnapshot();

export const useTranslatorStore = create<TranslatorState>()((set, get) => ({
      // Initial State
      sourceSegments: initialTranslatorSnapshot.sourceSegments,
      targetSegments: initialTranslatorSnapshot.targetSegments,
      glossary: [],
      sourceFilePath: initialTranslatorSnapshot.sourceFilePath,
      sourceFileRef: initialTranslatorSnapshot.sourceFileRef,
      targetSubtitleRef: initialTranslatorSnapshot.targetSubtitleRef,
      targetLang: initialTranslationPreferences.targetLanguage,
      mode: initialTranslationPreferences.mode,
      activeMode: null,
      resultMode: initialTranslatorSnapshot.resultMode,
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
}));

useTranslatorStore.subscribe(persistTranslatorSnapshot);
