import { useState, useEffect, useCallback } from "react";
import { apiClient } from "../api/client";
import { useTaskContext } from "../context/TaskContext";
import type { TranscribeResult } from "../types/transcriber";

export function useTranscriber() {
  const { tasks } = useTaskContext();

  // Settings
  const [model, setModel] = useState(
    () => localStorage.getItem("transcriber_model") || "base",
  );
  const [device, setDevice] = useState(
    () => localStorage.getItem("transcriber_device") || "cuda",
  );

  const [isUploading, setIsUploading] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(() =>
    localStorage.getItem("transcriber_activeTaskId"),
  );

  // Persistence
  const [result, setResult] = useState<TranscribeResult | null>(() => {
    const saved = localStorage.getItem("transcriber_result");
    return saved ? JSON.parse(saved) : null;
  });

  const [file, setFile] = useState<File | null>(() => {
    const saved = localStorage.getItem("transcriber_file");
    if (saved) {
      try {
        const meta = JSON.parse(saved);
        return {
          name: meta.name,
          path: meta.path,
          size: meta.size,
          type: "video/mp4", // Mock
        } as unknown as File;
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  // Save Persistence
  useEffect(() => {
    localStorage.setItem("transcriber_model", model);
    localStorage.setItem("transcriber_device", device);

    if (activeTaskId)
      localStorage.setItem("transcriber_activeTaskId", activeTaskId);
    else localStorage.removeItem("transcriber_activeTaskId");

    if (result)
      localStorage.setItem("transcriber_result", JSON.stringify(result));
    else localStorage.removeItem("transcriber_result");

    if (file && (file as any).path) {
      localStorage.setItem(
        "transcriber_file",
        JSON.stringify({
          name: file.name,
          path: (file as any).path,
          size: file.size,
        }),
      );
    } else {
      localStorage.removeItem("transcriber_file");
    }
  }, [model, device, activeTaskId, result, file]);

  // Recover active task
  useEffect(() => {
    if (activeTaskId) return;
    const runningTask = tasks.find(
      (t) =>
        t.type === "transcribe" && ["running", "pending"].includes(t.status),
    );
    if (runningTask) {
      setActiveTaskId(runningTask.id);
    }
  }, [tasks]);

  // Check for pending file from TaskMonitor navigation
  // Check for pending file from TaskMonitor navigation
  const checkPendingNavigation = useCallback(() => {
    const pendingFile = sessionStorage.getItem("mediaflow:pending_file");
    if (pendingFile) {
      try {
        const data = JSON.parse(pendingFile);
        if (data.video_path) {
          // Get file size using Electron API if available
          const loadFileWithSize = async () => {
            let fileSize = 0;
            if (window.electronAPI?.getFileSize) {
              try {
                fileSize = await window.electronAPI.getFileSize(
                  data.video_path,
                );
              } catch (e) {
                console.warn("[Transcriber] Could not get file size:", e);
              }
            }
            const fakeFile = {
              name: data.video_path.split(/[\\/]/).pop() || "video.mp4",
              path: data.video_path,
              size: fileSize,
              type: "video/mp4",
            } as unknown as File;
            setFile(fakeFile);
          };
          loadFileWithSize();
        }
        sessionStorage.removeItem("mediaflow:pending_file");
      } catch (e) {
        console.error("[Transcriber] Failed to parse pending file:", e);
      }
    }
  }, []);

  useEffect(() => {
    checkPendingNavigation();

    const handleNavigate = (e: CustomEvent) => {
      if (e.detail === "transcriber") {
        checkPendingNavigation();
      }
    };
    window.addEventListener(
      "mediaflow:navigate",
      handleNavigate as EventListener,
    );
    return () =>
      window.removeEventListener(
        "mediaflow:navigate",
        handleNavigate as EventListener,
      );
  }, [checkPendingNavigation]);

  // Poll for active task updates
  const { connected } = useTaskContext(); // Get connected state

  useEffect(() => {
    if (!activeTaskId) return;

    // Check if task exists in the current list
    const task = tasks.find((t) => t.id === activeTaskId);

    if (task) {
      // Handle terminal states
      if (task.status === "completed") {
        if (task.result) {
          // Map Backend TaskResult -> Frontend TranscribeResult
          const backendResult = task.result as any; // Typed as TaskResult in backend
          const meta = backendResult.meta || {};
          const files = backendResult.files || [];

          const srtFile = files.find((f: any) => f.type === "subtitle");

          const mappedResult: TranscribeResult = {
            segments: meta.segments || [],
            text: meta.text || "",
            language: meta.language || "auto",
            srt_path: srtFile?.path,
            video_path: (file as any)?.path, // Persist original video path
            audio_path: (file as any)?.path,
          };

          setResult(mappedResult);
        }
        setActiveTaskId(null);
      } else if (task.status === "failed" || task.status === "cancelled") {
        // Turn off processing state if failed/cancelled
        setActiveTaskId(null);
      }
    } else {
      // Task ID exists in local state but not in the global task list.
      // Only clear if we are connected (tasks loaded).
      if (connected) {
        setActiveTaskId(null);
      }
    }
  }, [tasks, activeTaskId, connected]);

  const handleTranscribe = async () => {
    if (!file) return;
    setResult(null);

    try {
      setIsUploading(true);

      let filePath = (file as any).path;
      if (
        !filePath &&
        window.electronAPI &&
        window.electronAPI.getPathForFile
      ) {
        filePath = window.electronAPI.getPathForFile(file);
      }

      if (!filePath) {
        alert("Cannot detect file path. Are you running in Electron?");
        setIsUploading(false);
        return;
      }

      const pipelineReq = {
        pipeline_id: "transcriber_tool",
        task_name: `Transcribe ${file.name}`,
        steps: [
          {
            step_name: "transcribe",
            params: {
              audio_path: filePath,
              model: model,
              device: device,
              vad_filter: true,
            },
          },
        ] as any[], // Cast to allow diverse step params
      };

      // Auto-Execute Flow
      try {
        const settings = await apiClient.getSettings();
        if (settings.auto_execute_flow) {
          pipelineReq.steps.push(
            {
              step_name: "translate",
              params: {
                target_language: settings.language || "zh",
                mode: "standard",
              },
            },
            {
              step_name: "synthesize",
              params: {
                options: {},
              },
            },
          );
        }
      } catch (e) {
        console.warn("[Auto-Execute] Failed to check settings", e);
      }

      const response = await apiClient.runPipeline(pipelineReq);

      // const data = await response.json(); // Old fetch
      // runPipeline returns the task object directly
      setActiveTaskId(response.task_id);

      // if (!response.ok) throw new Error("Failed to start transcription");
      // const data = await response.json();
      // setActiveTaskId(data.task_id);
      // handled above
    } catch (err: any) {
      console.error("[Transcriber] Error submitting task:", err);
      const msg = err.message || JSON.stringify(err);
      alert(`Transcription failed to start.\nDetails: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendToTranslator = (payload?: {
    video_path: string;
    subtitle_path: string;
  }) => {
    // Support potential payload from component, or fall back to internal result
    const targetResult =
      payload ||
      (result
        ? {
            video_path: (file as any)?.path,
            subtitle_path: result.srt_path,
          }
        : null);

    if (!targetResult || !targetResult.subtitle_path) {
      console.warn(
        "[Transcriber] handleSendToTranslator: No valid result/path available",
        targetResult,
      );
      alert("No subtitle file available to translate.");
      return;
    }

    // Use the unified navigation protocol
    sessionStorage.setItem(
      "mediaflow:pending_file",
      JSON.stringify({
        video_path: targetResult.video_path,
        subtitle_path: targetResult.subtitle_path,
      }),
    );

    // Clear legacy storage to avoid confusion
    localStorage.removeItem("translator_sourceSegments");
    localStorage.removeItem("translator_targetSegments");

    window.dispatchEvent(
      new CustomEvent("mediaflow:navigate", { detail: "translator" }),
    );
  };

  const handleSendToEditor = () => {
    if (file && (file as any).path) {
      // Use unified navigation protocol
      sessionStorage.setItem(
        "mediaflow:pending_file",
        JSON.stringify({
          video_path: (file as any).path,
          // If we have an SRT path in the result, pass it too?
          // For now, EditorIO tries to load related SRT automatically, but being explicit is better
          subtitle_path: result?.srt_path || null,
        }),
      );

      localStorage.removeItem("editor_last_subtitles"); // Clear old session legacy
      window.dispatchEvent(
        new CustomEvent("mediaflow:navigate", { detail: "editor" }),
      );
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (
      droppedFile &&
      (droppedFile.type.startsWith("audio/") ||
        droppedFile.type.startsWith("video/") ||
        droppedFile.name.endsWith(".mkv"))
    ) {
      if (window.electronAPI && window.electronAPI.getPathForFile) {
        try {
          const path = window.electronAPI.getPathForFile(droppedFile);
          Object.defineProperty(droppedFile, "path", { value: path });
        } catch (err) {
          console.warn("Failed to get path via electronAPI:", err);
        }
      }
      setResult(null); // Clear old results
      setFile(droppedFile);
    }
  };

  const handleFileSelect = async () => {
    if (window.electronAPI) {
      const fileData = (await window.electronAPI.openFile()) as any;
      if (fileData && fileData.path) {
        const fakeFile = {
          name: fileData.name,
          path: fileData.path,
          size: fileData.size,
          type: "video/mp4",
        } as unknown as File;
        setResult(null); // Clear old results
        setFile(fakeFile);
      }
    } else {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "audio/*,video/*";
      input.onchange = (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files && files.length > 0) {
          setResult(null); // Clear old results
          setFile(files[0]);
        }
      };
      input.click();
    }
  };

  // Wrapper to clear old results when setting a new file
  const handleSetFile = (newFile: File | null) => {
    if (newFile !== file) {
      setResult(null); // Clear old results when file changes
      localStorage.removeItem("transcriber_result");
    }
    setFile(newFile);
  };

  return {
    state: {
      file,
      model,
      device,
      isUploading,
      activeTaskId,
      result,
      activeTask: tasks.find((t) => t.id === activeTaskId),
    },
    actions: {
      setFile: handleSetFile,
      setModel,
      setDevice,
      startTranscription: handleTranscribe,
      sendToTranslator: handleSendToTranslator,
      sendToEditor: handleSendToEditor,
      onFileDrop: handleFileDrop,
      onFileSelect: handleFileSelect,
    },
  };
}
