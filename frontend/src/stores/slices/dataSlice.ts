import type { StateCreator } from "zustand";
import type { SubtitleSegment } from "../../types/task";
import type { MediaReference } from "../../services/ui/mediaReference";
import { splitSubtitleSegment } from "../../utils/subtitleSplit";
import type { EditorState } from "../editorStore";

export interface DataSlice {
  regions: SubtitleSegment[];
  mediaUrl: string | null;
  currentFilePath: string | null;
  currentSubtitlePath: string | null;
  currentFileRef: MediaReference | null;
  currentSubtitleRef: MediaReference | null;

  setRegions: (regions: SubtitleSegment[]) => void;
  replaceRegionsWithUndo: (regions: SubtitleSegment[]) => void;
  replaceEditorDocument: (regions: SubtitleSegment[]) => void;
  setMediaUrl: (url: string | null) => void;
  setCurrentFilePath: (path: string | null) => void;
  setCurrentSubtitlePath: (path: string | null) => void;
  setCurrentFileRef: (reference: MediaReference | null) => void;
  setCurrentSubtitleRef: (reference: MediaReference | null) => void;

  // Complex Data Actions
  deleteSegments: (ids: string[]) => void;
  mergeSegments: (ids: string[]) => void;
  splitSegment: (currentTime: number, targetId?: string) => void;
  addSegment: (segment: SubtitleSegment) => void;
  addSegments: (segments: SubtitleSegment[]) => void;
  updateSegments: (
    segments: Array<Pick<SubtitleSegment, "id"> & Partial<SubtitleSegment>>,
  ) => void;
  updateRegion: (id: string, updates: Partial<SubtitleSegment>) => void;
  updateRegionText: (id: string, text: string) => void;
}

export const createDataSlice: StateCreator<EditorState, [], [], DataSlice> = (
  set,
  get,
) => ({
  regions: [],
  mediaUrl: null,
  currentFilePath: null,
  currentSubtitlePath: null,
  currentFileRef: null,
  currentSubtitleRef: null,

  setRegions: (regions) => set({ regions }),
  replaceRegionsWithUndo: (regions) => {
    get().snapshot();
    set({ regions });
  },
  replaceEditorDocument: (regions) =>
    set({
      regions,
      activeSegmentId: null,
      selectedIds: [],
      past: [],
      future: [],
    }),
  setMediaUrl: (url) => set({ mediaUrl: url }),
  setCurrentFilePath: (path) => set({ currentFilePath: path }),
  setCurrentSubtitlePath: (path) => set({ currentSubtitlePath: path }),
  setCurrentFileRef: (reference) => set({ currentFileRef: reference }),
  setCurrentSubtitleRef: (reference) => set({ currentSubtitleRef: reference }),

  deleteSegments: (ids) => {
    if (ids.length === 0) return;
    get().snapshot();
    set((state) => {
      const newRegions = state.regions.filter(
        (r) => !ids.includes(String(r.id)),
      );
      const newSelected = state.selectedIds.filter((id) => !ids.includes(id));
      const newActive =
        state.activeSegmentId && ids.includes(state.activeSegmentId)
          ? null
          : state.activeSegmentId;
      return {
        regions: newRegions,
        selectedIds: newSelected,
        activeSegmentId: newActive,
      };
    });
  },

  mergeSegments: (ids) => {
    if (ids.length < 2) return;
    const state = get();
    const selected = state.regions.filter((r) => ids.includes(String(r.id)));
    if (selected.length < 2) return;

    // Continuity Check
    const indices = selected
      .map((s) => state.regions.findIndex((r) => r.id === s.id))
      .sort((a, b) => a - b);

    for (let i = 0; i < indices.length - 1; i++) {
      if (indices[i + 1] !== indices[i] + 1) {
        alert(
          "Cannot merge non-continuous segments. Please select adjacent subtitles.",
        );
        return;
      }
    }

    get().snapshot();

    // Perform Merge
    selected.sort((a, b) => a.start - b.start);
    const first = selected[0];
    const last = selected[selected.length - 1];
    const mergedText = selected.map((s) => s.text).join(" ");

    const newSegment = {
      ...first,
      end: last.end,
      text: mergedText,
    };

    set((state) => {
      const filtered = state.regions.filter((r) => !ids.includes(String(r.id)));
      const newRegions = [...filtered, newSegment].sort(
        (a, b) => a.start - b.start,
      );
      const newId = String(newSegment.id);
      return {
        regions: newRegions,
        selectedIds: [newId],
        activeSegmentId: newId,
      };
    });
  },

  splitSegment: (currentTime, targetId) => {
    const state = get();
    const idToSplit = targetId || state.activeSegmentId;
    if (!idToSplit) return;

    const segment = state.regions.find((r) => r.id === idToSplit);
    if (!segment) return;

    const split = splitSubtitleSegment(segment, {
      currentTime,
      fallbackToMidpoint: true,
    });
    if (!split) return;

    get().snapshot();

    const part1 = {
      ...split.parts[0],
      id: segment.id + "_1",
    };
    const part2 = {
      ...split.parts[1],
      id: segment.id + "_2",
    };

    set((state) => {
      const filtered = state.regions.filter((r) => r.id !== idToSplit);
      const newRegions = [...filtered, part1, part2].sort(
        (a, b) => a.start - b.start,
      );
      return {
        regions: newRegions,
        activeSegmentId: String(part2.id),
        selectedIds: [String(part2.id)],
      };
    });
  },

  addSegment: (segment) => {
    get().snapshot();
    set((state) => {
      const newRegions = [...state.regions, segment].sort(
        (a, b) => a.start - b.start,
      );
      return {
        regions: newRegions,
        activeSegmentId: String(segment.id),
        selectedIds: [String(segment.id)],
      };
    });
  },

  addSegments: (segments) => {
    if (segments.length === 0) return;
    get().snapshot();
    set((state) => {
      const newRegions = [...state.regions, ...segments].sort(
        (a, b) => a.start - b.start,
      );
      const newIds = segments.map((s) => String(s.id));
      return {
        regions: newRegions,
        activeSegmentId: newIds[0],
        selectedIds: newIds,
      };
    });
  },

  updateSegments: (segments) => {
    if (segments.length === 0) return;
    get().snapshot();
    set((state) => {
      const updateMap = new Map(segments.map((s) => [String(s.id), s]));
      const newRegions = state.regions.map((r) => {
        const update = updateMap.get(String(r.id));
        return update ? { ...r, ...update } : r;
      });
      return { regions: newRegions };
    });
  },

  updateRegion: (id, updates) => {
    set((state) => ({
      regions: state.regions.map((r) =>
        String(r.id) === String(id) ? { ...r, ...updates } : r,
      ),
    }));
  },

  updateRegionText: (id, text) => {
    const state = get();
    const target = state.regions.find((r) => String(r.id) === String(id));
    if (target && target.text !== text) {
      state.snapshot();
      set((currentState) => ({
        regions: currentState.regions.map((r) =>
          String(r.id) === String(id) ? { ...r, text } : r,
        ),
      }));
    }
  },
});
