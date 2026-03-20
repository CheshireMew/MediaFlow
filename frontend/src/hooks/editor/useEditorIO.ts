import { useCallback, useEffect } from "react";
import { apiClient } from "../../api/client";
import { useEditorStore } from "../../stores/editorStore";
import {
  consumePendingMediaNavigation,
  clearPendingMediaNavigation,
  readPendingMediaNavigation,
} from "../../services/ui/pendingMediaNavigation";
import {
  NavigationService,
  type NavigationPayload,
} from "../../services/ui/navigation";
import {
  isSupportedEditorSubtitlePath,
  loadEditorSubtitle,
  pathToFileURL,
} from "./editorFileHelpers";
import { useEditorFileLoader } from "./useEditorFileLoader";
import { useEditorSubtitleActions } from "./useEditorSubtitleActions";

export { isSupportedEditorSubtitlePath } from "./editorFileHelpers";

type WaveformPeaks = Array<Float32Array | number[]> | null;

export function useEditorIO(setPeaks: (peaks: WaveformPeaks) => void) {
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

  const fetchPeaks = useCallback(async (videoPath: string) => {
    try {
      const buffer = await apiClient.getPeaks(videoPath);
      if (buffer && buffer.byteLength > 0) {
        return [new Float32Array(buffer)] as WaveformPeaks;
      }
    } catch (e) {
      console.warn("[EditorIO] Failed to load peaks via API:", e);
    }
    return null;
  }, []);

  const tryLoadPeaks = useCallback(async (videoPath: string) => {
    const peaks = await fetchPeaks(videoPath);
    setPeaks(peaks);
    return peaks;
  }, [fetchPeaks, setPeaks]);

  const {
    handleOpenFile,
    loadMediaAndResources,
    loadSubtitleFromPath,
    tryLoadRelatedSubtitle,
  } = useEditorFileLoader({
    setPeaks,
    tryLoadPeaks,
  });
  const { saveSubtitleFile } = useEditorSubtitleActions();

  useEffect(() => {
    const applyEditorPayload = async (payload?: NavigationPayload | null) => {
      if (!payload?.video_path) {
        return false;
      }

      try {
        setCurrentFilePath(payload.video_path);
        await tryLoadPeaks(payload.video_path);
        setMediaUrl(pathToFileURL(payload.video_path));

        if (payload.subtitle_path) {
          try {
            const parsed = await loadEditorSubtitle(payload.subtitle_path);
            if (parsed.length > 0) {
              replaceEditorDocument(parsed);
              setCurrentSubtitlePath(payload.subtitle_path);
            }
          } catch (e) {
            console.error("[EditorIO] Failed to load pending subtitle", e);
          }
        } else {
          await tryLoadRelatedSubtitle(payload.video_path);
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
        await tryLoadPeaks(currentFilePath);
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
  }, [currentFilePath, replaceEditorDocument, setCurrentFilePath, setCurrentSubtitlePath, setMediaUrl, tryLoadPeaks, tryLoadRelatedSubtitle]);

  const detectSilence = useCallback(
    async (threshold = "-30dB", minDuration = 0.5) => {
      const path = currentFilePath;
      if (!path) throw new Error("No file loaded");

      try {
        const res = await apiClient.detectSilence({
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
    loadVideo: loadMediaAndResources,
    loadSubtitleFromPath,
    saveSubtitleFile,
    detectSilence,
  };
}
