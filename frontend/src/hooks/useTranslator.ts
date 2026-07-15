import {
  useTranslatorStore,
  type TranslatorMode,
  type TranslatorState,
} from "../stores/translatorStore";
import { useTranslationTask } from "./useTranslationTask";
import { useGlossary } from "./useGlossary";
import { useFileIO } from "./useFileIO";
import type { GlossaryTerm } from "../services/domain";
import type { MediaReference } from "../services/ui/mediaReference";

// --- Types ---
export type { TranslatorMode };

type UseTranslatorReturn = Pick<
  TranslatorState,
  | "sourceSegments"
  | "targetSegments"
  | "sourceFileRef"
  | "targetSubtitleRef"
  | "targetLang"
  | "mode"
  | "activeMode"
  | "resultMode"
  | "taskId"
  | "taskStatus"
  | "progress"
  | "taskError"
  | "executionMode"
  | "setSourceSegments"
  | "updateTargetSegment"
  | "setTargetLang"
  | "setMode"
> & {
  glossary: GlossaryTerm[];
  isTranslating: boolean;
  handleFileUpload: (input: MediaReference) => Promise<void>;
  refreshGlossary: () => Promise<void>;
  startTranslation: () => Promise<void>;
  proofreadSubtitle: () => Promise<void>;
  exportSRT: () => Promise<void>;
  handleOpenInEditor: () => Promise<void>;
};

export const useTranslator = (): UseTranslatorReturn => {
  // 1. Core State (Direct Store Access for simple updates)
  const {
    sourceSegments,
    targetSegments,
    sourceFileRef,
    activeMode,
    resultMode,
    targetSubtitleRef,
    setSourceSegments,
    updateTargetSegment,
  } = useTranslatorStore();

  // 2. Sub-hooks
  const task = useTranslationTask();
  const glo = useGlossary();
  const io = useFileIO();

  // 3. Aggregation
  return {
    // Data
    sourceSegments,
    targetSegments,
    glossary: glo.glossary,
    sourceFileRef: io.sourceFileRef ?? sourceFileRef,
    targetSubtitleRef,

    // UI State
    targetLang: task.targetLang,
    mode: task.mode,
    activeMode,
    resultMode,
    taskId: task.taskId,
    taskStatus: task.taskStatus,
    progress: task.progress,
    taskError: task.taskError,
    executionMode: task.executionMode,
    isTranslating: task.isTranslating,

    // Actions
    setSourceSegments,
    updateTargetSegment,
    setTargetLang: task.setTargetLang,
    setMode: task.setMode,
    handleFileUpload: io.handleFileUpload,
    refreshGlossary: glo.refreshGlossary,
    startTranslation: task.startTranslation,
    proofreadSubtitle: task.proofreadSubtitle,
    exportSRT: io.exportSRT,
    handleOpenInEditor: io.handleOpenInEditor,
  };
};
