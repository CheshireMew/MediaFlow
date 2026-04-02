import { useCallback, useEffect } from "react";
import { editorService } from "../../services/domain";
import { useEditorStore } from "../../stores/editorStore";
import {
  createMediaReference,
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
import {
  loadEditorSubtitle,
  pathToFileURL,
} from "./editorFileHelpers";
import { useEditorFileLoader } from "./useEditorFileLoader";
import { useEditorSubtitleActions } from "./useEditorSubtitleActions";

export { isSupportedEditorSubtitlePath } from "./editorFileHelpers";

export function useEditorIO() {
  const mediaUrl = useEditorStore((state) => state.mediaUrl);
  const currentFilePath = useEditorStore((state) => state.currentFilePath);
  const replaceEditorDocument = useEditorStore(
    (state) => state.replaceEditorDocument,
  );
  const setMediaUrl = useEditorStore((state) => state.setMediaUrl);
  const setCurrentFilePath = useEditorStore(
    (state) => state.setCurrentFilePath,
  );
  const setCurrentSubtitlePath = useEditorStore(
    (state) => state.setCurrentSubtitlePath,
  );
  const setCurrentFileRef = useEditorStore((state) => state.setCurrentFileRef);
  const setCurrentSubtitleRef = useEditorStore((state) => state.setCurrentSubtitleRef);
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
    const applyEditorPayload = async (payload?: NavigationPayload | null) => {
      const { videoPath, subtitlePath, videoRef, subtitleRef } = resolveNavigationMediaPayload(payload);

      if (!videoPath) {
        return false;
      }

      try {
        setCurrentFilePath(videoPath);
        setCurrentFileRef(
          videoRef ?? createMediaReference({ path: videoPath }),
        );
        setCurrentSubtitlePath(null);
        setCurrentSubtitleRef(null);
        setMediaUrl(pathToFileURL(videoPath));

        if (subtitlePath) {
          try {
            const parsed = await loadEditorSubtitle(subtitlePath);
            if (parsed.length > 0) {
              replaceEditorDocument(parsed);
              setCurrentSubtitlePath(subtitlePath);
              setCurrentSubtitleRef(
                subtitleRef ??
                  createMediaReference({ path: subtitlePath }),
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
        setMediaUrl(pathToFileURL(currentFilePath));
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

  const detectSilence = useCallback(
    async (threshold = "-30dB", minDuration = 0.5) => {
      const path = currentFilePath;
      if (!path) throw new Error("No file loaded");

      try {
        const res = await editorService.detectSilence({
          file_path: path,
          threshold,
          min_duration: minDuration,
        });
        return res.silence_intervals as [number, number][];
      } catch (e) {
        console.error("Silence detection failed", e);
        throw e;
      }
    },
    [currentFilePath],
  );

  return {
    mediaUrl,
    currentFilePath,
    openFile: handleOpenFile,
    openSubtitle: handleOpenSubtitle,
    loadVideo: loadMediaAndResources,
    loadSubtitleFromPath,
    saveSubtitleFile,
    detectSilence,
  };
}
