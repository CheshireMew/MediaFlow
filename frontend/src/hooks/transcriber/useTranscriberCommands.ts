import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { useTaskContext } from "../../context/taskContext";
import {
  createNavigationMediaPayload,
  NavigationService,
} from "../../services/ui/navigation";
import {
  applyExecutionOutcome,
  enqueueExecutionTask,
  executionService,
  isCliTranscriptionSetupRequiredError,
  isDesktopRuntime,
  settingsService,
  type NullableExecutionMode,
} from "../../services/domain";
import { fileService } from "../../services/fileService";
import {
  createMediaReference,
  mediaReferenceFromElectronFile,
  toElectronFile,
} from "../../services/ui/mediaReference";
import { normalizeTranscribeResult } from "../../services/ui/transcribeResult";
import {
  attachElectronFileSource,
  getElectronFileSource,
} from "../../services/ui/electronFileSource";
import type { ElectronFile } from "../../types/electron";
import type { TranscribeResult, TranscriptionEngine } from "../../types/transcriber";
import { toSRT } from "../../utils/subtitleParser";
import { smartSplitSubtitleSegments } from "../../utils/subtitleSmartSplit";
import { toast } from "../../utils/toast";

type UseTranscriberCommandsArgs = {
  file: ElectronFile | null;
  engine: TranscriptionEngine;
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
  setExecutionMode: (value: NullableExecutionMode) => void;
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
  engine,
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
        const resolvedPath = await fileService.resolveExistingPath(filePath, file.name, file.size);
        if (resolvedPath && resolvedPath !== filePath) {
          filePath = resolvedPath;
          const source = mediaReferenceFromElectronFile(file);
          setFile(
            attachElectronFileSource(
              toElectronFile(
                createMediaReference({
                  path: resolvedPath,
                  name: source?.name ?? file.name,
                  size: source?.size ?? file.size,
                  type: source?.type ?? file.type,
                }),
              ),
              getElectronFileSource(file),
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

      console.info("[Transcriber] desktop:transcribe payload", {
        source: getElectronFileSource(file),
        engine,
        audio_ref: submissionAudioRef.path,
        file_path: file.path ?? null,
        resolved_path: filePath,
      });

      const executionResult = await executionService.transcribe({
        audio_path: null,
        audio_ref: submissionAudioRef,
        engine,
        model,
        device,
      });
      const outcome = applyExecutionOutcome({
        outcome: executionResult,
        setExecutionMode,
      });

      if (outcome.kind === "result") {
        setDesktopProgress({
          progress: 0,
          message: t("progressCard.processingMessage"),
          active: true,
        });

        const completedResult =
          normalizeTranscribeResult(outcome.result, {
          path: submissionAudioRef.path,
          name: submissionAudioRef.name,
          size: submissionAudioRef.size,
          type: submissionAudioRef.type,
          }) ?? outcome.result;

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

      const submission = enqueueExecutionTask({
        addTask,
        outcome: executionResult,
        descriptor: {
          type: "pipeline",
          name: `Transcribe ${file.name}`,
          request_params: {
            pipeline_id: "transcriber_tool",
            steps: [
              {
                step_name: "transcribe",
                params: {
                  audio_path: null,
                  audio_ref: submissionAudioRef,
                  engine,
                  model,
                  device,
                  vad_filter: true,
                },
              },
            ],
            video_ref: submissionAudioRef,
          },
        },
      });
      setActiveTaskId(submission.task_id);
    } catch (err: unknown) {
      console.error("[Transcriber] Error submitting task:", err);
      if (isCliTranscriptionSetupRequiredError(err)) {
        setDesktopProgress({
          progress: 0,
          message: "",
          active: false,
        });
        setExecutionMode(null);
        return;
      }
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
    engine,
    file,
    model,
    addTask,
    setActiveTaskId,
    setDesktopProgress,
    setFile,
    setExecutionMode,
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

    const textLimit = await settingsService.getSmartSplitTextLimit();
    const { segments, splitCount } = smartSplitSubtitleSegments(result.segments, {
      textLimit,
    });

    if (splitCount === 0) {
      toast.info(t("results.smartSplitNoChanges"));
      return;
    }

    const nextResult = {
      ...result,
      segments,
      text: segments.map((segment) => segment.text).join(" ").trim(),
    };

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
