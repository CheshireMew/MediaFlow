import type { StateCreator } from "zustand";
import type { SubtitleSegment } from "../../types/task";
import { getBestSplitIndex } from "../../utils/textSplitter";
import type { EditorState } from "../editorStore";

export interface DataSlice {
  regions: SubtitleSegment[];
  mediaUrl: string | null;
  currentFilePath: string | null;
  currentSubtitlePath: string | null;

  setRegions: (regions: SubtitleSegment[]) => void;
  setMediaUrl: (url: string | null) => void;
  setCurrentFilePath: (path: string | null) => void;
  setCurrentSubtitlePath: (path: string | null) => void;

  // Complex Data Actions
  deleteSegments: (ids: string[]) => void;
  mergeSegments: (ids: string[]) => void;
  splitSegment: (currentTime: number, targetId?: string) => void;
  addSegment: (segment: SubtitleSegment) => void;
  addSegments: (segments: SubtitleSegment[]) => void;
  updateSegments: (segments: SubtitleSegment[]) => void;
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

  setRegions: (regions) => set({ regions }),
  setMediaUrl: (url) => set({ mediaUrl: url }),
  setCurrentFilePath: (path) => set({ currentFilePath: path }),
  setCurrentSubtitlePath: (path) => set({ currentSubtitlePath: path }),

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

    const text = segment.text || "";
    const duration = segment.end - segment.start;
    const isPlayheadInside =
      currentTime > segment.start + 0.1 && currentTime < segment.end - 0.1;

    let splitTime = 0;
    let splitIndex = -1;

    const smartIndex = getBestSplitIndex(text);

    if (smartIndex !== -1 && smartIndex !== Math.floor(text.length / 2)) {
      splitIndex = smartIndex;
      const ratio = splitIndex / text.length;
      splitTime = segment.start + duration * ratio;
    } else {
      if (isPlayheadInside) {
        splitTime = currentTime;
        const ratio = (currentTime - segment.start) / duration;
        splitIndex = Math.floor(text.length * ratio);
      } else {
        splitTime = segment.start + duration / 2;
        splitIndex = Math.floor(text.length / 2);
      }
    }

    get().snapshot();

    const text1 = text.substring(0, splitIndex).trimEnd();
    const text2 = text.substring(splitIndex).trimStart();

    const part1 = {
      ...segment,
      end: splitTime,
      text: text1,
      id: segment.id + "_1",
    };
    const part2 = {
      ...segment,
      start: splitTime,
      text: text2,
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
