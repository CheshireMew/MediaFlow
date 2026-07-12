import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SubtitleSegment } from "../../types/task";
import {
  mediaReferenceFromPath,
  type MediaReference,
} from "../../services/ui/mediaReference";
import {
  createNavigationMediaPayload,
  NavigationService,
} from "../../services/ui/navigation";
import { settingsService } from "../../services/domain";
import { smartSplitSubtitleSegments } from "../../utils/subtitleSmartSplit";
import { toast } from "../../utils/toast";

// ─── Types ──────────────────────────────────────────────────────
interface UseEditorActionsArgs {
  video: MediaReference | null;
  subtitle: MediaReference | null;
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

export function resolveSubtitleReferenceForSavedPath(params: {
  video: MediaReference;
  subtitle: MediaReference | null;
  savedPath: string | boolean;
}): MediaReference {
  const { video, subtitle, savedPath } = params;

  if (typeof savedPath === "string" && savedPath) {
    return subtitle?.path === savedPath
      ? subtitle
      : mediaReferenceFromPath(savedPath)!;
  }

  if (subtitle?.path) {
    return subtitle;
  }

  const subtitlePath = video.path.replace(/\.[^.]+$/, ".srt");
  return mediaReferenceFromPath(subtitlePath)!;
}

// ─── Hook ───────────────────────────────────────────────────────
export function useEditorActions({
  video,
  subtitle,
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
        toast.success(t("document.saveSuccess", { path: savedPath }));
      }
    } catch (e) {
      console.error("[EditorActions] Save failed", e);
      toast.error(t("document.saveError"));
    }
  }, [saveSubtitleFile, regions, t]);

  const handleTranslate = useCallback(async () => {
    if (!video) return;

    let savedPath: string | boolean = false;

    // 1. Force Save FIRST
    try {
      savedPath = await saveSubtitleFile(regions);
      if (!savedPath) return;
    } catch (e) {
      console.error("Failed to save before translate", e);
      toast.error(t("document.saveBeforeTranslateError"));
      return;
    }

    const subtitleRef = resolveSubtitleReferenceForSavedPath({
      video,
      subtitle,
      savedPath,
    });

    NavigationService.navigate(
      "translator",
      createNavigationMediaPayload({
        videoRef: video,
        subtitleRef,
      }),
    );
  }, [
    regions,
    saveSubtitleFile,
    subtitle,
    t,
    video,
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
