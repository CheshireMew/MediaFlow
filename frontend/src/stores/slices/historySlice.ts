import type { StateCreator } from "zustand";
import type { SubtitleSegment } from "../../types/task";
import type { EditorState } from "../editorStore";

export interface HistorySlice {
  past: SubtitleSegment[][];
  future: SubtitleSegment[][];

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
      const newPast = [...state.past, state.regions];
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
          regions: previous,
          past: newPast,
          future: [state.regions, ...state.future],
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
        const newPast = [...state.past, state.regions];
        if (newPast.length > MAX_HISTORY_SIZE) {
          newPast.shift();
        }
        return {
          regions: next,
          past: newPast,
          future: newFuture,
        };
      }
      return {};
    });
  },
});
