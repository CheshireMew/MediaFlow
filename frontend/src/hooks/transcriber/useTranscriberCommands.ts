import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { apiClient } from "../../api/client";
import { NavigationService } from "../../services/ui/navigation";
import type { ElectronFile } from "../../types/electron";
import type { PipelineRequest } from "../../types/api";
import type { TranscribeResult } from "../../types/transcriber";
import { toSRT } from "../../utils/subtitleParser";
import { smartSplitTranscriptionResult } from "../../utils/transcriberSmartSplit";
import { toast } from "../../utils/toast";

type UseTranscriberCommandsArgs = {
  file: ElectronFile | null;
  model: string;
  device: string;
  result: TranscribeResult | null;
  setResult: (value: TranscribeResult | null) => void;
  setActiveTaskId: (taskId: string | null) => void;
  setIsUploading: (value: boolean) => void;
  setIsSmartSplitting: (value: boolean) => void;
};

export function useTranscriberCommands({
  file,
  model,
  device,
  result,
  setResult,
  setActiveTaskId,
  setIsUploading,
  setIsSmartSplitting,
}: UseTranscriberCommandsArgs) {
  const { t } = useTranslation("transcriber");

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

  const smartSplitSegments = useCallback(async () => {
    if (!result) {
      return;
    }

    const { result: nextResult, splitCount } =
      smartSplitTranscriptionResult(result);

    if (splitCount === 0) {
      toast.info(t("results.smartSplitNoChanges"));
      return;
    }

    const targetPath = nextResult.srt_path || nextResult.subtitle_path;

    try {
      setIsSmartSplitting(true);

      if (targetPath && window.electronAPI?.writeFile) {
        await window.electronAPI.writeFile(targetPath, toSRT(nextResult.segments));
      }

      setResult(nextResult);
      toast.success(t("results.smartSplitSuccess", { count: splitCount }));
    } catch (error) {
      console.error("[Transcriber] Failed to smart split segments", error);
      toast.error(t("results.smartSplitError"));
    } finally {
      setIsSmartSplitting(false);
    }
  }, [result, setIsSmartSplitting, setResult, t]);

  return {
    startTranscription,
    sendToTranslator,
    sendToEditor,
    smartSplitSegments,
  };
}
