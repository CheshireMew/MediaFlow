import { lazy, Suspense, useState, useRef, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { SubtitleList } from "../components/editor/SubtitleList";
import { ClipCandidateList } from "../components/editor/ClipCandidateList";
import { FindReplaceDialog } from "../components/dialogs/FindReplaceDialog";
import { ContextMenu, type ContextMenuItem } from "../components/ui/ContextMenu";
import {
  createTaskFromExecutionOutcome,
  editorService,
  executionService,
  getExecutionSubmission,
  buildSynthesisOptionsFromPreferences,
  mergeDetectedClipCandidates,
  resolveClipRenderMode,
  resolveSynthesisWatermarkPath,
  resolveVideoExportOutputDir,
  type VideoExportScope,
  type VideoExportSubmission,
} from "../services/domain";
import { useTaskContext } from "../context/taskContext";
import { restoreStoredSynthesisExecutionPreferences } from "../services/persistence/synthesisExecutionPreferences";

// Extracted Components
import { EditorHeader, type EditorWorkspaceMode } from "../components/editor/EditorHeader";
import { VideoPreview } from "../components/editor/VideoPreview";

// Custom Hooks
import { useEditorIO } from "../hooks/editor/useEditorIO";
import { useEditorShortcuts } from "../hooks/editor/useEditorShortcuts";
import {
  resolveSubtitleReferenceForSavedPath,
  useEditorActions,
} from "../hooks/editor/useEditorActions";
import { useContextMenuBuilder } from "../hooks/editor/useContextMenuBuilder";
import { useEditorDragDrop } from "../hooks/editor/useEditorDragDrop";
import { useEditorPlaybackPersistence } from "../hooks/editor/useEditorPlaybackPersistence";
import { useEditorFindReplace } from "../hooks/editor/useEditorFindReplace";
import { useEditorRegionHandlers } from "../hooks/editor/useEditorRegionHandlers";
import { useEditorStore } from "../stores/editorStore";
import { normalizeMediaReference } from "../services/ui/mediaReference";
import { resolveTaskOutputPath } from "../services/ui/taskMedia";
import { fileService } from "../services/fileService";
import { PageShell } from "../components/ui/PageChrome";
import type { ClipCandidate, SubtitleSegment } from "../types/task";
import type { ClipExportSegment } from "../types/api";
import { stopVideoAtClipEnd } from "../utils/clipPlayback";
import { toast } from "../utils/toast";

const VideoExportDialog = lazy(async () => {
  const mod = await import("../components/dialogs/SynthesisDialog");
  return { default: mod.VideoExportDialog };
});

const WaveformPlayer = lazy(async () => {
  const mod = await import("../components/editor/WaveformPlayer");
  return { default: mod.WaveformPlayer };
});

export function EditorPage() {
  const { t } = useTranslation('editor');
  const videoRef = useRef<HTMLVideoElement>(null);
  const clipPlaybackEndRef = useRef<number | null>(null);
  const { addTask, tasks } = useTaskContext();

  // ── UI State ────────────────────────────────────────────────
  const autoScroll = true;
  const [exportScope, setExportScope] = useState<VideoExportScope | null>(null);
  const [waveformReady, setWaveformReady] = useState(false);
  const [workspaceMode, setWorkspaceMode] =
    useState<EditorWorkspaceMode>("subtitles");
  const [clipCandidates, setClipCandidates] = useState<ClipCandidate[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [isDetectingHighlights, setIsDetectingHighlights] = useState(false);
  const [isQuickExportingClips, setIsQuickExportingClips] = useState(false);
  const [lastClipExportTracking, setLastClipExportTracking] = useState<{
    taskId: string;
    sourcePath: string;
  } | null>(null);
  const notifiedClipExportTaskIdRef = useRef<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
      position: { x: number; y: number };
      items: ContextMenuItem[];
      targetId?: string;
  } | null>(null);

  // ── Store ───────────────────────────────────────────────────
  const regions = useEditorStore(state => state.regions);
  const replaceRegionsWithUndo = useEditorStore(state => state.replaceRegionsWithUndo);
  const activeSegmentId = useEditorStore(state => state.activeSegmentId);
  const selectedIds = useEditorStore(state => state.selectedIds);
  const currentSubtitlePath = useEditorStore(state => state.currentSubtitlePath);
  const currentFileRef = useEditorStore(state => state.currentFileRef);
  const currentSubtitleRef = useEditorStore(state => state.currentSubtitleRef);
  const undo = useEditorStore(state => state.undo);
  const redo = useEditorStore(state => state.redo);
  const deleteSegments = useEditorStore(state => state.deleteSegments);
  const mergeSegments = useEditorStore(state => state.mergeSegments);
  const splitSegment = useEditorStore(state => state.splitSegment);
  const updateRegion = useEditorStore(state => state.updateRegion);
  const updateRegionText = useEditorStore(state => state.updateRegionText);
  const snapshot = useEditorStore(state => state.snapshot);
  const selectSegment = useEditorStore(state => state.selectSegment);
  const addSegment = useEditorStore(state => state.addSegment);
  const addSegments = useEditorStore(state => state.addSegments);
  const updateSegments = useEditorStore(state => state.updateSegments);
  const {
    showFindReplace,
    searchTerm,
    setSearchTerm,
    matchCase,
    setMatchCase,
    handleCloseFindReplace,
    handleToggleFindReplace,
  } = useEditorFindReplace();

  // ── IO Hook ─────────────────────────────────────────────────
  const {
      mediaUrl, openFile, openSubtitle, saveSubtitleFile, currentFilePath,
      loadVideo, loadSubtitleFromPath,
  } = useEditorIO();
  const currentVideoSourcePath = currentFileRef?.path ?? currentFilePath ?? null;
  const currentVideoSourcePathRef = useRef(currentVideoSourcePath);
  currentVideoSourcePathRef.current = currentVideoSourcePath;

  const resolveCurrentVideoReference = () => {
    return currentFileRef ?? normalizeMediaReference(currentFilePath, {
      type: "video/mp4",
      media_kind: "video",
      role: "source",
    });
  };

  // ── Action Hooks ────────────────────────────────────────────
  const { handleSave, handleTranslate, handleSmartSplit, isSmartSplitting } = useEditorActions({
      currentFilePath, currentSubtitlePath, currentFileRef, currentSubtitleRef, regions, saveSubtitleFile,
      replaceRegionsWithUndo,
  });

  const { handleContextMenu } = useContextMenuBuilder({
      regions, selectedIds, currentFilePath, currentFileRef, videoRef,
      currentSubtitlePath, currentSubtitleRef,
      selectSegment, addSegment, addSegments, updateSegments,
      mergeSegments, splitSegment, deleteSegments, setContextMenu,
  });

  // ── Persistence & Safety ────────────────────────────────────
  const {
    displaySegment,
    handleRegionClick,
    handleDetailUpdate,
    handleRegionUpdateCallback,
    handleFindReplaceSelectSegment,
    handleFindReplaceUpdateSegment,
    regionsRef,
  } = useEditorRegionHandlers({
    regions,
    activeSegmentId,
    selectSegment,
    updateRegion,
    updateRegionText,
    snapshot,
    videoRef,
  });

  useEffect(() => {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
          if (regionsRef.current.length > 0) { e.preventDefault(); e.returnValue = ''; }
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [regionsRef]);

  useEffect(() => {
    clipPlaybackEndRef.current = null;
  }, [mediaUrl, workspaceMode]);

  useEffect(() => {
    const video = videoRef.current;
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
  }, [mediaUrl]);

  // ── Shortcuts ───────────────────────────────────────────────
  useEditorShortcuts({
      videoRef, selectedIds, activeSegmentId,
      undo, redo, deleteSegments, splitSegment,
      onSave: handleSave,
      onToggleFindReplace: handleToggleFindReplace,
  });

  const { handleVideoDrop, handleSubtitleDrop, handleDragOver } =
    useEditorDragDrop({
      loadVideo,
      loadSubtitleFromPath,
    });
  const { handleLoadedMetadata } = useEditorPlaybackPersistence({
    currentFilePath,
    videoRef,
  });

  useEffect(() => {
    setWaveformReady(false);
  }, [mediaUrl]);

  useEffect(() => {
    setClipCandidates([]);
    setActiveClipId(null);
    setExportScope(null);
    setLastClipExportTracking(null);
    notifiedClipExportTaskIdRef.current = null;
  }, [currentVideoSourcePath]);

  const handleVideoMetadataReady = () => {
    handleLoadedMetadata();
    setWaveformReady(true);
  };

  const clipTimelineRegions: SubtitleSegment[] = clipCandidates.map((candidate) => ({
    id: candidate.id,
    start: candidate.start,
    end: candidate.end,
    text: candidate.title || candidate.reason || "",
  }));
  const selectedClipIds = clipCandidates
    .filter((candidate) => candidate.selected)
    .map((candidate) => candidate.id);
  const activeClip = clipCandidates.find((candidate) => candidate.id === activeClipId) ?? null;
  const hasSubtitleContent = regions.some((region) => region.text.trim().length > 0);
  const lastClipExportTask = lastClipExportTracking?.sourcePath === currentVideoSourcePath
    ? tasks.find((task) => task.id === lastClipExportTracking.taskId) ?? null
    : null;
  const lastClipExportOutputCount = lastClipExportTask?.artifacts?.filter(
    (artifact) => artifact.kind === "video" && artifact.role === "output",
  ).length ?? 0;

  useEffect(() => {
    if (!lastClipExportTask || notifiedClipExportTaskIdRef.current === lastClipExportTask.id) return;
    if (lastClipExportTask.status === "completed") {
      notifiedClipExportTaskIdRef.current = lastClipExportTask.id;
      toast.success(t("clips.exportCompleted", { count: lastClipExportOutputCount }));
    } else if (lastClipExportTask.status === "failed") {
      notifiedClipExportTaskIdRef.current = lastClipExportTask.id;
      toast.error(lastClipExportTask.error || t("clips.exportError"));
    }
  }, [lastClipExportOutputCount, lastClipExportTask, t]);

  const handleOpenLastClipExport = () => {
    if (!lastClipExportTask) return;
    void resolveTaskOutputPath(lastClipExportTask).then((outputPath) => {
      if (outputPath) return fileService.showInExplorer(outputPath);
    });
  };

  const updateClipCandidate = (
    id: string,
    updates: Partial<ClipCandidate>,
  ) => {
    setClipCandidates((current) =>
      current.map((candidate) =>
        candidate.id === id ? { ...candidate, ...updates } : candidate,
      ),
    );
  };

  const handleDetectHighlights = async () => {
    const videoRefForSubmission = resolveCurrentVideoReference();
    if (!videoRefForSubmission) {
      alert(t("clips.missingVideoError"));
      return;
    }
    if (!hasSubtitleContent) {
      toast.warning(t("clips.requiresSubtitlesMessage"));
      setWorkspaceMode("subtitles");
      return;
    }

    setIsDetectingHighlights(true);
    setWorkspaceMode("clips");
    try {
      const response = await editorService.detectHighlightCandidates({
        video_ref: videoRefForSubmission,
        subtitle_segments: regions,
        max_candidates: 6,
        min_duration: 12,
        max_duration: 75,
      });
      setClipCandidates((current) =>
        mergeDetectedClipCandidates(current, response.candidates),
      );
      setActiveClipId((current) => current ?? response.candidates[0]?.id ?? null);
      if (response.candidates.length === 0) {
        toast.warning(t("clips.detectNoCandidates"));
      } else {
        toast.success(t("clips.detectSuccess", { count: response.candidates.length }));
      }
    } catch (error) {
      console.error("[EditorClips] Failed to detect highlights", error);
      toast.error(t("clips.detectError"));
    } finally {
      setIsDetectingHighlights(false);
    }
  };

  const handleClipClick = (id: string) => {
    clipPlaybackEndRef.current = null;
    setActiveClipId(id);
    const clip = clipCandidates.find((candidate) => candidate.id === id);
    if (clip && videoRef.current) {
      videoRef.current.currentTime = clip.start;
    }
  };

  const handleClipRegionClick = (id: string, event?: MouseEvent) => {
    clipPlaybackEndRef.current = null;
    setActiveClipId(id);
    if (event?.ctrlKey || event?.metaKey) {
      updateClipCandidate(id, {
        selected: !(clipCandidates.find((candidate) => candidate.id === id)?.selected ?? false),
      });
    }
    const clip = clipCandidates.find((candidate) => candidate.id === id);
    if (clip && videoRef.current) {
      videoRef.current.currentTime = clip.start;
    }
  };

  const handleClipRegionUpdate = (id: string, start: number, end: number) => {
    updateClipCandidate(id, {
      start: Number(start.toFixed(3)),
      end: Number(end.toFixed(3)),
    });
  };

  const handleToggleClipSelected = (id: string) => {
    const clip = clipCandidates.find((candidate) => candidate.id === id);
    updateClipCandidate(id, { selected: !clip?.selected });
  };

  const handleDeleteClip = (id: string) => {
    setClipCandidates((current) => current.filter((candidate) => candidate.id !== id));
    if (activeClipId === id) {
      const next = clipCandidates.find((candidate) => candidate.id !== id);
      setActiveClipId(next?.id ?? null);
    }
  };

  const addManualClip = (startValue: number, endValue: number, id?: string) => {
    const start = Number(startValue.toFixed(3));
    const end = Number(endValue.toFixed(3));
    if (end <= start) return;

    const candidateId = id ?? `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setClipCandidates((current) => [
      ...current,
      {
        id: candidateId,
        start,
        end,
        title: t("clips.manualClipTitle", { index: current.length + 1 }),
        reason: t("clips.manualClipReason"),
        score: 100,
        transcript: null,
        selected: true,
      },
    ]);
    setActiveClipId(candidateId);
  };

  const handleCreateManualClip = () => {
    const video = videoRef.current;
    const duration = video?.duration ?? 0;
    if (!video || !Number.isFinite(duration) || duration <= 0) {
      toast.warning(t("clips.manualCreateUnavailable"));
      return;
    }

    const defaultDuration = 15;
    const playhead = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    let start = Math.max(0, Math.min(playhead, duration));
    const end = Math.min(duration, start + defaultDuration);
    if (end - start < 1) start = Math.max(0, end - defaultDuration);
    addManualClip(start, end);
    toast.success(t("clips.manualCreateSuccess"));
  };

  const getSelectedClipSegments = () => clipCandidates
    .filter((candidate) => candidate.selected)
    .map((candidate) => ({
      id: candidate.id,
      start: candidate.start,
      end: candidate.end,
      title: candidate.title,
    }));

  const handleConfigureClipExport = () => {
    const videoRefForSubmission = resolveCurrentVideoReference();
    const selectedSegments = getSelectedClipSegments();
    if (!videoRefForSubmission) {
      alert(t("clips.missingVideoError"));
      return;
    }
    if (selectedSegments.length === 0) {
      toast.warning(t("clips.noSelectedClips"));
      return;
    }

    setExportScope({ kind: "clips", segments: selectedSegments });
  };

  const submitClipExport = async (
    segments: ClipExportSegment[],
    submission: VideoExportSubmission,
  ): Promise<boolean> => {
    const videoRefForSubmission = resolveCurrentVideoReference();
    if (!videoRefForSubmission) {
      toast.error(t("clips.missingVideoError"));
      return false;
    }
    const submittedSourcePath = videoRefForSubmission.path;

    try {
      let subtitleRefForSubmission: ReturnType<typeof resolveSubtitleReferenceForSavedPath> | null = null;
      if (submission.subtitleEnabled) {
        let srtPath: string | false = false;
        try {
          srtPath = await saveSubtitleFile(regions);
        } catch (error) {
          console.error("[EditorClips] Failed to save subtitles before clip export", error);
        }
        const sourcePath = currentFilePath || videoRefForSubmission.path;
        if (!srtPath || !sourcePath) {
          toast.error(t("clips.exportSubtitleError"));
          return false;
        }
        subtitleRefForSubmission = resolveSubtitleReferenceForSavedPath({
          currentFilePath: sourcePath,
          currentSubtitlePath,
          currentSubtitleRef,
          savedPath: srtPath,
        });
      }
      const exportPayload = {
        video_ref: videoRefForSubmission,
        render_mode: resolveClipRenderMode(submission),
        srt_ref: subtitleRefForSubmission,
        watermark_path: submission.watermarkPath,
        options: submission.options,
        output_dir: submission.outputDir,
        segments,
      };
      const executionResult = await editorService.exportClipSegments(exportPayload);
      getExecutionSubmission(executionResult);
      const task = createTaskFromExecutionOutcome({
        outcome: executionResult,
        type: "clip_export",
        name: currentFilePath
          ? `Export clips ${currentFilePath.split(/[\\/]/).pop()}`
          : "Export clips",
        request_params: exportPayload,
      });
      addTask(task);
      if (currentVideoSourcePathRef.current === submittedSourcePath) {
        setLastClipExportTracking({
          taskId: task.id,
          sourcePath: submittedSourcePath,
        });
        notifiedClipExportTaskIdRef.current = null;
        toast.success(t("clips.exportQueued", { count: segments.length }));
      }
      return true;
    } catch (error) {
      console.error("[EditorClips] Failed to export clips", error);
      toast.error(t("clips.exportError"));
      return false;
    }
  };

  const handleQuickExportSelectedClips = async () => {
    const videoRefForSubmission = resolveCurrentVideoReference();
    const segments = getSelectedClipSegments();
    if (!videoRefForSubmission) {
      toast.error(t("clips.missingVideoError"));
      return;
    }
    if (segments.length === 0) {
      toast.warning(t("clips.noSelectedClips"));
      return;
    }

    setIsQuickExportingClips(true);
    try {
      const preferences = restoreStoredSynthesisExecutionPreferences();
      const effectivePreferences = {
        ...preferences,
        subtitleEnabled: preferences.subtitleEnabled && hasSubtitleContent,
      };
      const videoElement = videoRef.current;
      const options = buildSynthesisOptionsFromPreferences(effectivePreferences, {
        targetResolution: effectivePreferences.targetResolution.startsWith("sr_")
          ? "original"
          : effectivePreferences.targetResolution,
        videoSize: videoElement
          ? { w: videoElement.videoWidth, h: videoElement.videoHeight }
          : null,
      });
      const watermarkPath = preferences.watermarkEnabled
        ? await resolveSynthesisWatermarkPath(preferences)
        : null;
      await submitClipExport(segments, {
        options,
        outputRef: null,
        outputDir: resolveVideoExportOutputDir(
          videoRefForSubmission.path,
          preferences.lastOutputDir,
          "clips",
        ),
        watermarkPath,
        subtitleEnabled: effectivePreferences.subtitleEnabled,
        watermarkEnabled: preferences.watermarkEnabled,
      });
    } finally {
      setIsQuickExportingClips(false);
    }
  };

  const handleVideoExport = async (
    submission: VideoExportSubmission,
  ): Promise<boolean> => {
    if (!exportScope) return false;
    if (exportScope.kind === "clips") {
      return await submitClipExport(exportScope.segments, submission);
    }

    const videoRefForSubmission = resolveCurrentVideoReference();
    if (!videoRefForSubmission) {
      toast.error(t("synthesis.missingFilesError"));
      return false;
    }

    let subtitleRefForSubmission: ReturnType<typeof resolveSubtitleReferenceForSavedPath> | null = null;
    if (submission.subtitleEnabled) {
      let srtPath: string | false = false;
      try {
        srtPath = await saveSubtitleFile(regions);
      } catch (error) {
        console.error("[EditorPage] Failed to save subtitles before export", error);
      }
      const sourcePath = currentFilePath || videoRefForSubmission.path;
      if (!srtPath || !sourcePath) {
        toast.error(t("clips.exportSubtitleError"));
        return false;
      }
      subtitleRefForSubmission = resolveSubtitleReferenceForSavedPath({
        currentFilePath: sourcePath,
        currentSubtitlePath,
        currentSubtitleRef,
        savedPath: srtPath,
      });
    }

    try {
      const executionResult = await executionService.synthesize({
        video_ref: videoRefForSubmission,
        srt_ref: subtitleRefForSubmission,
        watermark_path: submission.watermarkPath,
        output_ref: submission.outputRef,
        options: submission.options,
      });
      getExecutionSubmission(executionResult);
      addTask(
        createTaskFromExecutionOutcome({
          outcome: executionResult,
          type: "synthesis",
          name: currentFilePath
            ? `Export ${currentFilePath.split(/[\\/]/).pop()}`
            : "Export video",
          request_params: {
            video_ref: videoRefForSubmission,
            srt_ref: subtitleRefForSubmission,
            watermark_path: submission.watermarkPath,
            output_ref: submission.outputRef ?? undefined,
            options: submission.options,
          },
        }),
      );
      return true;
    } catch (error) {
      console.error("[EditorPage] Failed to submit video export", error);
      toast.error(t("synthesis.exportError"));
      return false;
    }
  };

  const handleClipContextMenu = (
    event: MouseEvent,
    id: string,
    regionData?: { start: number; end: number },
  ) => {
    event.preventDefault();
    setActiveClipId(id);
    const clip = clipCandidates.find((candidate) => candidate.id === id);
    if (!clip) {
      if (!regionData || regionData.end <= regionData.start) return;
      setContextMenu({
        position: { x: event.clientX, y: event.clientY },
        targetId: id,
        items: [
          {
            label: t("clips.contextCreateFromSelection"),
            onClick: () => {
              addManualClip(regionData.start, regionData.end, id);
            },
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
            if (videoRef.current) {
              const video = videoRef.current;
              clipPlaybackEndRef.current = clip.end;
              video.currentTime = clip.start;
              void video.play().catch(() => {
                clipPlaybackEndRef.current = null;
              });
            }
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
          onClick: () => {
            handleConfigureClipExport();
          },
        },
        { separator: true, label: "", onClick: () => {} },
        {
          label: t("clips.contextDelete"),
          danger: true,
          onClick: () => handleDeleteClip(id),
        },
      ],
    });
  };

  // ── Render ──────────────────────────────────────────────────
  return (
    <PageShell padded={false} className="flex flex-col">
        <EditorHeader
            mode={workspaceMode}
            onModeChange={setWorkspaceMode}
            onOpenFile={openFile}
            onOpenSubtitle={openSubtitle}
            onSave={handleSave}
            onSaveAs={() => saveSubtitleFile(regions, true)}
            onExport={() => setExportScope({ kind: "full-video" })}
            onTranslate={handleTranslate}
            onDetectHighlights={handleDetectHighlights}
            isDetectingHighlights={isDetectingHighlights}
            canDetectHighlights={hasSubtitleContent}
            canExport={Boolean(currentVideoSourcePath)}
        />

        <div className="flex-1 flex min-h-0 bg-[#0a0a0a] gap-[1px]">
             {/* Left: Subtitle List */}
             <div className="w-[34%] min-w-[340px] max-w-[540px] flex flex-col bg-[#141414]"
                 onDrop={handleSubtitleDrop} onDragOver={handleDragOver}>
                 <div className="flex-1 min-h-0">
                     {workspaceMode === "subtitles" ? (
                        <SubtitleList
                            segments={regions}
                            activeSegmentId={activeSegmentId}
                            autoScroll={autoScroll}
                            selectedIds={selectedIds}
                            scrollResetKey={currentSubtitlePath || currentFilePath}
                            onSegmentClick={(id, multi, shift) => handleRegionClick(id, { ctrlKey: multi, metaKey: false, shiftKey: shift, seek: false })}
                            onSegmentDelete={(id) => deleteSegments([id])}
                            onSegmentMerge={(ids) => mergeSegments(ids)}
                            onSegmentDoubleClick={(id) => {
                                const seg = regions.find(r => r.id === id);
                                if (seg && videoRef.current) videoRef.current.currentTime = seg.start;
                            }}
                            onContextMenu={handleContextMenu}
                            onSmartSplit={handleSmartSplit}
                            isSmartSplitting={isSmartSplitting}
                            onAutoFix={(newSegments) => replaceRegionsWithUndo(newSegments)}
                            searchTerm={searchTerm}
                            matchCase={matchCase}
                        />
                     ) : (
                        <ClipCandidateList
                            candidates={clipCandidates}
                            activeClipId={activeClipId}
                            isDetecting={isDetectingHighlights}
                            isExporting={isQuickExportingClips}
                            exportTask={lastClipExportTask ? {
                                status: lastClipExportTask.status,
                                progress: lastClipExportTask.progress,
                                message: lastClipExportTask.message,
                                error: lastClipExportTask.error,
                                outputCount: lastClipExportOutputCount,
                                onOpenOutput: handleOpenLastClipExport,
                            } : null}
                            canDetect={hasSubtitleContent}
                            canCreate={Boolean(currentVideoSourcePath && waveformReady)}
                            onDetect={handleDetectHighlights}
                            onCreateClip={handleCreateManualClip}
                            onConfigureExport={handleConfigureClipExport}
                            onQuickExport={handleQuickExportSelectedClips}
                            onClipClick={handleClipClick}
                            onToggleSelected={handleToggleClipSelected}
                            onDeleteClip={handleDeleteClip}
                        />
                     )}
                 </div>

                 {/* Detail Editor */}
                 {workspaceMode === "clips" ? (
                    activeClip ? (
                        <div className="h-28 bg-[#151515] p-2 flex flex-col gap-1 border-t border-white/5 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.5)] z-20">
                            <div className="flex justify-between items-center text-[10px] px-1 select-none">
                                <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full ${activeClip.selected ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                                    <span className="font-bold text-slate-400 tracking-wider uppercase opacity-80">
                                        {t('clips.detailTitle')}
                                    </span>
                                </div>
                                <span className="font-mono text-amber-300/90 bg-amber-500/5 px-1 py-0 rounded border border-amber-500/10 text-[9px]">
                                    {(activeClip.end - activeClip.start).toFixed(2)}s · {activeClip.score.toFixed(1)}
                                </span>
                            </div>
                            <input
                                value={activeClip.title || ""}
                                onChange={(event) => updateClipCandidate(activeClip.id, { title: event.target.value })}
                                className="h-8 w-full bg-black/20 border border-white/5 rounded-lg px-2 text-sm focus:outline-none focus:border-amber-500/50 focus:bg-black/40 transition-all font-medium text-slate-200 placeholder-slate-600/50"
                                placeholder={t('clips.titlePlaceholder')}
                            />
                            <p className="min-h-0 flex-1 overflow-hidden px-1 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] text-[11px] leading-relaxed text-slate-500">
                                {activeClip.transcript || activeClip.reason || t('clips.noReason')}
                            </p>
                        </div>
                    ) : (
                        <div className="h-28 bg-[#151515] p-2 flex flex-col items-center justify-center border-t border-white/5 z-20 text-slate-700/50 text-xs italic pointer-events-none select-none">
                            {t('clips.noSelection')}
                        </div>
                    )
                 ) : displaySegment ? (
                    <div className="h-28 bg-[#151515] p-2 flex flex-col gap-1 border-t border-white/5 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.5)] z-20">
                         <div className="flex justify-between items-center text-[10px] px-1 select-none">
                             <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full ${activeSegmentId ? 'bg-indigo-500 animate-pulse' : 'bg-slate-500'}`} />
                                <span className="font-bold text-slate-400 tracking-wider uppercase opacity-80">
                                   {activeSegmentId ? t('detailEditor.editingSelection') : t('detailEditor.editingDefault')}
                                </span>
                             </div>
                             <span className="font-mono text-indigo-400/80 bg-indigo-500/5 px-1 py-0 rounded border border-indigo-500/10 text-[9px]">
                                {((displaySegment.end - displaySegment.start).toFixed(2))}s
                             </span>
                         </div>
                         <textarea
                            value={displaySegment.text}
                            onChange={(e) => handleDetailUpdate('text', e.target.value)}
                            className="flex-1 w-full bg-black/20 border border-white/5 rounded-lg p-2 text-sm resize-none focus:outline-none focus:border-indigo-500/50 focus:bg-black/40 transition-all font-medium leading-normal text-slate-200 placeholder-slate-600/50"
                            placeholder={t('detailEditor.placeholder')}
                         />
                    </div>
                 ) : (
                    <div className="h-28 bg-[#151515] p-2 flex flex-col items-center justify-center border-t border-white/5 z-20 text-slate-700/50 text-xs italic pointer-events-none select-none">
                        {t('detailEditor.noSelection')}
                    </div>
                 )}
             </div>

             {/* Right: Video Preview */}
             <div className="flex-1 min-w-0 bg-[#101010] relative flex flex-col justify-center"
                 onDrop={handleVideoDrop} onDragOver={handleDragOver}>
                <VideoPreview
                    mediaUrl={mediaUrl}
                    videoRef={videoRef}
                    regions={regions}
                    onLoadedMetadata={handleVideoMetadataReady}
                />
             </div>
        </div>

        {/* Bottom: Waveform Timeline */}
        <div className="h-44 bg-[#101010] border-t border-white/5 relative z-30 shrink-0">
             {mediaUrl && waveformReady && (
               <Suspense fallback={null}>
                 <WaveformPlayer
                    mediaUrl={mediaUrl}
                    videoRef={videoRef}
                    regions={workspaceMode === "clips" ? clipTimelineRegions : regions}
                    onRegionUpdate={workspaceMode === "clips" ? handleClipRegionUpdate : handleRegionUpdateCallback}
                     onRegionClick={workspaceMode === "clips" ? handleClipRegionClick : handleRegionClick}
                     onContextMenu={workspaceMode === "clips" ? handleClipContextMenu : handleContextMenu}
                     selectedIds={workspaceMode === "clips" ? selectedClipIds : selectedIds}
                     activeSegmentId={workspaceMode === "clips" ? activeClipId : activeSegmentId}
                     autoScroll={autoScroll}
                     onInteractStart={workspaceMode === "clips" ? undefined : snapshot}
                 />
               </Suspense>
             )}
        </div>

        <ContextMenu
            items={contextMenu?.items || []}
            position={contextMenu?.position || null}
            onClose={() => setContextMenu(null)}
        />

        <FindReplaceDialog
            isOpen={showFindReplace.isOpen}
            initialMode={showFindReplace.mode}
            onClose={handleCloseFindReplace}
            regions={regions}
            onSelectSegment={handleFindReplaceSelectSegment}
            onUpdateSegment={handleFindReplaceUpdateSegment}
            onUpdateSegments={updateSegments}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            matchCase={matchCase}
            setMatchCase={setMatchCase}
        />

        {exportScope && (
            <Suspense fallback={null}>
                <VideoExportDialog
                    isOpen={Boolean(exportScope)}
                    onClose={() => setExportScope(null)}
                    regions={regions}
                    videoPath={currentFilePath || (mediaUrl ? mediaUrl.replace('file:///', '') : null)}
                    mediaUrl={mediaUrl}
                    exportScope={exportScope}
                    onExport={handleVideoExport}
                />
            </Suspense>
        )}
    </PageShell>
  );
}
