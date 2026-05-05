import { create } from "zustand";
import { createDataSlice, type DataSlice } from "./slices/dataSlice";
import { createUISlice, type UISlice } from "./slices/uiSlice";
import { createHistorySlice, type HistorySlice } from "./slices/historySlice";
import type { MediaReference } from "../services/ui/mediaReference";
import { readUiStateValue, writeUiStateValue } from "../services/persistence/uiStateSettings";

export type EditorState = DataSlice & UISlice & HistorySlice;

const EDITOR_STORE_KEY = "editor-storage";

type EditorSnapshot = Pick<
  EditorState,
  | "regions"
  | "activeSegmentId"
  | "selectedIds"
  | "mediaUrl"
  | "currentFilePath"
  | "currentSubtitlePath"
  | "currentFileRef"
  | "currentSubtitleRef"
>;

function normalizeEditorSnapshot(
  payload: Partial<EditorSnapshot> | null | undefined,
): EditorSnapshot {
  return {
    regions: Array.isArray(payload?.regions) ? payload.regions : [],
    activeSegmentId:
      typeof payload?.activeSegmentId === "string" ? payload.activeSegmentId : null,
    selectedIds: Array.isArray(payload?.selectedIds) ? payload.selectedIds : [],
    mediaUrl: typeof payload?.mediaUrl === "string" ? payload.mediaUrl : null,
    currentFilePath:
      typeof payload?.currentFilePath === "string" ? payload.currentFilePath : null,
    currentSubtitlePath:
      typeof payload?.currentSubtitlePath === "string"
        ? payload.currentSubtitlePath
        : null,
    currentFileRef:
      payload?.currentFileRef && typeof payload.currentFileRef === "object"
        ? (payload.currentFileRef as MediaReference)
        : null,
    currentSubtitleRef:
      payload?.currentSubtitleRef && typeof payload.currentSubtitleRef === "object"
        ? (payload.currentSubtitleRef as MediaReference)
        : null,
  };
}

function readEditorSnapshot() {
  return normalizeEditorSnapshot(
    readUiStateValue<Partial<EditorSnapshot>>(EDITOR_STORE_KEY),
  );
}

function persistEditorSnapshot(state: EditorState) {
  writeUiStateValue(EDITOR_STORE_KEY, {
    regions: state.regions,
    activeSegmentId: state.activeSegmentId,
    selectedIds: state.selectedIds,
    mediaUrl: state.mediaUrl,
    currentFilePath: state.currentFilePath,
    currentSubtitlePath: state.currentSubtitlePath,
    currentFileRef: state.currentFileRef,
    currentSubtitleRef: state.currentSubtitleRef,
  } satisfies EditorSnapshot);
}

const initialEditorSnapshot = readEditorSnapshot();

export const useEditorStore = create<EditorState>()((...a) => ({
  ...createDataSlice(...a),
  ...createUISlice(...a),
  ...createHistorySlice(...a),
  ...initialEditorSnapshot,
}));

useEditorStore.subscribe(persistEditorSnapshot);
