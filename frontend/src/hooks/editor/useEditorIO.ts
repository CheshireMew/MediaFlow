import { useCallback, useEffect } from "react";
import { parseSRT } from "../../utils/subtitleParser";
import type { SubtitleSegment } from "../../types/task";
import { apiClient } from "../../api/client";
import { useEditorStore } from "../../stores/editorStore";

const STORAGE_KEY_LAST_MEDIA = "editor_last_media_path";

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
    // Progressive Loading Strategy:
    // 1. Try low-res binary (instant render, tiny file)
    // 2. Async upgrade to high-res binary
    // 3. Fallback to legacy JSON format

    const readBinary = async (path: string): Promise<Float32Array | null> => {
      try {
        if (window.electronAPI?.readBinaryFile) {
          const buffer = await window.electronAPI.readBinaryFile(path);
          if (buffer && buffer.byteLength > 0) {
            return new Float32Array(buffer);
          }
        }
      } catch (e) {
        // File not found or read error
      }
      return null;
    };

    // Step 1: Try low-res peaks (smallest file, fastest load)
    const lowBinPath = videoPath + ".peaks.low.bin";
    const lowPeaks = await readBinary(lowBinPath);
    if (lowPeaks) {
      setPeaks([lowPeaks]); // Render immediately with low-res

      // Step 2: Async upgrade to high-res (non-blocking)
      const hiBinPath = videoPath + ".peaks.bin";
      readBinary(hiBinPath).then((hiPeaks) => {
        if (hiPeaks) {
          setPeaks([hiPeaks]); // Seamless upgrade
        }
      });
      return;
    }

    // Step 2 (fallback): Try high-res binary directly
    const hiBinPath = videoPath + ".peaks.bin";
    const hiPeaks = await readBinary(hiBinPath);
    if (hiPeaks) {
      setPeaks([hiPeaks]);
      return;
    }

    // Step 3: Legacy JSON format (backward compatible)
    const jsonPath = videoPath + ".peaks.json";
    try {
      if (window.electronAPI?.readFile) {
        const content = await window.electronAPI.readFile(jsonPath);
        if (content) {
          const data = JSON.parse(content);
          if (Array.isArray(data) || Array.isArray(data[0])) {
            setPeaks(data);
          }
        }
      }
    } catch (e) {}
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

      const normalizedPath = path.replace(/\\/g, "/");
      const url = `file:///${encodeURI(normalizedPath)}`;

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
        setMediaUrl(`file:///${encodeURI(normalizedPath)}`);
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

  const handlePeaksExport = useCallback(
    async (generatedPeaks: any) => {
      const lastMedia =
        currentFilePath || localStorage.getItem(STORAGE_KEY_LAST_MEDIA);

      if (lastMedia && window.electronAPI?.writeBinaryFile) {
        try {
          // Flatten peaks to a single Float32Array
          const channelData = generatedPeaks[0]; // First channel
          const float32 =
            channelData instanceof Float32Array
              ? channelData
              : new Float32Array(channelData);
          await window.electronAPI.writeBinaryFile(
            lastMedia + ".peaks.bin",
            float32.buffer,
          );
        } catch (e) {
          console.error("[EditorIO] Failed to save peaks", e);
        }
      }
    },
    [currentFilePath],
  );

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
            setMediaUrl(`file:///${normalizedPath}`);
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
    async (regionsToSave: SubtitleSegment[]) => {
      const path = currentFilePath;
      if (!path) {
        alert("No file path found to save to.");
        return;
      }

      // Use the explicitly loaded subtitle path if available,
      // otherwise fallback to replacing the video extension
      const srtPath = currentSubtitlePath || path.replace(/\.[^.]+$/, ".srt");

      // Generate SRT content
      const srtContent = regionsToSave
        .map((s) => {
          const fmt = (t: number) => {
            const date = new Date(0);
            date.setMilliseconds(t * 1000);
            return date.toISOString().substr(11, 12).replace(".", ",");
          };
          return `${s.id}\n${fmt(s.start)} --> ${fmt(s.end)}\n${s.text}\n`;
        })
        .join("\n");

      if (window.electronAPI?.writeFile) {
        try {
          await window.electronAPI.writeFile(srtPath, srtContent);
          // If we just saved to a new path (e.g. was null before), update it
          if (!currentSubtitlePath) {
            setCurrentSubtitlePath(srtPath);
          }
          return true; // value to indicate success
        } catch (e) {
          console.error("[EditorIO] Failed to save subtitle file", e);
          throw e;
        }
      } else {
        console.warn("Saving not supported in browser mode (yet)");
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
