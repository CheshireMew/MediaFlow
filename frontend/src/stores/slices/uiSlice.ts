import type { StateCreator } from "zustand";
import type { EditorState } from "../editorStore";

export interface UISlice {
  activeSegmentId: string | null;
  selectedIds: string[];

  setActiveSegmentId: (id: string | null) => void;
  setSelectedIds: (ids: string[]) => void;
  selectSegment: (id: string, multi: boolean, range: boolean) => void;
}

export const createUISlice: StateCreator<EditorState, [], [], UISlice> = (
  set,
  get,
) => ({
  activeSegmentId: null,
  selectedIds: [],

  setActiveSegmentId: (id) => set({ activeSegmentId: id }),
  setSelectedIds: (ids) => set({ selectedIds: ids }),

  selectSegment: (id, multi, range) => {
    const state = get();
    if (range && state.activeSegmentId) {
      const startIdx = state.regions.findIndex(
        (r) => r.id === state.activeSegmentId,
      );
      const endIdx = state.regions.findIndex((r) => r.id === id);

      if (startIdx !== -1 && endIdx !== -1) {
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        const rangeIds = state.regions
          .slice(min, max + 1)
          .map((r) => String(r.id));
        set({ selectedIds: rangeIds, activeSegmentId: id });
      }
    } else if (multi) {
      const prevIds = state.selectedIds;
      if (prevIds.includes(id)) {
        const newVal = prevIds.filter((i) => i !== id);
        let newActive = state.activeSegmentId;
        if (id === state.activeSegmentId) {
          newActive = newVal.length > 0 ? newVal[newVal.length - 1] : null;
        }
        set({ selectedIds: newVal, activeSegmentId: newActive });
      } else {
        set({ selectedIds: [...prevIds, id], activeSegmentId: id });
      }
    } else {
      set({ activeSegmentId: id, selectedIds: [id] });
    }
  },
});
