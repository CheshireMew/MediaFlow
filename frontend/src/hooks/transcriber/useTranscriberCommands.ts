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
  isCliTranscriptionSetupRequiredError,
  isDesktopRuntime,
  settingsService,
  type NullableExecutionMode,
} from "../../services/domain";
import { executionService } from "../../services/domain/executionService";
import { fileService } from "../../services/fileService";
import { normalizeMediaReference } from "../../services/ui/mediaReference";
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
  setCurrentTranscriptionTaskId: (taskId: string | null) => void;
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
    videoRef: normalizeMediaReference(file),
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
  setCurrentTranscriptionTaskId,
  setExecutionMode,
  setIsUploading,
  setIsSmartSplitting,
}: UseTranscriberCommandsArgs) {
  const { t } = useTranslation("transcriber");
  const { addTask } = useTaskContext();

  const startTranscription = useCallback(async () => {
    if (!file) return;
    setResult(null);

    try {
      setIsUploading(true);
      setExecutionMode(null);

      let filePath = file.path;
      if (!filePath && isDesktopRuntime()) {
        filePath = fileService.getPathForFile(file);
      }

      if (!filePath) {
        toast.error(t("feedback.filePathMissing"));
        setIsUploading(false);
        return;
      }

      const submissionAudioRef = normalizeMediaReference({ ...file, path: filePath })!;

      const executionResult = await executionService.transcribe({
        audio_ref: submissionAudioRef,
        task_name: t("feedback.taskName", { name: file.name }),
        engine,
        model,
        device,
      });
      applyExecutionOutcome({
        outcome: executionResult,
        setExecutionMode,
      });

      const submission = enqueueExecutionTask({
        addTask,
        outcome: executionResult,
        descriptor: {
          type: "pipeline",
          name: t("feedback.taskName", { name: file.name }),
          request_params: {
            pipeline_id: "transcriber_tool",
            steps: [
              {
                step_name: "transcribe",
                params: {
                  audio_ref: submissionAudioRef,
                  engine,
                  model,
                  device,
                },
              },
            ],
          },
        },
      });
      setCurrentTranscriptionTaskId(submission.task_id);
    } catch (err: unknown) {
      console.error("[Transcriber] Error submitting task:", err);
      if (isCliTranscriptionSetupRequiredError(err)) {
        setExecutionMode(null);
        return;
      }
      if (err instanceof Error && /paused|cancelled/i.test(err.message)) {
        return;
      }
      setExecutionMode(null);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      toast.error(t("feedback.startFailed", { detail: msg }));
    } finally {
      setIsUploading(false);
    }
  }, [
    device,
    engine,
    file,
    model,
    addTask,
    setCurrentTranscriptionTaskId,
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
                  ? normalizeMediaReference(file)
                  : null),
              subtitle_ref: result.subtitle_ref,
            }
          : null);

      if (!targetResult) {
        console.warn(
          "[Transcriber] handleSendToTranslator: No valid result/path available",
          targetResult,
        );
        toast.warning(t("feedback.noSubtitleForTranslation"));
        return;
      }

      NavigationService.navigate(
        "translator",
        createTranscriberTranslationNavigationPayload(targetResult),
      );
    },
    [file, result, t],
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
