import {
  useTranslatorStore,
  type TranslatorMode,
} from "../stores/translatorStore";
import { useTranslationTask } from "./useTranslationTask";
import { useGlossary } from "./useGlossary";
import { useFileIO } from "./useFileIO";
import type { SubtitleSegment } from "../types/task";
import type { GlossaryTerm } from "../services/translator/translatorService";

// --- Types ---
export type { TranslatorMode };

interface UseTranslatorReturn {
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
  isTranslating: boolean;

  // Actions
  setSourceSegments: (s: SubtitleSegment[]) => void;
  updateTargetSegment: (index: number, text: string) => void;
  setTargetLang: (lang: string) => void;
  setMode: (m: TranslatorMode) => void;
  handleFileUpload: (path: string) => Promise<void>;
  refreshGlossary: () => Promise<void>;
  startTranslation: () => Promise<void>;
  exportSRT: () => Promise<void>;
  handleOpenInEditor: () => Promise<void>;
}

export const useTranslator = (): UseTranslatorReturn => {
  // 1. Core State (Direct Store Access for simple updates)
  const {
    sourceSegments,
    targetSegments,
    setSourceSegments,
    updateTargetSegment,
  } = useTranslatorStore();

  // 2. Sub-hooks
  const task = useTranslationTask();
  const glo = useGlossary();
  const io = useFileIO();

  // 3. Aggregation
  // We explicitly map to the interface to ensure compatibility
  return {
    // Data
    sourceSegments,
    targetSegments,
    glossary: glo.glossary,
    sourceFilePath: io.sourceFilePath,

    // UI State
    targetLang: task.targetLang,
    mode: task.mode,
    taskId: task.taskId,
    taskStatus: task.taskStatus,
    progress: task.progress,
    isTranslating: task.isTranslating,

    // Actions
    setSourceSegments,
    updateTargetSegment,
    setTargetLang: task.setTargetLang,
    setMode: task.setMode,
    handleFileUpload: io.handleFileUpload,
    refreshGlossary: glo.refreshGlossary,
    startTranslation: task.startTranslation,
    exportSRT: io.exportSRT,
    handleOpenInEditor: io.handleOpenInEditor,
  };
};
