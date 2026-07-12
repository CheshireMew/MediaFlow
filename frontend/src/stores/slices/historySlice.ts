import type { StateCreator } from "zustand";
import type { SubtitleSegment } from "../../types/task";
import type { EditorState } from "../editorStore";

export interface EditorHistoryEntry {
  regions: SubtitleSegment[];
  revision: number;
}

export interface HistorySlice {
  past: EditorHistoryEntry[];
  future: EditorHistoryEntry[];

  undo: () => void;
  redo: () => void;
  snapshot: () => void;
}

const MAX_HISTORY_SIZE = 50;

export const createHistorySlice: StateCreator<
  EditorState,
  [],
  [],
  HistorySlice
> = (set) => ({
  past: [],
  future: [],

  snapshot: () => {
    set((state) => {
      const newPast = [
        ...state.past,
        {
          regions: state.document.regions,
          revision: state.document.revision,
        },
      ];
      if (newPast.length > MAX_HISTORY_SIZE) {
        newPast.shift(); // Keep size in check
      }
      return {
        past: newPast,
        future: [],
      };
    });
  },

  undo: () => {
    set((state) => {
      if (state.past.length === 0) return {};
      const newPast = [...state.past];
      const previous = newPast.pop();
      if (previous) {
        return {
          document: {
            ...state.document,
            regions: previous.regions,
            revision: previous.revision,
          },
          past: newPast,
          future: [
            {
              regions: state.document.regions,
              revision: state.document.revision,
            },
            ...state.future,
          ],
        };
      }
      return {};
    });
  },

  redo: () => {
    set((state) => {
      if (state.future.length === 0) return {};
      const newFuture = [...state.future];
      const next = newFuture.shift();
      if (next) {
        const newPast = [
          ...state.past,
          {
            regions: state.document.regions,
            revision: state.document.revision,
          },
        ];
        if (newPast.length > MAX_HISTORY_SIZE) {
          newPast.shift();
        }
        return {
          document: {
            ...state.document,
            regions: next.regions,
            revision: next.revision,
          },
          past: newPast,
          future: newFuture,
        };
      }
      return {};
    });
  },
});
