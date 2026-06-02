import { useEffect, useRef } from "react";
import { useEditorStore } from "../../stores/editorStore";
import {
  normalizeMediaReference,
} from "../../services/ui/mediaReference";
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

export { isSupportedEditorSubtitlePath } from "./editorFileHelpers";

export function useEditorIO() {
  const mediaUrl = useEditorStore((state) => state.mediaUrl);
  const currentFilePath = useEditorStore((state) => state.currentFilePath);
  const currentSubtitlePath = useEditorStore((state) => state.currentSubtitlePath);
  const currentSubtitlePathRef = useRef(currentSubtitlePath);
  const {
    replaceEditorDocument,
    setMediaUrl,
    setCurrentFilePath,
    setCurrentSubtitlePath,
    setCurrentFileRef,
    setCurrentSubtitleRef,
  } = useEditorDocumentWriters();
  const {
    handleOpenFile,
    handleOpenSubtitle,
    loadMediaAndResources,
    loadSubtitleFromPath,
    tryLoadRelatedSubtitle,
  } =
    useEditorFileLoader();
  const { saveSubtitleFile } = useEditorSubtitleActions();

  useEffect(() => {
    currentSubtitlePathRef.current = currentSubtitlePath;
  }, [currentSubtitlePath]);

  useEffect(() => {
    const applyEditorPayload = async (payload?: NavigationPayload | null) => {
      const { videoPath, subtitlePath, videoRef, subtitleRef } = resolveNavigationMediaPayload(payload);

      if (!videoPath) {
        return false;
      }

      try {
        const shouldPreserveSelection = Boolean(
          subtitlePath && subtitlePath === currentSubtitlePathRef.current,
        );

        setCurrentFilePath(videoPath);
        const resolvedVideoRef = videoRef ?? normalizeMediaReference(videoPath);
        setCurrentFileRef(resolvedVideoRef);
        setCurrentSubtitlePath(null);
        setCurrentSubtitleRef(null);
        setMediaUrl(await resolveEditorPreviewMediaUrl(videoPath, resolvedVideoRef));

        if (subtitlePath) {
          try {
            const parsed = await loadEditorSubtitle(subtitlePath);
            if (parsed.length > 0) {
              replaceEditorDocument(parsed, {
                preserveSelection: shouldPreserveSelection,
              });
              setCurrentSubtitlePath(subtitlePath);
              setCurrentSubtitleRef(
                subtitleRef ??
                  normalizeMediaReference(subtitlePath),
              );
            }
          } catch (e) {
            console.error("[EditorIO] Failed to load pending subtitle", e);
          }
        } else {
          await tryLoadRelatedSubtitle(videoPath);
        }
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
        setMediaUrl(await resolveEditorPreviewMediaUrl(currentFilePath));
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
    replaceEditorDocument,
    setCurrentFilePath,
    setCurrentFileRef,
    setCurrentSubtitlePath,
    setCurrentSubtitleRef,
    setMediaUrl,
    tryLoadRelatedSubtitle,
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
