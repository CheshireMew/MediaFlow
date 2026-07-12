import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "../../stores/editorStore";
import { isDesktopRuntime } from "../../services/domain";
import { fileService } from "../../services/fileService";
import {
  mediaReferenceFromPath,
  normalizeMediaReference,
  type MediaReference,
} from "../../services/ui/mediaReference";
import {
  buildHtmlFileAccept,
  fileMatchesOpenDialogProfile,
} from "../../contracts/openFileContract";
import {
  buildRelatedSubtitleCandidates,
  isSupportedEditorSubtitlePath,
  loadEditorSubtitle,
} from "./editorFileHelpers";
import { findRelatedVideoForSubtitle } from "../../services/ui/relatedMedia";
import { resolveEditorPreviewMediaUrl } from "./editorPreviewSource";
import { useEditorDocumentWriters } from "./useEditorDocumentWriters";
import { useConfirmation } from "../../components/ui/confirmationContext";
import { toast } from "../../utils/toast";

export function useEditorFileLoader() {
  const { t } = useTranslation("editor");
  const confirmAction = useConfirmation();
  const fileProfile = "editor-media" as const;
  const {
    replaceEditorDocument,
  } = useEditorDocumentWriters();

  const confirmDocumentSwitch = useCallback(async () => {
    const { document } = useEditorStore.getState();
    if (document.revision === document.savedRevision) {
      return true;
    }
    return await confirmAction({
      title: t("document.discardChangesTitle"),
      message: t("document.discardChangesMessage"),
      confirmLabel: t("document.discardChangesConfirm"),
      cancelLabel: t("document.discardChangesCancel"),
      tone: "danger",
    });
  }, [confirmAction, t]);

  const findRelatedSubtitle = useCallback(
    async (videoPath: string) => {
      for (const subtitlePath of buildRelatedSubtitleCandidates(videoPath)) {
        try {
          const parsed = await loadEditorSubtitle(subtitlePath);
          if (parsed.length > 0) {
            const subtitle = mediaReferenceFromPath(subtitlePath);
            if (!subtitle) {
              continue;
            }
            return {
              regions: parsed,
              subtitle,
            };
          }
        } catch {
          // Ignore missing files.
        }
      }
      return null;
    },
    [],
  );

  const loadMediaAndResources = useCallback(
    async (fileRef: MediaReference) => {
      const path = fileRef.path;
      const currentVideoPath = useEditorStore.getState().document.video?.path;
      if (path !== currentVideoPath && !(await confirmDocumentSwitch())) {
        return false;
      }

      const [previewUrl, relatedSubtitle] = await Promise.all([
        resolveEditorPreviewMediaUrl(fileRef),
        findRelatedSubtitle(path),
      ]);
      replaceEditorDocument({
        video: fileRef,
        subtitle: relatedSubtitle?.subtitle ?? null,
        previewUrl,
        regions: relatedSubtitle?.regions ?? [],
      });
      return true;
    },
    [
      confirmDocumentSwitch,
      findRelatedSubtitle,
      replaceEditorDocument,
    ],
  );

  const loadSubtitleFromPath = useCallback(
    async (subtitleRef: MediaReference) => {
      const path = subtitleRef.path;
      if (!isSupportedEditorSubtitlePath(path)) {
        toast.warning(t("document.unsupportedSubtitle"));
        return false;
      }
      const currentSubtitlePath = useEditorStore.getState().document.subtitle?.path;
      if (path !== currentSubtitlePath && !(await confirmDocumentSwitch())) {
        return false;
      }

      const videoPath = await findRelatedVideoForSubtitle(path);

      try {
        const parsed = await loadEditorSubtitle(path);
        if (parsed.length === 0) {
          toast.error(t("document.invalidSubtitle"));
          return false;
        }
        const currentDocument = useEditorStore.getState().document;
        const video = videoPath
          ? mediaReferenceFromPath(videoPath)
          : currentDocument.video;
        if (videoPath && !video) {
          return false;
        }
        const previewUrl = videoPath
          ? await resolveEditorPreviewMediaUrl(video!)
          : currentDocument.previewUrl;
        replaceEditorDocument({
          video,
          subtitle: subtitleRef,
          previewUrl,
          regions: parsed,
        }, {
          preserveSelection: path === currentSubtitlePath,
        });
        return true;
      } catch (error) {
        console.error("[EditorIO] Failed to load subtitle:", error);
        toast.error(t("document.loadSubtitleError"));
        return false;
      }
    },
    [
      confirmDocumentSwitch,
      replaceEditorDocument,
      t,
    ],
  );

  const handleOpenFile = useCallback(async () => {
    if (isDesktopRuntime()) {
      try {
        const result = await fileService.openFile({
          profile: fileProfile,
        });
        const fileRef = normalizeMediaReference(result);

        if (fileRef) {
          await loadMediaAndResources(fileRef);
        }
      } catch (error) {
        console.error("Failed to open file:", error);
      }
      return;
    }

      const input = document.createElement("input");
    input.type = "file";
    input.accept = buildHtmlFileAccept(fileProfile);
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file && fileMatchesOpenDialogProfile(file, fileProfile)) {
        if (!(await confirmDocumentSwitch())) {
          return;
        }
        replaceEditorDocument({
          video: null,
          subtitle: null,
          previewUrl: URL.createObjectURL(file),
          regions: [],
        });
      }
    };
    input.click();
  }, [confirmDocumentSwitch, fileProfile, loadMediaAndResources, replaceEditorDocument]);

  const handleOpenSubtitle = useCallback(async () => {
    if (!isDesktopRuntime()) {
      return;
    }

    try {
      const result = await fileService.openFile({ profile: "subtitle" });
      const subtitleRef = normalizeMediaReference(result);

      if (subtitleRef) {
        await loadSubtitleFromPath(subtitleRef);
      }
    } catch (error) {
      console.error("Failed to open subtitle file:", error);
    }
  }, [loadSubtitleFromPath]);

  return {
    handleOpenFile,
    handleOpenSubtitle,
    loadMediaAndResources,
    loadSubtitleFromPath,
    findRelatedSubtitle,
    confirmDocumentSwitch,
  };
}
