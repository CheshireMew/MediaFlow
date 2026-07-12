import { mergeDetectedClipCandidates, type VideoExportScope } from "../../services/domain";
import type { ClipExportSegment } from "../../types/api";
import type { ClipCandidate, SubtitleSegment, Task } from "../../types/task";

export type ClipExportScope = Extract<VideoExportScope, { kind: "clips" }>;

export interface EditorClipWorkspaceState {
  candidates: ClipCandidate[];
  activeClipId: string | null;
  exportScope: ClipExportScope | null;
  isDetectingHighlights: boolean;
  isQuickExportingClips: boolean;
  lastExportTaskId: string | null;
}

export type EditorClipWorkspaceAction =
  | { type: "reset" }
  | { type: "set-detecting"; value: boolean }
  | { type: "merge-detected"; candidates: ClipCandidate[] }
  | { type: "set-active"; id: string | null }
  | { type: "update-candidate"; id: string; updates: Partial<ClipCandidate> }
  | { type: "add-candidate"; candidate: ClipCandidate }
  | { type: "delete-candidate"; id: string }
  | { type: "open-export"; segments: ClipExportSegment[] }
  | { type: "close-export" }
  | { type: "set-quick-exporting"; value: boolean }
  | { type: "track-export"; taskId: string };

export function createEditorClipWorkspaceState(): EditorClipWorkspaceState {
  return {
    candidates: [],
    activeClipId: null,
    exportScope: null,
    isDetectingHighlights: false,
    isQuickExportingClips: false,
    lastExportTaskId: null,
  };
}

export function editorClipWorkspaceReducer(
  state: EditorClipWorkspaceState,
  action: EditorClipWorkspaceAction,
): EditorClipWorkspaceState {
  switch (action.type) {
    case "reset":
      return createEditorClipWorkspaceState();
    case "set-detecting":
      return { ...state, isDetectingHighlights: action.value };
    case "merge-detected":
      return {
        ...state,
        candidates: mergeDetectedClipCandidates(state.candidates, action.candidates),
        activeClipId: state.activeClipId ?? action.candidates[0]?.id ?? null,
      };
    case "set-active":
      return { ...state, activeClipId: action.id };
    case "update-candidate":
      return {
        ...state,
        candidates: state.candidates.map((candidate) =>
          candidate.id === action.id
            ? { ...candidate, ...action.updates }
            : candidate,
        ),
      };
    case "add-candidate":
      return {
        ...state,
        candidates: [...state.candidates, action.candidate],
        activeClipId: action.candidate.id,
      };
    case "delete-candidate": {
      const candidates = state.candidates.filter(
        (candidate) => candidate.id !== action.id,
      );
      return {
        ...state,
        candidates,
        activeClipId:
          state.activeClipId === action.id
            ? candidates[0]?.id ?? null
            : state.activeClipId,
      };
    }
    case "open-export":
      return {
        ...state,
        exportScope: { kind: "clips", segments: action.segments },
      };
    case "close-export":
      return { ...state, exportScope: null };
    case "set-quick-exporting":
      return { ...state, isQuickExportingClips: action.value };
    case "track-export":
      return { ...state, lastExportTaskId: action.taskId };
  }
}

export function getSelectedClipSegments(
  candidates: ClipCandidate[],
): ClipExportSegment[] {
  return candidates
    .filter((candidate) => candidate.selected)
    .map((candidate) => ({
      id: candidate.id,
      start: candidate.start,
      end: candidate.end,
      title: candidate.title,
    }));
}

export function getClipTimelineRegions(
  candidates: ClipCandidate[],
): SubtitleSegment[] {
  return candidates.map((candidate) => ({
    id: candidate.id,
    start: candidate.start,
    end: candidate.end,
    text: candidate.title || candidate.reason || "",
  }));
}

export function resolveManualClipRange(
  currentTime: number,
  duration: number,
  defaultDuration = 15,
): { start: number; end: number } | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;

  const playhead = Number.isFinite(currentTime) ? currentTime : 0;
  let start = Math.max(0, Math.min(playhead, duration));
  const end = Math.min(duration, start + defaultDuration);
  if (end - start < 1) {
    start = Math.max(0, end - defaultDuration);
  }
  if (end <= start) return null;
  return {
    start: Number(start.toFixed(3)),
    end: Number(end.toFixed(3)),
  };
}

export function countClipExportOutputs(task: Pick<Task, "artifacts">): number {
  return task.artifacts?.filter(
    (artifact) => artifact.kind === "video" && artifact.role === "output",
  ).length ?? 0;
}
