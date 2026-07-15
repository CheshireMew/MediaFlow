import type { MediaReference } from "../services/ui/mediaReference";
import type { SubtitleSegment } from "../types/task";
import type {
  EditorDocument,
  EditorDocumentSource,
} from "./editorDocument";

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

export interface UISlice {
  activeSegmentId: string | null;
  selectedIds: string[];
  setActiveSegmentId: (id: string | null) => void;
  setSelectedIds: (ids: string[]) => void;
  selectSegment: (id: string, multi?: boolean, range?: boolean) => void;
}

export type EditorState = DataSlice & UISlice & HistorySlice;
