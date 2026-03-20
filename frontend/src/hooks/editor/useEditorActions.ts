import { useCallback } from "react";
import type { SubtitleSegment } from "../../types/task";
import { NavigationService } from "../../services/ui/navigation";

// ─── Types ──────────────────────────────────────────────────────
interface UseEditorActionsArgs {
  currentFilePath: string | null;
  currentSubtitlePath: string | null;
  regions: SubtitleSegment[];
  saveSubtitleFile: (
    regions: SubtitleSegment[],
    saveAs?: boolean,
  ) => Promise<string | boolean>;
  detectSilence: () => Promise<[number, number][] | null>;
  replaceRegionsWithUndo: (regions: SubtitleSegment[]) => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

interface UseEditorActionsReturn {
  handleSave: () => Promise<void>;
  handleTranslate: () => Promise<void>;
  handleSmartSplit: () => Promise<void>;
}

export function resolveSubtitlePathForTranslation(
  currentFilePath: string,
  currentSubtitlePath: string | null,
  savedPath: string | boolean,
): string {
  if (typeof savedPath === "string" && savedPath) {
    return savedPath;
  }
  if (currentSubtitlePath) {
    return currentSubtitlePath;
  }
  return currentFilePath.replace(/\.[^.]+$/, ".srt");
}

// ─── Hook ───────────────────────────────────────────────────────
export function useEditorActions({
  currentFilePath,
  currentSubtitlePath,
  regions,
  saveSubtitleFile,
  detectSilence,
  replaceRegionsWithUndo,
  videoRef,
}: UseEditorActionsArgs): UseEditorActionsReturn {
  const handleSave = useCallback(async () => {
    try {
      console.log(
        "[EditorActions] handleSave called with regions:",
        regions.length,
      );
      const savedPath = await saveSubtitleFile(regions);
      if (savedPath) {
        alert(`Saved successfully to:\n${savedPath}`);
      }
    } catch (e) {
      console.error("[EditorActions] Save failed", e);
      alert("Failed to save file. See console.");
    }
  }, [saveSubtitleFile, regions]);

  const handleTranslate = useCallback(async () => {
    if (!currentFilePath) return;

    let savedPath: string | boolean = false;

    // 1. Force Save FIRST
    try {
      savedPath = await saveSubtitleFile(regions);
      if (!savedPath) return;
    } catch (e) {
      console.error("Failed to save before translate", e);
      if (!confirm("Failed to save subtitles. Continue with unsaved file?"))
        return;
    }

    const srtPath = resolveSubtitlePathForTranslation(
      currentFilePath,
      currentSubtitlePath,
      savedPath,
    );
    NavigationService.navigate("translator", {
      video_path: currentFilePath,
      subtitle_path: srtPath,
    });
  }, [currentFilePath, currentSubtitlePath, regions, saveSubtitleFile]);

  const handleSmartSplit = useCallback(async () => {
    if (
      !confirm(
        "Start Smart Split (Voice Detection)?\n\nThis will OVERWRITE segments based on detected voice activity (non-silence).",
      )
    )
      return;

    try {
      const silences = await detectSilence();
      const duration = videoRef.current?.duration || 0;

      if (silences && silences.length > 0 && duration > 0) {
        const speechSegments: { start: number; end: number }[] = [];
        let lastEnd = 0;

        silences.forEach(([silStart, silEnd]) => {
          if (silStart > lastEnd + 0.1) {
            speechSegments.push({ start: lastEnd, end: silStart });
          }
          lastEnd = Math.max(lastEnd, silEnd);
        });

        if (lastEnd < duration - 0.1) {
          speechSegments.push({ start: lastEnd, end: duration });
        }

        const newSegments = speechSegments.map((seg, idx) => ({
          id: String(idx + 1),
          start: seg.start,
          end: seg.end,
          text: "",
        }));

        replaceRegionsWithUndo(newSegments);
      } else {
        alert("No silence/speech pattern detected.");
      }
    } catch (e) {
      alert("Failed to run detection. " + e);
    }
  }, [detectSilence, replaceRegionsWithUndo, videoRef]);

  return { handleSave, handleTranslate, handleSmartSplit };
}
