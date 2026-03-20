import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDataSlice, type DataSlice } from "./slices/dataSlice";
import { createUISlice, type UISlice } from "./slices/uiSlice";
import { createHistorySlice, type HistorySlice } from "./slices/historySlice";

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
      partialize: (state) => ({
        // ... existing persistence
        regions: state.regions,
        activeSegmentId: state.activeSegmentId,
        selectedIds: state.selectedIds,
        mediaUrl: state.mediaUrl,
        currentFilePath: state.currentFilePath,
        currentSubtitlePath: state.currentSubtitlePath,
      }),
    },
  ),
);
