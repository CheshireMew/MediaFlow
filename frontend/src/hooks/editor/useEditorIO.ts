import { useCallback, useEffect } from "react";
import { parseSRT } from "../../utils/subtitleParser";
import type { SubtitleSegment } from "../../types/task";
import { apiClient } from "../../api/client";
import { useEditorStore } from "../../stores/editorStore";

/** Convert a local file path to a file:// URL, encoding all special characters including # */
function pathToFileURL(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  // encodeURI does not encode #, but # is the fragment delimiter in URLs
  return `file:///${encodeURI(normalized).replace(/#/g, "%23")}`;
}

export function useEditorIO(setPeaks: (peaks: any) => void) {
  // Access Store
  const mediaUrl = useEditorStore((state) => state.mediaUrl);
  const currentFilePath = useEditorStore((state) => state.currentFilePath);
  const currentSubtitlePath = useEditorStore(
    (state) => state.currentSubtitlePath,
  );
  const setRegions = useEditorStore((state) => state.setRegions);
  const setMediaUrl = useEditorStore((state) => state.setMediaUrl);
  const setCurrentFilePath = useEditorStore(
    (state) => state.setCurrentFilePath,
  );
  const setCurrentSubtitlePath = useEditorStore(
    (state) => state.setCurrentSubtitlePath,
  );

  // --- Private Helpers ---

  const tryLoadRelatedSubtitle = async (videoPath: string) => {
    const priorities = ["_CN", "_EN", "_JP", "_ES", "_FR", "_DE", "_RU", ""]; // "" = base .srt
    const basePath = videoPath.replace(/\.[^.]+$/, "");

    for (const suffix of priorities) {
      const srtPath = `${basePath}${suffix}.srt`;
      try {
        if (window.electronAPI?.readFile) {
          const content = await window.electronAPI.readFile(srtPath);
          if (content) {
            const parsed = parseSRT(content);
            if (parsed.length > 0) {
              setRegions(parsed);
              setCurrentSubtitlePath(srtPath); // Track loaded path
              return;
            }
          }
        }
      } catch (e) {
        // Ignore missing files
      }
    }
  };

  const tryLoadPeaks = async (videoPath: string) => {
    // New Logic: Fetch from Backend API (which handles caching & hashing)
    try {
      const buffer = await apiClient.getPeaks(videoPath);
      if (buffer && buffer.byteLength > 0) {
        setPeaks([new Float32Array(buffer)]);
      }
    } catch (e) {
      console.warn("[EditorIO] Failed to load peaks via API:", e);
      setPeaks(null);
    }
  };

  const tryLoadRelatedVideo = async (
    subtitlePath: string,
  ): Promise<string | null> => {
    const VIDEO_EXTS = [".mp4", ".mkv", ".avi", ".mov", ".webm"];
    const LANG_SUFFIXES = ["_CN", "_EN", "_JP", "_ES", "_FR", "_DE", "_RU"];

    let basePath = subtitlePath.replace(/\.[^.]+$/, ""); // Remove .srt

    // Strip language suffix (e.g., video_CN → video)
    for (const suffix of LANG_SUFFIXES) {
      if (basePath.endsWith(suffix)) {
        basePath = basePath.slice(0, -suffix.length);
        break;
      }
    }

    // Try each video extension
    for (const ext of VIDEO_EXTS) {
      try {
        const size = await window.electronAPI?.getFileSize(basePath + ext);
        if (size && size > 0) return basePath + ext;
      } catch {}
    }
    return null;
  };

  const loadMediaAndResources = useCallback(
    async (path: string) => {
      if (!path || typeof path !== "string") return;

      const url = pathToFileURL(path);

      setPeaks(null);
      setCurrentFilePath(path); // Update Store
      setCurrentSubtitlePath(null); // Reset subtitle path on new video
      setMediaUrl(url); // Update Store

      await tryLoadPeaks(path);
      await tryLoadRelatedSubtitle(path);
    },
    [
      setRegions,
      setPeaks,
      setCurrentFilePath,
      setMediaUrl,
      setCurrentSubtitlePath,
    ],
  );

  const loadSubtitleFromPath = useCallback(
    async (path: string) => {
      // 1. Reverse lookup: find associated video
      const videoPath = await tryLoadRelatedVideo(path);
      if (videoPath) {
        // Found matching video → switch to it
        const normalizedPath = videoPath.replace(/\\/g, "/");
        setMediaUrl(pathToFileURL(videoPath));
        setCurrentFilePath(videoPath);
        setPeaks(null);
        await tryLoadPeaks(videoPath);
      }
      // else: preserve current video (don't clear)

      // 2. Load subtitle content
      if (window.electronAPI?.readFile) {
        try {
          const content = await window.electronAPI.readFile(path);
          if (content) {
            const parsed = parseSRT(content);
            setRegions(parsed);
            setCurrentSubtitlePath(path); // Track loaded path
          }
        } catch (e) {
          console.error("[EditorIO] Failed to load subtitle:", e);
          alert("Failed to load subtitle file.");
        }
      }
    },
    [
      setRegions,
      setMediaUrl,
      setCurrentFilePath,
      setPeaks,
      setCurrentSubtitlePath,
    ],
  );

  // --- Actions ---

  const handleOpenFile = useCallback(async () => {
    if (window.electronAPI?.openFile) {
      try {
        const result = await window.electronAPI.openFile();
        const fileObj = result as any;
        const path = fileObj?.path || fileObj;

        if (path) {
          await loadMediaAndResources(path);
        }
      } catch (error) {
        console.error("Failed to open file:", error);
      }
    } else {
      // Browser Fallback (limited)
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "video/*,audio/*";
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          setMediaUrl(URL.createObjectURL(file));
          setPeaks(null);
        }
      };
      input.click();
    }
  }, [loadMediaAndResources, setPeaks, setMediaUrl]);

  const handlePeaksExport = useCallback(async (_generatedPeaks: any) => {
    // Logic removed: We no longer save peaks from client side to avoid polluting workspace.
    // Peaks should be generated by backend API if missing.
    // If client generates them for playback, great, but we don't persist them here.
    console.debug("[EditorIO] Client generated transient peaks.");
  }, []);

  // --- Restoration Effect ---

  useEffect(() => {
    const restoreSession = async () => {
      // 1. Check for pending navigation file (from Translator/TaskMonitor)
      const pendingFile = sessionStorage.getItem("mediaflow:pending_file");
      if (pendingFile) {
        try {
          const data = JSON.parse(pendingFile);
          const isValidTarget = !data.target || data.target === "editor";

          if (isValidTarget && data.video_path) {
            // Load it
            const normalizedPath = data.video_path.replace(/\\/g, "/");
            setMediaUrl(pathToFileURL(data.video_path));
            setCurrentFilePath(data.video_path);

            // Load peaks
            await tryLoadPeaks(data.video_path);

            // Load specific subtitle if provided, otherwise try auto-load
            if (data.subtitle_path) {
              try {
                if (window.electronAPI?.readFile) {
                  const content = await window.electronAPI.readFile(
                    data.subtitle_path,
                  );
                  if (content) {
                    const parsed = parseSRT(content);
                    setRegions(parsed);
                    setCurrentSubtitlePath(data.subtitle_path); // Track path
                  }
                }
              } catch (e) {
                console.error("[EditorIO] Failed to load pending subtitle", e);
              }
            } else {
              await tryLoadRelatedSubtitle(data.video_path);
            }

            sessionStorage.removeItem("mediaflow:pending_file");
            return;
          }
        } catch (e) {
          console.error("Failed to parse pending file for editor", e);
        }
      }

      // 2. Fallback to Store Persistence has already happened via Zustand!
      // But we might need to load peaks for the persisted media path?
      // Zustand rehydrates synchronously or asynchronously?
      // Usually async. We need to watch for hydration?
      // For now, let's assume if currentFilePath exists in store, we load peaks.

      // Wait, we can just trigger loadPeaks if currentFilePath is present on mount?
      // But we don't want to re-load if we just navigated away and back?
      // Actually, peaks might need to be re-fetched into the `peaks` state (which is still local to EditorPage/useEditorIO).

      if (currentFilePath) {
        await tryLoadPeaks(currentFilePath);
      }
    };
    restoreSession();
  }, []); // Run once

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

  // --- Persistence Actions ---

  const saveSubtitleFile = useCallback(
    async (regionsToSave: SubtitleSegment[], saveAs: boolean = false) => {
      const path = currentFilePath;
      if (!path) {
        alert("No file path found to save to.");
        return false;
      }

      console.log("[EditorIO] Saving subtitles...", {
        regionsCount: regionsToSave.length,
        saveAs,
        currentSubtitlePath,
        currentFilePath,
      });

      // Determine default path
      let targetPath = currentSubtitlePath || path.replace(/\.[^.]+$/, ".srt");

      // SAVE AS Logic
      if (saveAs || !currentSubtitlePath) {
        if (window.electronAPI?.showSaveDialog) {
          const result = await window.electronAPI.showSaveDialog({
            defaultPath: targetPath,
            filters: [{ name: "Subtitle Files", extensions: ["srt"] }],
          });

          if (result) {
            targetPath = result;
            // Update the current subtitle path to the new one
            setCurrentSubtitlePath(targetPath);
          } else {
            // User cancelled
            return false;
          }
        }
      }

      // Generate SRT content
      const srtContent = regionsToSave
        .map((s) => {
          const fmt = (t: number) => {
            const date = new Date(0);
            date.setMilliseconds(t * 1000);
            return date.toISOString().substr(11, 12).replace(".", ",");
          };
          return `${s.id}\n${fmt(s.start)} --> ${fmt(s.end)}\n${s.text || ""}\n`;
        })
        .join("\n");

      if (window.electronAPI?.writeFile) {
        try {
          console.log("[EditorIO] Writing file to:", targetPath);
          await window.electronAPI.writeFile(targetPath, srtContent);
          // Update store if we didn't have a path before
          if (!currentSubtitlePath) {
            setCurrentSubtitlePath(targetPath);
          }
          return targetPath; // Return the path on success
        } catch (e) {
          console.error("[EditorIO] Failed to save subtitle file", e);
          throw e;
        }
      } else {
        console.warn("Saving not supported in browser mode (yet)");
        return false;
      }
    },
    [currentFilePath, currentSubtitlePath, setCurrentSubtitlePath],
  );

  // Expose Actions
  return {
    mediaUrl,
    currentFilePath,
    isReady: true, // Always ready as store is source of truth? Or wait for hydration?
    openFile: handleOpenFile,
    loadVideo: loadMediaAndResources, // Exposed for Drag-and-Drop
    loadSubtitleFromPath, // Exposed for Drag-and-Drop
    savePeaks: handlePeaksExport,
    saveSubtitleFile,
    detectSilence,
  };
}
