import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Dispatch, RefObject } from "react";
import { useTranslation } from "react-i18next";

import { useTaskContext } from "../../context/taskContext";
import {
  buildSynthesisOptionsFromPreferences,
  createTaskFromExecutionOutcome,
  executionService,
  getExecutionSubmission,
  resolveClipRenderMode,
  resolveSynthesisWatermarkReference,
  resolveVideoExportOutputDir,
  type VideoExportSubmission,
} from "../../services/domain";
import { fileService } from "../../services/fileService";
import { restoreStoredSynthesisExecutionPreferences } from "../../services/persistence/synthesisExecutionPreferences";
import type { MediaReference } from "../../services/ui/mediaReference";
import { resolveTaskOutputPath } from "../../services/ui/taskMedia";
import type { EditorDocument } from "../../stores/editorDocument";
import type { ClipExportSegment } from "../../types/api";
import type { SubtitleSegment } from "../../types/task";
import { toast } from "../../utils/toast";
import { countClipExportOutputs, type EditorClipWorkspaceAction } from "./editorClipWorkspace";
import { resolveSubtitleReferenceForSavedPath } from "./useEditorActions";

export type SaveSubtitleFile = (
  regions: SubtitleSegment[],
  saveAs?: boolean,
) => Promise<string | false>;

export function useClipExport({
  document,
  selectedSegments,
  hasSubtitleContent,
  videoElementRef,
  saveSubtitleFile,
  lastExportTaskId,
  dispatch,
}: {
  document: EditorDocument;
  selectedSegments: ClipExportSegment[];
  hasSubtitleContent: boolean;
  videoElementRef: RefObject<HTMLVideoElement | null>;
  saveSubtitleFile: SaveSubtitleFile;
  lastExportTaskId: string | null;
  dispatch: Dispatch<EditorClipWorkspaceAction>;
}) {
  const { t } = useTranslation("editor");
  const { addTask, tasks } = useTaskContext();
  const notifiedTaskId = useRef<string | null>(null);
  const currentVideoRef = useRef<MediaReference | null>(document.video);
  currentVideoRef.current = document.video;
  const lastExportTask = useMemo(
    () => tasks.find((task) => task.id === lastExportTaskId) ?? null,
    [lastExportTaskId, tasks],
  );
  const outputCount = lastExportTask ? countClipExportOutputs(lastExportTask) : 0;

  useEffect(() => {
    notifiedTaskId.current = null;
  }, [document.video]);

  useEffect(() => {
    if (!lastExportTask || notifiedTaskId.current === lastExportTask.id) return;
    if (lastExportTask.status === "completed") {
      notifiedTaskId.current = lastExportTask.id;
      toast.success(t("clips.exportCompleted", { count: outputCount }));
    } else if (lastExportTask.status === "failed") {
      notifiedTaskId.current = lastExportTask.id;
      toast.error(lastExportTask.error || t("clips.exportError"));
    }
  }, [lastExportTask, outputCount, t]);

  const configure = useCallback(() => {
    if (!document.video) {
      toast.warning(t("clips.missingVideoError"));
    } else if (selectedSegments.length === 0) {
      toast.warning(t("clips.noSelectedClips"));
    } else {
      dispatch({ type: "open-export", segments: selectedSegments });
    }
  }, [dispatch, document.video, selectedSegments, t]);

  const close = useCallback(() => dispatch({ type: "close-export" }), [dispatch]);

  const submit = useCallback(async (
    segments: ClipExportSegment[],
    submission: VideoExportSubmission,
  ): Promise<boolean> => {
    const submittedVideo = document.video;
    if (!submittedVideo) {
      toast.error(t("clips.missingVideoError"));
      return false;
    }

    try {
      let subtitleRef: ReturnType<typeof resolveSubtitleReferenceForSavedPath> | null = null;
      if (submission.subtitleEnabled) {
        let savedPath: string | false = false;
        try {
          savedPath = await saveSubtitleFile(document.regions);
        } catch (error) {
          console.error("[EditorClips] Failed to save subtitles before clip export", error);
        }
        if (!savedPath) {
          toast.error(t("clips.exportSubtitleError"));
          return false;
        }
        subtitleRef = resolveSubtitleReferenceForSavedPath({
          video: submittedVideo,
          subtitle: document.subtitle,
          savedPath,
        });
      }

      const params = {
        video_ref: submittedVideo,
        render_mode: resolveClipRenderMode(submission),
        srt_ref: subtitleRef,
        watermark_ref: submission.watermarkRef,
        options: submission.options,
        output_dir: submission.outputDir,
        segments,
      };
      const outcome = await executionService.exportClips(params);
      getExecutionSubmission(outcome);
      const task = createTaskFromExecutionOutcome({
        outcome,
        type: "pipeline",
        name: submittedVideo.name ? `Export clips ${submittedVideo.name}` : "Export clips",
        request_params: {
          pipeline_id: "clip_export_tool",
          steps: [{ step_name: "clip_export", params }],
        },
      });
      addTask(task);
      if (currentVideoRef.current === submittedVideo) {
        dispatch({ type: "track-export", taskId: task.id });
        notifiedTaskId.current = null;
        toast.success(t("clips.exportQueued", { count: segments.length }));
      }
      return true;
    } catch (error) {
      console.error("[EditorClips] Failed to export clips", error);
      toast.error(t("clips.exportError"));
      return false;
    }
  }, [addTask, dispatch, document.regions, document.subtitle, document.video, saveSubtitleFile, t]);

  const quickExport = useCallback(async () => {
    const video = document.video;
    if (!video) {
      toast.error(t("clips.missingVideoError"));
      return;
    }
    if (selectedSegments.length === 0) {
      toast.warning(t("clips.noSelectedClips"));
      return;
    }

    dispatch({ type: "set-quick-exporting", value: true });
    try {
      const preferences = restoreStoredSynthesisExecutionPreferences();
      const effectivePreferences = {
        ...preferences,
        subtitleEnabled: preferences.subtitleEnabled && hasSubtitleContent,
      };
      const videoElement = videoElementRef.current;
      const options = buildSynthesisOptionsFromPreferences(effectivePreferences, {
        targetResolution: effectivePreferences.targetResolution,
        videoSize: videoElement
          ? { w: videoElement.videoWidth, h: videoElement.videoHeight }
          : null,
      });
      const watermarkRef = preferences.watermarkEnabled
        ? await resolveSynthesisWatermarkReference(preferences)
        : null;
      await submit(selectedSegments, {
        options,
        outputRef: null,
        outputDir: resolveVideoExportOutputDir(
          video.path,
          preferences.lastOutputDir,
          "clips",
        ),
        watermarkRef,
        subtitleEnabled: effectivePreferences.subtitleEnabled,
        watermarkEnabled: preferences.watermarkEnabled,
      });
    } finally {
      dispatch({ type: "set-quick-exporting", value: false });
    }
  }, [dispatch, document.video, hasSubtitleContent, selectedSegments, submit, t, videoElementRef]);

  const openLastOutput = useCallback(() => {
    if (!lastExportTask) return;
    void resolveTaskOutputPath(lastExportTask).then((path) => {
      if (path) return fileService.showInExplorer(path);
    });
  }, [lastExportTask]);

  const exportTask = useMemo(() => lastExportTask ? {
    status: lastExportTask.status,
    progress: lastExportTask.progress,
    message_code: lastExportTask.message_code,
    message_params: lastExportTask.message_params,
    error: lastExportTask.error,
    outputCount,
    onOpenOutput: openLastOutput,
  } : null, [lastExportTask, openLastOutput, outputCount]);

  return { configure, close, submit, quickExport, exportTask };
}
