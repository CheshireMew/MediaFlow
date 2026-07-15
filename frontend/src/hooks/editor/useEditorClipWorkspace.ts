import { useCallback, useEffect, useMemo, useReducer, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";

import type { EditorWorkspaceMode } from "../../components/editor/EditorHeader";
import { editorService } from "../../services/domain";
import type { EditorDocument } from "../../stores/editorDocument";
import type { ClipCandidate } from "../../types/task";
import { toast } from "../../utils/toast";
import {
  createEditorClipWorkspaceState,
  editorClipWorkspaceReducer,
  getClipTimelineRegions,
  getSelectedClipSegments,
  resolveManualClipRange,
} from "./editorClipWorkspace";
import type { EditorContextMenuState } from "./editorClipTypes";
import { useClipContextMenu } from "./useClipContextMenu";
import { useClipExport, type SaveSubtitleFile } from "./useClipExport";
import { useClipPlayback } from "./useClipPlayback";

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
  const [workspaceMode, setWorkspaceMode] = useState<EditorWorkspaceMode>("subtitles");
  const [state, dispatch] = useReducer(
    editorClipWorkspaceReducer,
    undefined,
    createEditorClipWorkspaceState,
  );
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
    () => state.candidates.filter((candidate) => candidate.selected).map((candidate) => candidate.id),
    [state.candidates],
  );
  const activeClip = useMemo(
    () => state.candidates.find((candidate) => candidate.id === state.activeClipId) ?? null,
    [state.activeClipId, state.candidates],
  );
  const playback = useClipPlayback({ mediaUrl, workspaceMode, videoElementRef });
  const clipExport = useClipExport({
    document,
    selectedSegments,
    hasSubtitleContent,
    videoElementRef,
    saveSubtitleFile,
    lastExportTaskId: state.lastExportTaskId,
    dispatch,
  });

  useEffect(() => {
    dispatch({ type: "reset" });
  }, [document.video]);

  const updateClipCandidate = useCallback((id: string, updates: Partial<ClipCandidate>) => {
    dispatch({ type: "update-candidate", id, updates });
  }, []);

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
      if (response.candidates.length === 0) toast.warning(t("clips.detectNoCandidates"));
      else toast.success(t("clips.detectSuccess", { count: response.candidates.length }));
    } catch (error) {
      console.error("[EditorClips] Failed to detect highlights", error);
      toast.error(t("clips.detectError"));
    } finally {
      dispatch({ type: "set-detecting", value: false });
    }
  }, [document.regions, document.video, hasSubtitleContent, t]);

  const handleClipClick = useCallback((id: string) => {
    dispatch({ type: "set-active", id });
    const clip = state.candidates.find((candidate) => candidate.id === id);
    if (clip) playback.seek(clip.start);
  }, [playback, state.candidates]);

  const handleClipRegionClick = useCallback((id: string, event?: MouseEvent) => {
    dispatch({ type: "set-active", id });
    const clip = state.candidates.find((candidate) => candidate.id === id);
    if (event?.ctrlKey || event?.metaKey) {
      updateClipCandidate(id, { selected: !(clip?.selected ?? false) });
    }
    if (clip) playback.seek(clip.start);
  }, [playback, state.candidates, updateClipCandidate]);

  const handleClipRegionUpdate = useCallback((id: string, start: number, end: number) => {
    updateClipCandidate(id, { start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) });
  }, [updateClipCandidate]);

  const handleToggleClipSelected = useCallback((id: string) => {
    const clip = state.candidates.find((candidate) => candidate.id === id);
    updateClipCandidate(id, { selected: !clip?.selected });
  }, [state.candidates, updateClipCandidate]);

  const handleDeleteClip = useCallback((id: string) => {
    dispatch({ type: "delete-candidate", id });
  }, []);

  const addManualClip = useCallback((startValue: number, endValue: number, id?: string) => {
    const start = Number(startValue.toFixed(3));
    const end = Number(endValue.toFixed(3));
    if (end <= start) return;
    dispatch({
      type: "add-candidate",
      candidate: {
        id: id ?? `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
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
    const range = video ? resolveManualClipRange(video.currentTime, video.duration) : null;
    if (!range) {
      toast.warning(t("clips.manualCreateUnavailable"));
      return;
    }
    addManualClip(range.start, range.end);
    toast.success(t("clips.manualCreateSuccess"));
  }, [addManualClip, t, videoElementRef]);

  const handleClipContextMenu = useClipContextMenu({
    candidates: state.candidates,
    dispatch,
    setContextMenu,
    addManualClip,
    toggleSelected: handleToggleClipSelected,
    configureExport: clipExport.configure,
    deleteClip: handleDeleteClip,
    playClip: playback.play,
  });

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
    exportTask: clipExport.exportTask,
    canCreateClip: Boolean(document.video && waveformReady),
    updateClipCandidate,
    handleDetectHighlights,
    handleClipClick,
    handleClipRegionClick,
    handleClipRegionUpdate,
    handleToggleClipSelected,
    handleDeleteClip,
    handleCreateManualClip,
    handleConfigureClipExport: clipExport.configure,
    handleQuickExportSelectedClips: clipExport.quickExport,
    handleClipContextMenu,
    closeClipExport: clipExport.close,
    submitClipExport: clipExport.submit,
  };
}
