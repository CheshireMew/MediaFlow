import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useTaskContext } from "../../context/taskContext";
import {
  createNavigationMediaPayload,
  NavigationService,
} from "../../services/ui/navigation";
import { executionService, isDesktopRuntime } from "../../services/domain";
import { fileService } from "../../services/fileService";
import {
  createMediaReference,
  mediaReferenceFromElectronFile,
  toElectronFile,
} from "../../services/ui/mediaReference";
import { normalizeTranscribeResult } from "../../services/ui/transcribeResult";
import type { ElectronFile } from "../../types/electron";
import type { TranscribeResult } from "../../types/transcriber";
import {
  createTaskFromSubmissionReceipt,
  isDirectExecutionResult,
  isTaskExecutionSubmission,
} from "../../services/domain/taskSubmission";
import { toSRT } from "../../utils/subtitleParser";
import { smartSplitTranscriptionResult } from "../../utils/transcriberSmartSplit";
import { toast } from "../../utils/toast";

type UseTranscriberCommandsArgs = {
  file: ElectronFile | null;
  model: string;
  device: string;
  result: TranscribeResult | null;
  setResult: (value: TranscribeResult | null) => void;
  setFile: (value: ElectronFile | null) => void;
  setActiveTaskId: (taskId: string | null) => void;
  setDesktopProgress: (value: {
    progress: number;
    message: string;
    active: boolean;
  }) => void;
  setExecutionMode: (value: "task_submission" | "direct_result" | null) => void;
  setIsUploading: (value: boolean) => void;
  setIsSmartSplitting: (value: boolean) => void;
};

type TranslatorNavigationPayload = {
  video_ref?: TranscribeResult["video_ref"] | null;
  subtitle_ref?: TranscribeResult["subtitle_ref"] | null;
};

export function createTranscriberTranslationNavigationPayload(
  payload: TranslatorNavigationPayload,
) {
  return createNavigationMediaPayload({
    videoPath: null,
    subtitlePath: null,
    videoRef: payload.video_ref ?? null,
    subtitleRef: payload.subtitle_ref ?? null,
  });
}

export function createTranscriberEditorNavigationPayload(params: {
  file: ElectronFile & { path: string };
  result: TranscribeResult | null;
}) {
  const { file, result } = params;
  return createNavigationMediaPayload({
    videoPath: file.path,
    subtitlePath: null,
    videoRef: createMediaReference({
      path: file.path,
      name: file.name,
      size: file.size,
      type: file.type,
    }),
    subtitleRef: result?.subtitle_ref ?? null,
  });
}

export function useTranscriberCommands({
  file,
  model,
  device,
  result,
  setResult,
  setFile,
  setActiveTaskId,
  setDesktopProgress,
  setExecutionMode,
  setIsUploading,
  setIsSmartSplitting,
}: UseTranscriberCommandsArgs) {
  const { t } = useTranslation("transcriber");
  const { addTask } = useTaskContext();

  const startTranscription = useCallback(async () => {
    if (!file) return;
    setResult(null);
    setDesktopProgress({
      progress: 0,
      message: "",
      active: false,
    });

    try {
      setIsUploading(true);
      setExecutionMode(null);

      let filePath = file.path;
      if (!filePath && isDesktopRuntime()) {
        filePath = fileService.getPathForFile(file);
      }

      if (filePath && isDesktopRuntime()) {
        const resolvedPath = await fileService.resolveExistingPath(filePath, file.name);
        if (resolvedPath && resolvedPath !== filePath) {
          filePath = resolvedPath;
          const source = mediaReferenceFromElectronFile(file);
          setFile(
            toElectronFile(
              createMediaReference({
                path: resolvedPath,
                name: source?.name ?? file.name,
                size: source?.size ?? file.size,
                type: source?.type ?? file.type,
              }),
            ),
          );
        }
      }

      if (!filePath) {
        alert("Cannot detect file path. Are you running in Electron?");
        setIsUploading(false);
        return;
      }

      const submissionAudioRef = createMediaReference({
        path: filePath,
        name: file.name,
        size: file.size,
        type: file.type,
      });

      if (isDesktopRuntime()) {
        setDesktopProgress({
          progress: 0,
          message: t("progressCard.processingMessage"),
          active: true,
        });

        const executionResult = await executionService.transcribe({
          audio_path: submissionAudioRef ? null : filePath,
          audio_ref: submissionAudioRef,
          model,
          device,
        });
        if (!isDirectExecutionResult<TranscribeResult>(executionResult)) {
          throw new Error("Desktop transcription returned a task submission");
        }
        setExecutionMode("direct_result");
        const completedResult =
          normalizeTranscribeResult(executionResult.result, {
          path: submissionAudioRef.path,
          name: submissionAudioRef.name,
          size: submissionAudioRef.size,
          type: submissionAudioRef.type,
          }) ?? executionResult.result;

        setResult({
          ...completedResult,
          text: completedResult.text ?? "",
          language: completedResult.language ?? "auto",
          segments: completedResult.segments ?? [],
          video_ref: completedResult.video_ref ?? submissionAudioRef,
          subtitle_ref: completedResult.subtitle_ref ?? null,
        });
        setDesktopProgress({
          progress: 100,
          message: t("progressCard.systemReady"),
          active: false,
        });
        setActiveTaskId(null);
        return;
      }

      const executionResult = await executionService.transcribe({
        audio_path: submissionAudioRef ? null : filePath,
        audio_ref: submissionAudioRef,
        model,
        device,
      });
      if (!isTaskExecutionSubmission(executionResult)) {
        throw new Error("Transcription did not return a task submission");
      }
      setExecutionMode("task_submission");
      if (!executionResult.task_id) {
        throw new Error("Transcription task id was not returned");
      }
      addTask(
        createTaskFromSubmissionReceipt({
          receipt: executionResult,
          type: "pipeline",
          name: `Transcribe ${file.name}`,
          request_params: {
            pipeline_id: "transcriber_tool",
            steps: [
              {
                step_name: "transcribe",
                params: {
                  audio_path: filePath,
                  audio_ref: submissionAudioRef,
                  model,
                  device,
                  vad_filter: true,
                },
              },
            ],
            video_ref: submissionAudioRef,
          },
        }),
      );
      setActiveTaskId(executionResult.task_id);
    } catch (err: unknown) {
      console.error("[Transcriber] Error submitting task:", err);
      if (err instanceof Error && /paused|cancelled/i.test(err.message)) {
        setDesktopProgress({
          progress: 0,
          message: "",
          active: false,
        });
        return;
      }
      setDesktopProgress({
        progress: 0,
        message: "",
        active: false,
      });
      setExecutionMode(null);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      alert(`Transcription failed to start.\nDetails: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  }, [
    device,
    file,
    model,
    setActiveTaskId,
    setDesktopProgress,
    setFile,
    setIsUploading,
    setResult,
    t,
  ]);

  const sendToTranslator = useCallback(
    (payload?: TranslatorNavigationPayload) => {
      const targetResult: TranslatorNavigationPayload | null =
        payload ||
        (result && (file?.path || result.video_ref?.path) && result.subtitle_ref?.path
          ? {
              video_ref:
                result.video_ref ??
                (file?.path
                  ? createMediaReference({
                      path: file.path,
                      name: file.name,
                      size: file.size,
                      type: file.type,
                    })
                  : null),
              subtitle_ref: result.subtitle_ref,
            }
          : null);

      if (!targetResult) {
        console.warn(
          "[Transcriber] handleSendToTranslator: No valid result/path available",
          targetResult,
        );
        alert("No subtitle file available to translate.");
        return;
      }

      NavigationService.navigate(
        "translator",
        createTranscriberTranslationNavigationPayload(targetResult),
      );
    },
    [file, result],
  );

  const sendToEditor = useCallback(() => {
    if (file?.path) {
      const normalizedFile = file as ElectronFile & { path: string };
      NavigationService.navigate(
        "editor",
        createTranscriberEditorNavigationPayload({
          file: normalizedFile,
          result,
        }),
      );
    }
  }, [file, result]);

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

    const targetPath = nextResult.subtitle_ref?.path ?? null;

    try {
      setIsSmartSplitting(true);

      if (targetPath && isDesktopRuntime()) {
        await fileService.writeFile(targetPath, toSRT(nextResult.segments));
      } else if (isDesktopRuntime()) {
        throw new Error("Smart split requires a structured subtitle_ref path");
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
