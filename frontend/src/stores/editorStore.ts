import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDataSlice, type DataSlice } from "./slices/dataSlice";
import { createUISlice, type UISlice } from "./slices/uiSlice";
import { createHistorySlice, type HistorySlice } from "./slices/historySlice";
import type { MediaReference } from "../services/ui/mediaReference";

export type EditorState = DataSlice & UISlice & HistorySlice;

export const useEditorStore = create<EditorState>()(
  persist(
    (...a) => ({
      ...createDataSlice(...a),
      ...createUISlice(...a),
      ...createHistorySlice(...a),
    }),
    {
      name: "editor-storage",
      version: 1,
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as Partial<EditorState>;
        return {
          regions: Array.isArray(state.regions) ? state.regions : [],
          activeSegmentId:
            typeof state.activeSegmentId === "string" ? state.activeSegmentId : null,
          selectedIds: Array.isArray(state.selectedIds) ? state.selectedIds : [],
          mediaUrl: typeof state.mediaUrl === "string" ? state.mediaUrl : null,
          currentFilePath:
            typeof state.currentFilePath === "string" ? state.currentFilePath : null,
          currentSubtitlePath:
            typeof state.currentSubtitlePath === "string"
              ? state.currentSubtitlePath
              : null,
          currentFileRef:
            state.currentFileRef && typeof state.currentFileRef === "object"
              ? (state.currentFileRef as MediaReference)
              : null,
          currentSubtitleRef:
            state.currentSubtitleRef && typeof state.currentSubtitleRef === "object"
              ? (state.currentSubtitleRef as MediaReference)
              : null,
        };
      },
      partialize: (state) => ({
        // Snapshot editor document context only. Playback/runtime interaction is rebuilt on load.
        regions: state.regions,
        activeSegmentId: state.activeSegmentId,
        selectedIds: state.selectedIds,
        mediaUrl: state.mediaUrl,
        currentFilePath: state.currentFilePath,
        currentSubtitlePath: state.currentSubtitlePath,
        currentFileRef: state.currentFileRef,
        currentSubtitleRef: state.currentSubtitleRef,
      }),
    },
  ),
);
