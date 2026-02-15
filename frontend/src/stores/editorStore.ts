import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createDataSlice, type DataSlice } from "./slices/dataSlice";
import { createUISlice, type UISlice } from "./slices/uiSlice";
import { createHistorySlice, type HistorySlice } from "./slices/historySlice";
import {
  createPreprocessingSlice,
  type PreprocessingSlice,
} from "./slices/preprocessingSlice";

export type EditorState = DataSlice &
  UISlice &
  HistorySlice &
  PreprocessingSlice;

export const useEditorStore = create<EditorState>()(
  persist(
    (...a) => ({
      ...createDataSlice(...a),
      ...createUISlice(...a),
      ...createHistorySlice(...a),
      ...createPreprocessingSlice(...a),
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

        // Preprocessing persistence
        preprocessingActiveTool: state.preprocessingActiveTool,
        enhanceModel: state.enhanceModel,
        ocrEngine: state.ocrEngine,
        preprocessingFiles: state.preprocessingFiles,
        preprocessingVideoPath: state.preprocessingVideoPath,
      }),
    },
  ),
);
