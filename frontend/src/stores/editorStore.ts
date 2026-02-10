import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SubtitleSegment } from "../types/task";
import { getBestSplitIndex } from "../utils/textSplitter";

interface EditorState {
  // --- Data ---
  regions: SubtitleSegment[];
  activeSegmentId: string | null;
  selectedIds: string[];

  // File References
  mediaUrl: string | null;
  currentFilePath: string | null;

  // Undo/Redo Stacks
  past: SubtitleSegment[][];
  future: SubtitleSegment[][];

  // --- Actions ---
  setRegions: (regions: SubtitleSegment[]) => void;
  setActiveSegmentId: (id: string | null) => void;
  setSelectedIds: (ids: string[]) => void;

  setMediaUrl: (url: string | null) => void;
  setCurrentFilePath: (path: string | null) => void;

  // History Actions
  undo: () => void;
  redo: () => void;
  snapshot: () => void; // Manually push to history

  // Complex Actions
  deleteSegments: (ids: string[]) => void;
  mergeSegments: (ids: string[]) => void;
  splitSegment: (currentTime: number, targetId?: string) => void;
  updateRegion: (id: string, updates: Partial<SubtitleSegment>) => void;
  updateRegionText: (id: string, text: string) => void;
  selectSegment: (id: string, multi: boolean, range: boolean) => void;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      regions: [],
      activeSegmentId: null,
      selectedIds: [],
      mediaUrl: null,
      currentFilePath: null,
      past: [],
      future: [],

      setRegions: (regions) => set({ regions }),
      setActiveSegmentId: (id) => set({ activeSegmentId: id }),
      setSelectedIds: (ids) => set({ selectedIds: ids }),
      setMediaUrl: (url) => set({ mediaUrl: url }),
      setCurrentFilePath: (path) => set({ currentFilePath: path }),

      // --- History ---
      snapshot: () => {
        set((state) => ({
          past: [...state.past, state.regions],
          future: [],
        }));
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
            return {
              regions: next,
              past: [...state.past, state.regions],
              future: newFuture,
            };
          }
          return {};
        });
      },

      // --- Complex Actions ---

      deleteSegments: (ids) => {
        if (ids.length === 0) return;
        get().snapshot();
        set((state) => {
          const newRegions = state.regions.filter(
            (r) => !ids.includes(String(r.id)),
          );
          const newSelected = state.selectedIds.filter(
            (id) => !ids.includes(id),
          );
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
        const selected = state.regions.filter((r) =>
          ids.includes(String(r.id)),
        );
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
          const filtered = state.regions.filter(
            (r) => !ids.includes(String(r.id)),
          );
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
    }),
    {
      name: "editor-storage",
      partialize: (state) => ({
        // Persist regions and selection provided they are serializable
        // We do NOT persist history stack to avoid quota issues and complexity
        regions: state.regions,
        activeSegmentId: state.activeSegmentId,
        selectedIds: state.selectedIds,
        mediaUrl: state.mediaUrl,
        currentFilePath: state.currentFilePath,
      }),
    },
  ),
);
