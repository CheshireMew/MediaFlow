import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore } from "../../stores/editorStore";
import type { MediaReference } from "../../services/ui/mediaReference";
import {
  consumePendingMediaNavigation,
  clearPendingMediaNavigation,
  readPendingMediaNavigation,
} from "../../services/ui/pendingMediaNavigation";
import {
  NavigationService,
  type NavigationPayload,
  resolveNavigationMediaPayload,
} from "../../services/ui/navigation";
import { loadEditorSubtitle } from "./editorFileHelpers";
import { resolveEditorPreviewMediaUrl } from "./editorPreviewSource";
import { useEditorFileLoader } from "./useEditorFileLoader";
import { useEditorSubtitleActions } from "./useEditorSubtitleActions";
import { useEditorDocumentWriters } from "./useEditorDocumentWriters";
import { toast } from "../../utils/toast";

export { isSupportedEditorSubtitlePath } from "./editorFileHelpers";

export function useEditorIO() {
  const { t } = useTranslation("editor");
  const mediaUrl = useEditorStore((state) => state.document.previewUrl);
  const currentFilePath = useEditorStore((state) => state.document.video?.path ?? null);
  const currentSubtitlePath = useEditorStore(
    (state) => state.document.subtitle?.path ?? null,
  );
  const currentSubtitlePathRef = useRef(currentSubtitlePath);
  const {
    replaceEditorDocument,
    setDocumentPreviewUrl,
  } = useEditorDocumentWriters();
  const {
    handleOpenFile,
    handleOpenSubtitle,
    loadMediaAndResources,
    loadSubtitleFromPath,
    findRelatedSubtitle,
    confirmDocumentSwitch,
  } =
    useEditorFileLoader();
  const { saveSubtitleFile } = useEditorSubtitleActions();

  useEffect(() => {
    currentSubtitlePathRef.current = currentSubtitlePath;
  }, [currentSubtitlePath]);

  useEffect(() => {
    const applyEditorPayload = async (payload?: NavigationPayload | null) => {
      const { videoRef, subtitleRef } = resolveNavigationMediaPayload(payload);
      const videoPath = videoRef?.path ?? null;
      const subtitlePath = subtitleRef?.path ?? null;

      if (!videoRef || !videoPath) {
        return false;
      }

      try {
        const shouldPreserveSelection = Boolean(
          subtitlePath && subtitlePath === currentSubtitlePathRef.current,
        );

        const resolvedVideoRef = videoRef;
        const currentDocument = useEditorStore.getState().document;
        const targetSubtitlePath = subtitlePath ?? null;
        const isSameDocument =
          currentDocument.video?.path === videoPath &&
          currentDocument.subtitle?.path === targetSubtitlePath;
        if (!isSameDocument && !(await confirmDocumentSwitch())) {
          return false;
        }

        let loadedSubtitle: {
          regions: Awaited<ReturnType<typeof loadEditorSubtitle>>;
          subtitle: MediaReference;
        } | null = null;

        if (subtitleRef && subtitlePath) {
          try {
            const parsed = await loadEditorSubtitle(subtitlePath);
            if (parsed.length > 0) {
              loadedSubtitle = {
                regions: parsed,
                subtitle: subtitleRef,
              };
            } else {
              toast.error(t("document.invalidSubtitle"));
              return false;
            }
          } catch (e) {
            console.error("[EditorIO] Failed to load pending subtitle", e);
            toast.error(t("document.loadSubtitleError"));
            return false;
          }
        } else {
          loadedSubtitle = await findRelatedSubtitle(videoPath);
        }
        const previewUrl = await resolveEditorPreviewMediaUrl(resolvedVideoRef);
        replaceEditorDocument(
          {
            video: resolvedVideoRef,
            subtitle: loadedSubtitle?.subtitle ?? null,
            previewUrl,
            regions: loadedSubtitle?.regions ?? [],
          },
          { preserveSelection: shouldPreserveSelection },
        );
        return true;
      } catch (e) {
        console.error("Failed to apply navigation payload for editor", e);
        return false;
      }
    };

    const restoreSession = async () => {
      const pendingFile = readPendingMediaNavigation();
      if (pendingFile) {
        const isValidTarget =
          !pendingFile.target || pendingFile.target === "editor";
        if (isValidTarget) {
          await applyEditorPayload(pendingFile);
          clearPendingMediaNavigation();
          return;
        }
      }

      if (currentFilePath) {
        const document = useEditorStore.getState().document;
        if (document.video) {
          setDocumentPreviewUrl(await resolveEditorPreviewMediaUrl(document.video));
        }
      }
    };
    void restoreSession();

    const cleanup = NavigationService.subscribe((detail) => {
      if (detail.destination === "editor") {
        void applyEditorPayload(detail.payload).then((applied) => {
          if (applied) {
            consumePendingMediaNavigation(detail.payload);
          }
        });
      }
    });
    return cleanup;
  }, [
    currentFilePath,
    confirmDocumentSwitch,
    findRelatedSubtitle,
    replaceEditorDocument,
    setDocumentPreviewUrl,
    t,
  ]);

  return {
    mediaUrl,
    currentFilePath,
    openFile: handleOpenFile,
    openSubtitle: handleOpenSubtitle,
    loadVideo: loadMediaAndResources,
    loadSubtitleFromPath,
    saveSubtitleFile,
  };
}
