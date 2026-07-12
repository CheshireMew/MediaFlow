import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";

import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import type { EditorWorkspaceMode } from "../../components/editor/EditorHeader";
import { useTaskContext } from "../../context/taskContext";
import {
  buildSynthesisOptionsFromPreferences,
  createTaskFromExecutionOutcome,
  editorService,
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
import type { ClipCandidate, SubtitleSegment } from "../../types/task";
import { stopVideoAtClipEnd } from "../../utils/clipPlayback";
import { toast } from "../../utils/toast";
import { resolveSubtitleReferenceForSavedPath } from "./useEditorActions";
import {
  countClipExportOutputs,
  createEditorClipWorkspaceState,
  editorClipWorkspaceReducer,
  getClipTimelineRegions,
  getSelectedClipSegments,
  resolveManualClipRange,
} from "./editorClipWorkspace";

export interface EditorContextMenuState {
  position: { x: number; y: number };
  items: ContextMenuItem[];
  targetId?: string;
}

type SaveSubtitleFile = (
  regions: SubtitleSegment[],
  saveAs?: boolean,
) => Promise<string | false>;

interface UseEditorClipWorkspaceParams {
  document: EditorDocument;
  mediaUrl: string | null;
  waveformReady: boolean;
  videoElementRef: RefObject<HTMLVideoElement | null>;
  saveSubtitleFile: SaveSubtitleFile;
  setContextMenu: (menu: EditorContextMenuState | null) => void;
}

export function useEditorClipWorkspace({
  document,
  mediaUrl,
  waveformReady,
  videoElementRef,
  saveSubtitleFile,
  setContextMenu,
}: UseEditorClipWorkspaceParams) {
  const { t } = useTranslation("editor");
  const { addTask, tasks } = useTaskContext();
  const [workspaceMode, setWorkspaceMode] =
    useState<EditorWorkspaceMode>("subtitles");
  const [state, dispatch] = useReducer(
    editorClipWorkspaceReducer,
    undefined,
    createEditorClipWorkspaceState,
  );
  const clipPlaybackEndRef = useRef<number | null>(null);
  const notifiedExportTaskIdRef = useRef<string | null>(null);
  const currentVideoReferenceRef = useRef<MediaReference | null>(document.video);
  currentVideoReferenceRef.current = document.video;

  const hasSubtitleContent = useMemo(
    () => document.regions.some((region) => region.text.trim().length > 0),
    [document.regions],
  );
  const selectedSegments = useMemo(
    () => getSelectedClipSegments(state.candidates),
    [state.candidates],
  );
  const timelineRegions = useMemo(
    () => getClipTimelineRegions(state.candidates),
    [state.candidates],
  );
  const selectedClipIds = useMemo(
    () => state.candidates
      .filter((candidate) => candidate.selected)
      .map((candidate) => candidate.id),
    [state.candidates],
  );
  const activeClip = useMemo(
    () => state.candidates.find(
      (candidate) => candidate.id === state.activeClipId,
    ) ?? null,
    [state.activeClipId, state.candidates],
  );
  const lastExportTask = useMemo(
    () => tasks.find((task) => task.id === state.lastExportTaskId) ?? null,
    [state.lastExportTaskId, tasks],
  );
  const lastExportOutputCount = lastExportTask
    ? countClipExportOutputs(lastExportTask)
    : 0;

  useEffect(() => {
    dispatch({ type: "reset" });
    notifiedExportTaskIdRef.current = null;
  }, [document.video]);

  useEffect(() => {
    clipPlaybackEndRef.current = null;
  }, [mediaUrl, workspaceMode]);

  useEffect(() => {
    const video = videoElementRef.current;
    if (!video) return;

    const stopAtClipEnd = () => {
      const clipEnd = clipPlaybackEndRef.current;
      if (clipEnd === null || !stopVideoAtClipEnd(video, clipEnd)) return;
      clipPlaybackEndRef.current = null;
    };
    const clearClipBoundary = () => {
      clipPlaybackEndRef.current = null;
    };

    video.addEventListener("timeupdate", stopAtClipEnd);
    video.addEventListener("ended", clearClipBoundary);
    return () => {
      video.removeEventListener("timeupdate", stopAtClipEnd);
      video.removeEventListener("ended", clearClipBoundary);
    };
  }, [mediaUrl, videoElementRef]);

  useEffect(() => {
    if (
      !lastExportTask ||
      notifiedExportTaskIdRef.current === lastExportTask.id
    ) {
      return;
    }
    if (lastExportTask.status === "completed") {
      notifiedExportTaskIdRef.current = lastExportTask.id;
      toast.success(t("clips.exportCompleted", { count: lastExportOutputCount }));
    } else if (lastExportTask.status === "failed") {
      notifiedExportTaskIdRef.current = lastExportTask.id;
      toast.error(lastExportTask.error || t("clips.exportError"));
    }
  }, [lastExportOutputCount, lastExportTask, t]);

  const updateClipCandidate = useCallback(
    (id: string, updates: Partial<ClipCandidate>) => {
      dispatch({ type: "update-candidate", id, updates });
    },
    [],
  );

  const handleDetectHighlights = useCallback(async () => {
    if (!document.video) {
      toast.warning(t("clips.missingVideoError"));
      return;
    }
    if (!hasSubtitleContent) {
      toast.warning(t("clips.requiresSubtitlesMessage"));
      setWorkspaceMode("subtitles");
      return;
    }

    dispatch({ type: "set-detecting", value: true });
    setWorkspaceMode("clips");
    try {
      const response = await editorService.detectHighlightCandidates({
        video_ref: document.video,
        subtitle_segments: document.regions,
        max_candidates: 6,
        min_duration: 12,
        max_duration: 75,
      });
      dispatch({ type: "merge-detected", candidates: response.candidates });
      if (response.candidates.length === 0) {
        toast.warning(t("clips.detectNoCandidates"));
      } else {
        toast.success(t("clips.detectSuccess", { count: response.candidates.length }));
      }
    } catch (error) {
      console.error("[EditorClips] Failed to detect highlights", error);
      toast.error(t("clips.detectError"));
    } finally {
      dispatch({ type: "set-detecting", value: false });
    }
  }, [document.regions, document.video, hasSubtitleContent, t]);

  const handleClipClick = useCallback((id: string) => {
    clipPlaybackEndRef.current = null;
    dispatch({ type: "set-active", id });
    const clip = state.candidates.find((candidate) => candidate.id === id);
    if (clip && videoElementRef.current) {
      videoElementRef.current.currentTime = clip.start;
    }
  }, [state.candidates, videoElementRef]);

  const handleClipRegionClick = useCallback((id: string, event?: MouseEvent) => {
    clipPlaybackEndRef.current = null;
    dispatch({ type: "set-active", id });
    const clip = state.candidates.find((candidate) => candidate.id === id);
    if (event?.ctrlKey || event?.metaKey) {
      updateClipCandidate(id, { selected: !(clip?.selected ?? false) });
    }
    if (clip && videoElementRef.current) {
      videoElementRef.current.currentTime = clip.start;
    }
  }, [state.candidates, updateClipCandidate, videoElementRef]);

  const handleClipRegionUpdate = useCallback((
    id: string,
    start: number,
    end: number,
  ) => {
    updateClipCandidate(id, {
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
    });
  }, [updateClipCandidate]);

  const handleToggleClipSelected = useCallback((id: string) => {
    const clip = state.candidates.find((candidate) => candidate.id === id);
    updateClipCandidate(id, { selected: !clip?.selected });
  }, [state.candidates, updateClipCandidate]);

  const handleDeleteClip = useCallback((id: string) => {
    dispatch({ type: "delete-candidate", id });
  }, []);

  const addManualClip = useCallback((
    startValue: number,
    endValue: number,
    id?: string,
  ) => {
    const start = Number(startValue.toFixed(3));
    const end = Number(endValue.toFixed(3));
    if (end <= start) return;

    const candidateId = id ??
      `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    dispatch({
      type: "add-candidate",
      candidate: {
        id: candidateId,
        start,
        end,
        title: t("clips.manualClipTitle", { index: state.candidates.length + 1 }),
        reason: t("clips.manualClipReason"),
        score: 100,
        transcript: null,
        selected: true,
      },
    });
  }, [state.candidates.length, t]);

  const handleCreateManualClip = useCallback(() => {
    const video = videoElementRef.current;
    const range = video
      ? resolveManualClipRange(video.currentTime, video.duration)
      : null;
    if (!range) {
      toast.warning(t("clips.manualCreateUnavailable"));
      return;
    }

    addManualClip(range.start, range.end);
    toast.success(t("clips.manualCreateSuccess"));
  }, [addManualClip, t, videoElementRef]);

  const handleConfigureClipExport = useCallback(() => {
    if (!document.video) {
      toast.warning(t("clips.missingVideoError"));
      return;
    }
    if (selectedSegments.length === 0) {
      toast.warning(t("clips.noSelectedClips"));
      return;
    }
    dispatch({ type: "open-export", segments: selectedSegments });
  }, [document.video, selectedSegments, t]);

  const closeClipExport = useCallback(() => {
    dispatch({ type: "close-export" });
  }, []);

  const submitClipExport = useCallback(async (
    segments: ClipExportSegment[],
    submission: VideoExportSubmission,
  ): Promise<boolean> => {
    const submittedVideoReference = document.video;
    if (!submittedVideoReference) {
      toast.error(t("clips.missingVideoError"));
      return false;
    }

    try {
      let subtitleRefForSubmission: ReturnType<
        typeof resolveSubtitleReferenceForSavedPath
      > | null = null;
      if (submission.subtitleEnabled) {
        let savedSubtitlePath: string | false = false;
        try {
          savedSubtitlePath = await saveSubtitleFile(document.regions);
        } catch (error) {
          console.error(
            "[EditorClips] Failed to save subtitles before clip export",
            error,
          );
        }
        if (!savedSubtitlePath) {
          toast.error(t("clips.exportSubtitleError"));
          return false;
        }
        subtitleRefForSubmission = resolveSubtitleReferenceForSavedPath({
          video: submittedVideoReference,
          subtitle: document.subtitle,
          savedPath: savedSubtitlePath,
        });
      }
      const exportPayload = {
        video_ref: submittedVideoReference,
        render_mode: resolveClipRenderMode(submission),
        srt_ref: subtitleRefForSubmission,
        watermark_ref: submission.watermarkRef,
        options: submission.options,
        output_dir: submission.outputDir,
        segments,
      };
      const executionResult = await editorService.exportClipSegments(exportPayload);
      getExecutionSubmission(executionResult);
      const task = createTaskFromExecutionOutcome({
        outcome: executionResult,
        type: "clip_export",
        name: submittedVideoReference.name
          ? `Export clips ${submittedVideoReference.name}`
          : "Export clips",
        request_params: exportPayload,
      });
      addTask(task);
      if (currentVideoReferenceRef.current === submittedVideoReference) {
        dispatch({ type: "track-export", taskId: task.id });
        notifiedExportTaskIdRef.current = null;
        toast.success(t("clips.exportQueued", { count: segments.length }));
      }
      return true;
    } catch (error) {
      console.error("[EditorClips] Failed to export clips", error);
      toast.error(t("clips.exportError"));
      return false;
    }
  }, [addTask, document.regions, document.subtitle, document.video, saveSubtitleFile, t]);

  const handleQuickExportSelectedClips = useCallback(async () => {
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
      await submitClipExport(selectedSegments, {
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
  }, [
    document.video,
    hasSubtitleContent,
    selectedSegments,
    submitClipExport,
    t,
    videoElementRef,
  ]);

  const handleOpenLastClipExport = useCallback(() => {
    if (!lastExportTask) return;
    void resolveTaskOutputPath(lastExportTask).then((outputPath) => {
      if (outputPath) return fileService.showInExplorer(outputPath);
    });
  }, [lastExportTask]);

  const handleClipContextMenu = useCallback((
    event: MouseEvent,
    id: string,
    regionData?: { start: number; end: number },
  ) => {
    event.preventDefault();
    dispatch({ type: "set-active", id });
    const clip = state.candidates.find((candidate) => candidate.id === id);
    if (!clip) {
      if (!regionData || regionData.end <= regionData.start) return;
      setContextMenu({
        position: { x: event.clientX, y: event.clientY },
        targetId: id,
        items: [
          {
            label: t("clips.contextCreateFromSelection"),
            onClick: () => addManualClip(regionData.start, regionData.end, id),
          },
          { separator: true, label: "", onClick: () => {} },
          { label: t("clips.contextCancel"), onClick: () => {} },
        ],
      });
      return;
    }

    setContextMenu({
      position: { x: event.clientX, y: event.clientY },
      targetId: id,
      items: [
        {
          label: t("clips.contextPlay"),
          onClick: () => {
            if (!videoElementRef.current) return;
            const video = videoElementRef.current;
            clipPlaybackEndRef.current = clip.end;
            video.currentTime = clip.start;
            void video.play().catch(() => {
              clipPlaybackEndRef.current = null;
            });
          },
        },
        {
          label: clip.selected
            ? t("clips.contextExclude")
            : t("clips.contextInclude"),
          onClick: () => handleToggleClipSelected(id),
        },
        {
          label: t("clips.contextExportSelected"),
          onClick: handleConfigureClipExport,
        },
        { separator: true, label: "", onClick: () => {} },
        {
          label: t("clips.contextDelete"),
          danger: true,
          onClick: () => handleDeleteClip(id),
        },
      ],
    });
  }, [
    addManualClip,
    handleConfigureClipExport,
    handleDeleteClip,
    handleToggleClipSelected,
    setContextMenu,
    state.candidates,
    t,
    videoElementRef,
  ]);

  const exportTask = useMemo(() => lastExportTask ? {
    status: lastExportTask.status,
    progress: lastExportTask.progress,
    message_code: lastExportTask.message_code,
    message_params: lastExportTask.message_params,
    error: lastExportTask.error,
    outputCount: lastExportOutputCount,
    onOpenOutput: handleOpenLastClipExport,
  } : null, [
    handleOpenLastClipExport,
    lastExportOutputCount,
    lastExportTask,
  ]);

  return {
    workspaceMode,
    setWorkspaceMode,
    candidates: state.candidates,
    activeClipId: state.activeClipId,
    activeClip,
    timelineRegions,
    selectedClipIds,
    hasSubtitleContent,
    exportScope: state.exportScope,
    isDetectingHighlights: state.isDetectingHighlights,
    isQuickExportingClips: state.isQuickExportingClips,
    exportTask,
    canCreateClip: Boolean(document.video && waveformReady),
    updateClipCandidate,
    handleDetectHighlights,
    handleClipClick,
    handleClipRegionClick,
    handleClipRegionUpdate,
    handleToggleClipSelected,
    handleDeleteClip,
    handleCreateManualClip,
    handleConfigureClipExport,
    handleQuickExportSelectedClips,
    handleClipContextMenu,
    closeClipExport,
    submitClipExport,
  };
}
