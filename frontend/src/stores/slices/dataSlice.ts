import type { StateCreator } from "zustand";
import type { SubtitleSegment } from "../../types/task";
import type { MediaReference } from "../../services/ui/mediaReference";
import { splitSubtitleSegment } from "../../utils/subtitleSplit";
import type { EditorState } from "../editorStore";
import {
  createEditorDocument,
  createEditorDocumentId,
  createEmptyEditorDocument,
  type EditorDocument,
  type EditorDocumentSource,
} from "../editorDocument";

export interface DataSlice {
  document: EditorDocument;
  revisionClock: number;

  replaceRegionsWithUndo: (regions: SubtitleSegment[]) => void;
  replaceEditorDocument: (
    source: EditorDocumentSource,
    options?: { preserveSelection?: boolean },
  ) => void;
  setDocumentPreviewUrl: (url: string | null) => void;
  markDocumentSaved: (subtitle: MediaReference) => void;

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

const TEXT_EDIT_COALESCE_MS = 750;
let lastTextEdit: { segmentId: string; timestamp: number } | null = null;

function withChangedRegions(
  state: EditorState,
  regions: SubtitleSegment[],
) {
  const revision = state.revisionClock + 1;
  return {
    document: {
      ...state.document,
      regions,
      revision,
    },
    revisionClock: revision,
  };
}

export const createDataSlice: StateCreator<EditorState, [], [], DataSlice> = (
  set,
  get,
) => ({
  document: createEmptyEditorDocument(),
  revisionClock: 0,

  replaceRegionsWithUndo: (regions) => {
    get().snapshot();
    set((state) => withChangedRegions(state, regions));
  },
  replaceEditorDocument: (source, options = {}) => {
    lastTextEdit = null;
    set((state) => {
      const revision = state.revisionClock + 1;
      const document = createEditorDocument(source, revision);
      const regions = document.regions;
      const regionIds = new Set(regions.map((region) => String(region.id)));
      const selectedIds = options.preserveSelection
        ? state.selectedIds.filter((id) => regionIds.has(id))
        : [];
      const activeSegmentId =
        options.preserveSelection &&
        state.activeSegmentId &&
        regionIds.has(state.activeSegmentId)
          ? state.activeSegmentId
          : (selectedIds[0] ?? null);

      return {
        document,
        revisionClock: revision,
        activeSegmentId,
        selectedIds,
        past: [],
        future: [],
      };
    });
  },
  setDocumentPreviewUrl: (previewUrl) =>
    set((state) => ({
      document: { ...state.document, previewUrl },
    })),
  markDocumentSaved: (subtitle) =>
    set((state) => ({
      document: {
        ...state.document,
        documentId: createEditorDocumentId(
          state.document.video,
          subtitle,
          state.document.previewUrl,
        ),
        subtitle,
        savedRevision: state.document.revision,
      },
    })),

  deleteSegments: (ids) => {
    if (ids.length === 0) return;
    get().snapshot();
    set((state) => {
      const newRegions = state.document.regions.filter(
        (r) => !ids.includes(String(r.id)),
      );
      const newSelected = state.selectedIds.filter((id) => !ids.includes(id));
      const newActive =
        state.activeSegmentId && ids.includes(state.activeSegmentId)
          ? null
          : state.activeSegmentId;
      return {
        ...withChangedRegions(state, newRegions),
        selectedIds: newSelected,
        activeSegmentId: newActive,
      };
    });
  },

  mergeSegments: (ids) => {
    if (ids.length < 2) return;
    const state = get();
    const selected = state.document.regions.filter((r) => ids.includes(String(r.id)));
    if (selected.length < 2) return;

    // Continuity Check
    const indices = selected
      .map((s) => state.document.regions.findIndex((r) => r.id === s.id))
      .sort((a, b) => a - b);

    for (let i = 0; i < indices.length - 1; i++) {
      if (indices[i + 1] !== indices[i] + 1) {
        return;
      }
    }

    get().snapshot();

    // Perform Merge
    selected.sort((a, b) => a.start - b.start);
    const first = selected[0];
    const last = selected[selected.length - 1];
    const mergedText = selected.map((s) => s.text).join("");

    const newSegment = {
      ...first,
      end: last.end,
      text: mergedText,
    };

    set((state) => {
      const filtered = state.document.regions.filter((r) => !ids.includes(String(r.id)));
      const newRegions = [...filtered, newSegment].sort(
        (a, b) => a.start - b.start,
      );
      const newId = String(newSegment.id);
      return {
        ...withChangedRegions(state, newRegions),
        selectedIds: [newId],
        activeSegmentId: newId,
      };
    });
  },

  splitSegment: (currentTime, targetId) => {
    const state = get();
    const idToSplit = targetId || state.activeSegmentId;
    if (!idToSplit) return;

    const segment = state.document.regions.find((r) => r.id === idToSplit);
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
      const filtered = state.document.regions.filter((r) => r.id !== idToSplit);
      const newRegions = [...filtered, part1, part2].sort(
        (a, b) => a.start - b.start,
      );
      return {
        ...withChangedRegions(state, newRegions),
        activeSegmentId: String(part2.id),
        selectedIds: [String(part2.id)],
      };
    });
  },

  addSegment: (segment) => {
    get().snapshot();
    set((state) => {
      const newRegions = [...state.document.regions, segment].sort(
        (a, b) => a.start - b.start,
      );
      return {
        ...withChangedRegions(state, newRegions),
        activeSegmentId: String(segment.id),
        selectedIds: [String(segment.id)],
      };
    });
  },

  addSegments: (segments) => {
    if (segments.length === 0) return;
    get().snapshot();
    set((state) => {
      const newRegions = [...state.document.regions, ...segments].sort(
        (a, b) => a.start - b.start,
      );
      const newIds = segments.map((s) => String(s.id));
      return {
        ...withChangedRegions(state, newRegions),
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
      const newRegions = state.document.regions.map((r) => {
        const update = updateMap.get(String(r.id));
        return update ? { ...r, ...update } : r;
      });
      return withChangedRegions(state, newRegions);
    });
  },

  updateRegion: (id, updates) => {
    set((state) => withChangedRegions(
      state,
      state.document.regions.map((r) =>
        String(r.id) === String(id) ? { ...r, ...updates } : r,
      ),
    ));
  },

  updateRegionText: (id, text) => {
    const state = get();
    const target = state.document.regions.find((r) => String(r.id) === String(id));
    if (target && target.text !== text) {
      const now = Date.now();
      if (
        !lastTextEdit ||
        lastTextEdit.segmentId !== String(id) ||
        now - lastTextEdit.timestamp > TEXT_EDIT_COALESCE_MS
      ) {
        state.snapshot();
      }
      lastTextEdit = { segmentId: String(id), timestamp: now };
      set((currentState) => withChangedRegions(
        currentState,
        currentState.document.regions.map((r) =>
          String(r.id) === String(id) ? { ...r, text } : r,
        ),
      ));
    }
  },
});
