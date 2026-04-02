import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SubtitleSegment } from "../../types/task";
import {
  createMediaReference,
  type MediaReference,
  resolveMediaReferencePath,
} from "../../services/ui/mediaReference";
import {
  createNavigationMediaPayload,
  NavigationService,
  type NavigationPayload,
} from "../../services/ui/navigation";
import { settingsService } from "../../services/domain";
import { smartSplitSubtitleSegments } from "../../utils/subtitleSmartSplit";
import { toast } from "../../utils/toast";

// ─── Types ──────────────────────────────────────────────────────
interface UseEditorActionsArgs {
  currentFilePath: string | null;
  currentSubtitlePath: string | null;
  currentFileRef: MediaReference | null;
  currentSubtitleRef: MediaReference | null;
  regions: SubtitleSegment[];
  saveSubtitleFile: (
    regions: SubtitleSegment[],
    saveAs?: boolean,
  ) => Promise<string | boolean>;
  replaceRegionsWithUndo: (regions: SubtitleSegment[]) => void;
}

interface UseEditorActionsReturn {
  handleSave: () => Promise<void>;
  handleTranslate: () => Promise<void>;
  handleSmartSplit: () => Promise<void>;
  isSmartSplitting: boolean;
}

export function resolveSubtitleReferenceForTranslation(params: {
  currentFilePath: string;
  currentSubtitlePath: string | null;
  currentSubtitleRef: MediaReference | null;
  savedPath: string | boolean;
}): MediaReference {
  const {
    currentFilePath,
    currentSubtitlePath,
    currentSubtitleRef,
    savedPath,
  } = params;

  if (typeof savedPath === "string" && savedPath) {
    return currentSubtitleRef?.path === savedPath
      ? currentSubtitleRef
      : createMediaReference({ path: savedPath });
  }

  if (currentSubtitleRef?.path) {
    return currentSubtitleRef;
  }

  const subtitlePath =
    resolveMediaReferencePath(null, currentSubtitlePath) ??
    currentFilePath.replace(/\.[^.]+$/, ".srt");
  return createMediaReference({ path: subtitlePath });
}

export function resolveSubtitlePathForTranslation(
  currentFilePath: string,
  currentSubtitlePath: string | null,
  currentSubtitleRef: MediaReference | null,
  savedPath: string | boolean,
): string {
  return resolveSubtitleReferenceForTranslation({
    currentFilePath,
    currentSubtitlePath,
    currentSubtitleRef,
    savedPath,
  }).path;
}

export function resolveTranslationNavigationPayload(params: {
  currentFilePath: string;
  currentSubtitlePath: string | null;
  currentFileRef: MediaReference | null;
  currentSubtitleRef: MediaReference | null;
  savedPath: string | boolean;
}): NavigationPayload {
  const {
    currentFilePath,
    currentSubtitlePath,
    currentFileRef,
    currentSubtitleRef,
    savedPath,
  } = params;
  const subtitleRef = resolveSubtitleReferenceForTranslation({
    currentFilePath,
    currentSubtitlePath,
    currentSubtitleRef,
    savedPath,
  });

  return createNavigationMediaPayload({
    videoPath: currentFilePath,
    subtitlePath: subtitleRef.path,
    videoRef: currentFileRef,
    subtitleRef,
  });
}

// ─── Hook ───────────────────────────────────────────────────────
export function useEditorActions({
  currentFilePath,
  currentSubtitlePath,
  currentFileRef,
  currentSubtitleRef,
  regions,
  saveSubtitleFile,
  replaceRegionsWithUndo,
}: UseEditorActionsArgs): UseEditorActionsReturn {
  const { t } = useTranslation("editor");
  const [isSmartSplitting, setIsSmartSplitting] = useState(false);

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

    NavigationService.navigate(
      "translator",
      resolveTranslationNavigationPayload({
        currentFilePath,
        currentSubtitlePath,
        currentFileRef,
        currentSubtitleRef,
        savedPath,
      }),
    );
  }, [
    currentFilePath,
    currentSubtitlePath,
    currentFileRef,
    currentSubtitleRef,
    regions,
    saveSubtitleFile,
  ]);

  const handleSmartSplit = useCallback(async () => {
    if (regions.length === 0 || isSmartSplitting) {
      return;
    }

    setIsSmartSplitting(true);
    try {
      const textLimit = await settingsService.getSmartSplitTextLimit();
      const { segments, splitCount } = smartSplitSubtitleSegments(regions, {
        textLimit,
      });

      if (splitCount === 0) {
        toast.info(t("subtitleList.smartSplitNoChanges"));
        return;
      }

      replaceRegionsWithUndo(segments);
      toast.success(t("subtitleList.smartSplitSuccess", { count: splitCount }));
    } catch (error) {
      console.error("[EditorActions] Smart split failed", error);
      toast.error(t("subtitleList.smartSplitError"));
    } finally {
      setIsSmartSplitting(false);
    }
  }, [isSmartSplitting, regions, replaceRegionsWithUndo, t]);

  return { handleSave, handleTranslate, handleSmartSplit, isSmartSplitting };
}
