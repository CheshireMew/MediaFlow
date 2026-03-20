import { useCallback } from "react";

import { apiClient } from "../../api/client";
import { NavigationService } from "../../services/ui/navigation";
import type { ElectronFile } from "../../types/electron";
import type { PipelineRequest } from "../../types/api";
import type { TranscribeResult } from "../../types/transcriber";

type UseTranscriberCommandsArgs = {
  file: ElectronFile | null;
  model: string;
  device: string;
  result: TranscribeResult | null;
  setResult: (value: TranscribeResult | null) => void;
  setActiveTaskId: (taskId: string | null) => void;
  setIsUploading: (value: boolean) => void;
};

export function useTranscriberCommands({
  file,
  model,
  device,
  result,
  setResult,
  setActiveTaskId,
  setIsUploading,
}: UseTranscriberCommandsArgs) {
  const startTranscription = useCallback(async () => {
    if (!file) return;
    setResult(null);

    try {
      setIsUploading(true);

      let filePath = file.path;
      if (!filePath && window.electronAPI?.getPathForFile) {
        filePath = window.electronAPI.getPathForFile(file);
      }

      if (!filePath) {
        alert("Cannot detect file path. Are you running in Electron?");
        setIsUploading(false);
        return;
      }

      const pipelineReq: PipelineRequest = {
        pipeline_id: "transcriber_tool",
        task_name: `Transcribe ${file.name}`,
        steps: [
          {
            step_name: "transcribe",
            params: {
              audio_path: filePath,
              model,
              device,
              vad_filter: true,
            },
          },
        ],
      };

      const response = await apiClient.runPipeline(pipelineReq);
      setActiveTaskId(response.task_id);
    } catch (err: unknown) {
      console.error("[Transcriber] Error submitting task:", err);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      alert(`Transcription failed to start.\nDetails: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  }, [device, file, model, setActiveTaskId, setIsUploading, setResult]);

  const sendToTranslator = useCallback(
    (payload?: { video_path: string; subtitle_path: string }) => {
      const targetResult =
        payload ||
        (result
          ? {
              video_path: file?.path,
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

      localStorage.removeItem("translator_sourceSegments");
      localStorage.removeItem("translator_targetSegments");

      NavigationService.navigate("translator", {
        video_path: targetResult.video_path,
        subtitle_path: targetResult.subtitle_path,
      });
    },
    [file?.path, result],
  );

  const sendToEditor = useCallback(() => {
    if (file?.path) {
      NavigationService.navigate("editor", {
        video_path: file.path,
        subtitle_path: result?.srt_path || null,
      });
    }
  }, [file?.path, result?.srt_path]);

  return {
    startTranscription,
    sendToTranslator,
    sendToEditor,
  };
}
