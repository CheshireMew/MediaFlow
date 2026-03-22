import { useCallback } from "react";
import { isDesktopRuntime } from "../../services/domain";
import { useEditorStore } from "../../stores/editorStore";
import { fileService } from "../../services/fileService";
import { createMediaReference } from "../../services/ui/mediaReference";
import {
  buildRelatedSubtitleCandidates,
  findRelatedVideoForSubtitle,
  isSupportedEditorSubtitlePath,
  loadEditorSubtitle,
  pathToFileURL,
} from "./editorFileHelpers";

type WaveformPeaks = Array<Float32Array | number[]> | null;

type ElectronMediaFile = {
  path: string;
  name: string;
  size: number;
};

type UseEditorFileLoaderArgs = {
  setPeaks: (peaks: WaveformPeaks) => void;
  tryLoadPeaks: (videoPath: string) => Promise<WaveformPeaks>;
};

export function useEditorFileLoader({
  setPeaks,
  tryLoadPeaks,
}: UseEditorFileLoaderArgs) {
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

  const tryLoadRelatedSubtitle = useCallback(
    async (videoPath: string) => {
      for (const subtitlePath of buildRelatedSubtitleCandidates(videoPath)) {
        try {
          const parsed = await loadEditorSubtitle(subtitlePath);
          if (parsed.length > 0) {
            replaceEditorDocument(parsed);
            setCurrentSubtitlePath(subtitlePath);
            setCurrentSubtitleRef(createMediaReference({ path: subtitlePath }));
            return;
          }
        } catch {
          // Ignore missing files.
        }
      }
    },
    [replaceEditorDocument, setCurrentSubtitlePath, setCurrentSubtitleRef],
  );

  const loadMediaAndResources = useCallback(
    async (path: string) => {
      if (!path || typeof path !== "string") {
        return;
      }

      setPeaks(null);
      replaceEditorDocument([]);
      setCurrentFilePath(path);
      setCurrentSubtitlePath(null);
      setCurrentFileRef(createMediaReference({ path }));
      setCurrentSubtitleRef(null);
      await tryLoadPeaks(path);
      setMediaUrl(pathToFileURL(path));
      await tryLoadRelatedSubtitle(path);
    },
    [
      replaceEditorDocument,
      setCurrentFilePath,
      setCurrentFileRef,
      setCurrentSubtitlePath,
      setCurrentSubtitleRef,
      setMediaUrl,
      setPeaks,
      tryLoadPeaks,
      tryLoadRelatedSubtitle,
    ],
  );

  const loadSubtitleFromPath = useCallback(
    async (path: string) => {
      if (!isSupportedEditorSubtitlePath(path)) {
        alert("Only SRT subtitle files are supported in the editor.");
        return;
      }

      const videoPath = await findRelatedVideoForSubtitle(path);
      if (videoPath) {
        setPeaks(null);
        await tryLoadPeaks(videoPath);
        setCurrentFilePath(videoPath);
        setCurrentFileRef(createMediaReference({ path: videoPath }));
        setMediaUrl(pathToFileURL(videoPath));
      }

      try {
        const parsed = await loadEditorSubtitle(path);
        if (parsed.length === 0) {
          alert("Failed to parse subtitle file. Please provide a valid SRT file.");
          return;
        }
        replaceEditorDocument(parsed);
        setCurrentSubtitlePath(path);
        setCurrentSubtitleRef(createMediaReference({ path }));
      } catch (error) {
        console.error("[EditorIO] Failed to load subtitle:", error);
        alert("Failed to load subtitle file.");
      }
    },
    [
      replaceEditorDocument,
      setCurrentFileRef,
      setCurrentFilePath,
      setCurrentSubtitleRef,
      setCurrentSubtitlePath,
      setMediaUrl,
      setPeaks,
      tryLoadPeaks,
    ],
  );

  const handleOpenFile = useCallback(async () => {
    if (isDesktopRuntime()) {
      try {
        const result = await fileService.openFile();
        const path = (result as ElectronMediaFile | null)?.path;

        if (path) {
          await loadMediaAndResources(path);
        }
      } catch (error) {
        console.error("Failed to open file:", error);
      }
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*,audio/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        setMediaUrl(URL.createObjectURL(file));
        setPeaks(null);
        setCurrentFileRef(null);
        setCurrentSubtitleRef(null);
      }
    };
    input.click();
  }, [loadMediaAndResources, setCurrentFileRef, setCurrentSubtitleRef, setMediaUrl, setPeaks]);

  return {
    handleOpenFile,
    loadMediaAndResources,
    loadSubtitleFromPath,
    tryLoadRelatedSubtitle,
  };
}
