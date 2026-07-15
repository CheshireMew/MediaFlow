import { create } from "zustand";
import type { SubtitleSegment } from "../types/task";
import type {
  GlossaryTerm,
  NullableExecutionMode,
  TranslationTargetLanguage,
} from "../services/domain";
import {
  normalizeMediaReference,
  type MediaReference,
} from "../services/ui/mediaReference";
import {
  persistStoredTranslationPreferences,
  restoreStoredTranslationPreferences,
  type TranslationExecutionMode,
} from "../services/persistence/translationPreferences";
import {
  subscribeUiStateSettingsInitialized,
} from "../services/persistence/uiStateSettings";
import {
  readWorkspaceStateValue,
  subscribeWorkspaceStateInitialized,
  writeWorkspaceStateValue,
} from "../services/persistence/workspaceState";

export type TranslatorMode = TranslationExecutionMode;
export type TranslatorResultMode = TranslatorMode | null;
export type TranslatorExecutionMode = NullableExecutionMode;

export interface TranslatorState {
  // Data
  sourceSegments: SubtitleSegment[];
  targetSegments: SubtitleSegment[];
  glossary: GlossaryTerm[];
  sourceFileRef: MediaReference | null;
  targetSubtitleRef: MediaReference | null;

  // UI State
  targetLang: TranslationTargetLanguage;
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
  setSourceFileRef: (reference: MediaReference | null) => void;
  setTargetSubtitleRef: (reference: MediaReference | null) => void;
  setTargetLang: (lang: TranslationTargetLanguage) => void;
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
  | "sourceFileRef"
  | "targetSubtitleRef"
  | "resultMode"
>;

function normalizeTranslatorSnapshot(
  payload: Partial<TranslatorSnapshot> | null | undefined,
): TranslatorSnapshot {
  const sourceFileRef = normalizeMediaReference(payload?.sourceFileRef);
  const candidateTargetSubtitleRef = normalizeMediaReference(payload?.targetSubtitleRef);
  const targetSubtitleRef =
    sourceFileRef?.path === candidateTargetSubtitleRef?.path
      ? null
      : candidateTargetSubtitleRef;

  return {
    sourceSegments: Array.isArray(payload?.sourceSegments)
      ? payload.sourceSegments
      : [],
    targetSegments: Array.isArray(payload?.targetSegments)
      ? payload.targetSegments
      : [],
    sourceFileRef,
    targetSubtitleRef,
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
    readWorkspaceStateValue<Partial<TranslatorSnapshot>>(TRANSLATOR_STORE_KEY),
  );
}

let isHydratingTranslatorSnapshot = false;

function persistTranslatorSnapshot(state: TranslatorState) {
  if (isHydratingTranslatorSnapshot) {
    return;
  }

  if (
    state.sourceSegments === lastPersistedTranslatorState.sourceSegments &&
    state.targetSegments === lastPersistedTranslatorState.targetSegments &&
    state.sourceFileRef === lastPersistedTranslatorState.sourceFileRef &&
    state.targetSubtitleRef === lastPersistedTranslatorState.targetSubtitleRef &&
    state.resultMode === lastPersistedTranslatorState.resultMode
  ) {
    return;
  }
  const snapshot = {
    sourceSegments: state.sourceSegments,
    targetSegments: state.targetSegments,
    sourceFileRef: state.sourceFileRef,
    targetSubtitleRef: state.targetSubtitleRef,
    resultMode: state.resultMode,
  } satisfies TranslatorSnapshot;
  lastPersistedTranslatorState = snapshot;
  writeWorkspaceStateValue(TRANSLATOR_STORE_KEY, snapshot);
}

const initialTranslationPreferences = restoreStoredTranslationPreferences();
const initialTranslatorSnapshot = readTranslatorSnapshot();
let lastPersistedTranslatorState = initialTranslatorSnapshot;

export const useTranslatorStore = create<TranslatorState>()((set, get) => ({
      // Initial State
      sourceSegments: initialTranslatorSnapshot.sourceSegments,
      targetSegments: initialTranslatorSnapshot.targetSegments,
      glossary: [],
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
      setSourceFileRef: (sourceFileRef) =>
        set((state) => ({
          sourceFileRef,
          targetSubtitleRef:
            sourceFileRef?.path === state.targetSubtitleRef?.path
              ? null
              : state.targetSubtitleRef,
        })),
      setTargetSubtitleRef: (targetSubtitleRef) =>
        set((state) => ({
          targetSubtitleRef:
            state.sourceFileRef?.path === targetSubtitleRef?.path
              ? null
              : targetSubtitleRef,
        })),
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

subscribeWorkspaceStateInitialized(() => {
  const snapshot = readTranslatorSnapshot();

  isHydratingTranslatorSnapshot = true;
  useTranslatorStore.setState({
    sourceSegments: snapshot.sourceSegments,
    targetSegments: snapshot.targetSegments,
    sourceFileRef: snapshot.sourceFileRef,
    targetSubtitleRef: snapshot.targetSubtitleRef,
    resultMode: snapshot.resultMode,
  });
  lastPersistedTranslatorState = snapshot;
  isHydratingTranslatorSnapshot = false;
});

subscribeUiStateSettingsInitialized(() => {
  const preferences = restoreStoredTranslationPreferences();
  useTranslatorStore.setState({
    targetLang: preferences.targetLanguage,
    mode: preferences.mode,
  });
});
