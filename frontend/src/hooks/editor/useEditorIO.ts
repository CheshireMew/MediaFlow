import { useCallback, useEffect, useRef } from "react";
import { useTaskContext } from "../../context/taskContext";
import { findCompletedTranscribeTask } from "../tasks/taskSelectors";
import { editorService } from "../../services/domain";
import { useEditorStore } from "../../stores/editorStore";
import {
  createMediaReference,
  type MediaReference,
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

type WaveformPeaks = Array<Float32Array | number[]> | null;

export function useEditorIO(setPeaks: (peaks: WaveformPeaks) => void) {
  const mediaUrl = useEditorStore((state) => state.mediaUrl);
  const currentFilePath = useEditorStore((state) => state.currentFilePath);
  const currentFileRef = useEditorStore((state) => state.currentFileRef);
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
  const { tasks } = useTaskContext();
  const refreshedPeaksTaskIdRef = useRef<string | null>(null);

  const fetchPeaks = useCallback(async (params: {
    videoPath: string;
    videoRef?: MediaReference | null;
  }) => {
    try {
      const buffer = await editorService.getPeaks({
        video_path: params.videoPath,
        video_ref: params.videoRef ?? null,
      });
      if (buffer && buffer.byteLength > 0) {
        return [new Float32Array(buffer)] as WaveformPeaks;
      }
    } catch (e) {
      console.warn("[EditorIO] Failed to load peaks via API:", e);
    }
    return null;
  }, []);

  const tryLoadPeaks = useCallback(async (videoPath: string, videoRef?: MediaReference | null) => {
    const peaks = await fetchPeaks({ videoPath, videoRef });
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
        await tryLoadPeaks(videoPath, videoRef);
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
        await tryLoadPeaks(currentFilePath, null);
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
    currentFileRef,
    currentFilePath,
    replaceEditorDocument,
    setCurrentFilePath,
    setCurrentFileRef,
    setCurrentSubtitlePath,
    setCurrentSubtitleRef,
    setMediaUrl,
    tryLoadPeaks,
    tryLoadRelatedSubtitle,
  ]);

  useEffect(() => {
    const completedTranscribeTask = findCompletedTranscribeTask(
      tasks,
      currentFileRef,
      currentFilePath,
    );
    if (!completedTranscribeTask) {
      return;
    }
    if (!currentFilePath) {
      return;
    }
    if (refreshedPeaksTaskIdRef.current === completedTranscribeTask.id) {
      return;
    }

    refreshedPeaksTaskIdRef.current = completedTranscribeTask.id;
    void tryLoadPeaks(currentFilePath, currentFileRef);
  }, [currentFilePath, currentFileRef, tasks, tryLoadPeaks]);

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
    loadVideo: loadMediaAndResources,
    loadSubtitleFromPath,
    saveSubtitleFile,
    detectSilence,
  };
}
