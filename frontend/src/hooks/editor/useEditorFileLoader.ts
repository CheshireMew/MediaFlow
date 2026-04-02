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

type ElectronMediaFile = {
  path: string;
  name: string;
  size: number;
};

export function useEditorFileLoader() {
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

      replaceEditorDocument([]);
      setCurrentFilePath(path);
      setCurrentSubtitlePath(null);
      setCurrentFileRef(createMediaReference({ path }));
      setCurrentSubtitleRef(null);
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
        setCurrentFileRef(null);
        setCurrentSubtitleRef(null);
      }
    };
    input.click();
  }, [loadMediaAndResources, setCurrentFileRef, setCurrentSubtitleRef, setMediaUrl]);

  const handleOpenSubtitle = useCallback(async () => {
    if (!isDesktopRuntime()) {
      return;
    }

    try {
      const result = await fileService.openSubtitleFile();
      const path = (result as { path?: string } | null)?.path;

      if (path) {
        await loadSubtitleFromPath(path);
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
    tryLoadRelatedSubtitle,
  };
}
