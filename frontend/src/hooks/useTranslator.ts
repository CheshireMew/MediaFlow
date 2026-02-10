import { useEffect, useCallback } from "react";
import type { SubtitleSegment } from "../types/task";
import {
  type GlossaryTerm,
  translatorService,
} from "../services/translator/translatorService";
import { parseSRT } from "../utils/subtitleParser";
import {
  useTranslatorStore,
  type TranslatorMode,
} from "../stores/translatorStore";

// --- Types ---
// Re-exporting for compatibility, though ideally should be imported from store
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
}

export const useTranslator = (): UseTranslatorReturn => {
  // --- Store ---
  const {
    sourceSegments,
    targetSegments,
    glossary,
    sourceFilePath,
    targetLang,
    mode,
    taskId,
    taskStatus,
    progress,
    isTranslating,

    setSourceSegments,
    setTargetSegments,
    updateTargetSegment,
    setGlossary,
    setSourceFilePath,
    setTargetLang,
    setMode,
    setTaskId,
    setTaskStatus,
    setProgress,
  } = useTranslatorStore();

  // --- Init ---
  useEffect(() => {
    refreshGlossary();
    checkPendingNavigation();

    const handleNavigate = (e: CustomEvent) => {
      if (e.detail === "translator") {
        checkPendingNavigation();
      }
    };
    window.addEventListener(
      "mediaflow:navigate",
      handleNavigate as EventListener,
    );
    return () =>
      window.removeEventListener(
        "mediaflow:navigate",
        handleNavigate as EventListener,
      );
  }, []);

  // --- Actions ---

  const checkPendingNavigation = useCallback(() => {
    const pendingFile = sessionStorage.getItem("mediaflow:pending_file");
    if (pendingFile) {
      try {
        const data = JSON.parse(pendingFile);
        // We prioritize subtitle path, but if only video path is present, we might want to try finding subtitles
        if (data.subtitle_path) {
          handleFileUpload(data.subtitle_path);
        } else if (data.video_path) {
          // Try to find srt based on video path logic if needed,
          // but handleFileUpload expects an SRT path.
          // For now, let's try to load if it looks like a subtitle
          if (/\.(srt|vtt|ass)$/i.test(data.video_path)) {
            handleFileUpload(data.video_path);
          } else {
            // Try to guess subtitle path from video path?
            // Or just do nothing and let user import.
          }
        }
        sessionStorage.removeItem("mediaflow:pending_file");
      } catch (e) {
        console.error("[Translator] Failed to parse pending file:", e);
      }
    }
  }, []);

  // --- Actions ---

  const refreshGlossary = async () => {
    try {
      const terms = await translatorService.listTerms();
      setGlossary(terms);
    } catch (e) {
      console.error("Failed to load glossary");
    }
  };

  const handleFileUpload = async (path: string) => {
    if (!window.electronAPI) return;
    setSourceFilePath(path);

    try {
      const content = await window.electronAPI.readFile(path);
      if (!content) {
        throw new Error("File content is empty or could not be read");
      }
      const parsed = parseSRT(content);
      if (parsed.length === 0) {
        alert("Warning: No subtitles found in this file.");
      }
      setSourceSegments(parsed);

      setTargetSegments(parsed.map((s) => ({ ...s, text: "" })));

      // Try load existing translation
      await tryLoadExistingTarget(path);
    } catch (e) {
      console.error("File load error:", e);
      alert(`Failed to load file: ${path}\nCheck console for details.`);
    }
  };

  const tryLoadExistingTarget = async (sourcePath: string) => {
    if (!window.electronAPI) return;
    const priorities = ["_CN", "_EN", "_JP", "_ES", "_FR", "_DE", "_RU"];
    const LANG_SUFFIX_MAP: Record<string, string> = {
      Chinese: "_CN",
      English: "_EN",
      Japanese: "_JP",
      Spanish: "_ES",
      French: "_FR",
      German: "_DE",
      Russian: "_RU",
    };

    for (const suffix of priorities) {
      const targetPath = sourcePath.replace(/(\.[^.]+)$/, `${suffix}.srt`);
      try {
        const content = await window.electronAPI.readFile(targetPath);
        if (content) {
          const foundLang = Object.keys(LANG_SUFFIX_MAP).find(
            (key) => LANG_SUFFIX_MAP[key] === suffix,
          );
          if (foundLang) setTargetLang(foundLang);

          const parsed = parseSRT(content);
          setTargetSegments(parsed);
          break;
        }
      } catch (e) {
        /* Ignore */
      }
    }
  };

  const startTranslation = async () => {
    if (sourceSegments.length === 0) return;

    setTaskStatus("starting");
    setProgress(0);

    try {
      const res = await translatorService.startTranslation({
        segments: sourceSegments,
        target_language: targetLang,
        mode: mode,
        context_path: sourceFilePath,
      });
      setTaskId(res.task_id);
      setTaskStatus("translating");

      // Start Polling
      pollTask(res.task_id);
    } catch (e) {
      console.error(e);
      setTaskStatus("failed");
      alert("Failed to start translation");
    }
  };

  const pollTask = async (tid: string) => {
    const interval = setInterval(async () => {
      try {
        const statusRes = await translatorService.getTaskStatus(tid);
        setTaskStatus(statusRes.status);

        if (statusRes.progress) setProgress(statusRes.progress);

        if (statusRes.status === "completed") {
          clearInterval(interval);
          if (statusRes.result && statusRes.result.segments) {
            setTargetSegments(statusRes.result.segments);
          }
          if (
            statusRes.result &&
            statusRes.result.srt_path &&
            window.electronAPI
          ) {
            // Auto-open logic (commented out in original)
          }
        } else if (statusRes.status === "failed") {
          clearInterval(interval);
          alert("Translation failed: " + statusRes.error);
        }
      } catch (e) {
        console.error("Polling error:", e);
        clearInterval(interval);
      }
    }, 1000);
  };

  const exportSRT = async () => {
    if (!sourceFilePath || !window.electronAPI) return;

    const LANG_SUFFIX_MAP: Record<string, string> = {
      Chinese: "_CN",
      English: "_EN",
      Japanese: "_JP",
      Spanish: "_ES",
      French: "_FR",
      German: "_DE",
      Russian: "_RU",
    };
    const suffix = LANG_SUFFIX_MAP[targetLang] || "_CN";
    const savePath = sourceFilePath.replace(/(\.[^.]+)$/, `${suffix}.srt`);

    // Build SRT content
    let srtContent = "";
    targetSegments.forEach((seg, index) => {
      const startStr = formatTimestamp(seg.start);
      const endStr = formatTimestamp(seg.end);
      srtContent += `${index + 1}\n${startStr} --> ${endStr}\n${seg.text}\n\n`;
    });

    try {
      await window.electronAPI.saveFile(savePath, srtContent);
      alert(`Saved to ${savePath}`);
    } catch (e) {
      console.error(e);
      alert("Failed to save file");
    }
  };

  // Helper
  const formatTimestamp = (seconds: number) => {
    const date = new Date(0);
    date.setMilliseconds(Math.round(seconds * 1000));
    const iso = date.toISOString();
    // 1970-01-01T00:00:00.000Z -> 00:00:00,000
    return iso.substring(11, 23).replace(".", ",");
  };

  return {
    sourceSegments,
    targetSegments,
    glossary,
    sourceFilePath,
    targetLang,
    mode,
    taskId,
    taskStatus,
    progress,
    isTranslating: isTranslating(),
    setSourceSegments,
    updateTargetSegment,
    setTargetLang,
    setMode,
    handleFileUpload,
    refreshGlossary,
    startTranslation,
    exportSRT,
  };
};
