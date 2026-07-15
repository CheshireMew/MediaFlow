import { create } from "zustand";
import { createDataSlice } from "./slices/dataSlice";
import { createUISlice } from "./slices/uiSlice";
import { createHistorySlice } from "./slices/historySlice";
import {
  normalizeMediaReference,
} from "../services/ui/mediaReference";
import {
  readWorkspaceStateValue,
  subscribeWorkspaceStateInitialized,
  writeWorkspaceStateValue,
} from "../services/persistence/workspaceState";
import {
  createEditorDocument,
  createEmptyEditorDocument,
  type EditorDocument,
} from "./editorDocument";
import type { EditorState } from "./editorStoreTypes";

const EDITOR_STORE_KEY = "editor-storage";

interface EditorSnapshot {
  document: EditorDocument;
  activeSegmentId: string | null;
  selectedIds: string[];
}

function normalizeEditorSnapshot(
  payload: Partial<EditorSnapshot> | null | undefined,
): EditorSnapshot {
  const rawDocument = payload?.document;
  const emptyDocument = createEmptyEditorDocument();
  const video = normalizeMediaReference(rawDocument?.video);
  const subtitle = normalizeMediaReference(rawDocument?.subtitle);
  const revision =
    typeof rawDocument?.revision === "number" && rawDocument.revision >= 0
      ? rawDocument.revision
      : 0;
  const savedRevision =
    typeof rawDocument?.savedRevision === "number" &&
    rawDocument.savedRevision >= 0
      ? rawDocument.savedRevision
      : revision;
  const document = rawDocument
    ? {
        ...createEditorDocument(
          {
            video,
            subtitle,
            previewUrl:
              typeof rawDocument.previewUrl === "string"
                ? rawDocument.previewUrl
                : null,
            regions: Array.isArray(rawDocument.regions)
              ? rawDocument.regions
              : [],
            documentId:
              typeof rawDocument.documentId === "string"
                ? rawDocument.documentId
                : undefined,
          },
          revision,
        ),
        savedRevision,
      }
    : emptyDocument;

  return {
    document,
    activeSegmentId:
      typeof payload?.activeSegmentId === "string" ? payload.activeSegmentId : null,
    selectedIds: Array.isArray(payload?.selectedIds) ? payload.selectedIds : [],
  };
}

function readEditorSnapshot() {
  return normalizeEditorSnapshot(
    readWorkspaceStateValue<Partial<EditorSnapshot>>(EDITOR_STORE_KEY),
  );
}

let isHydratingEditorSnapshot = false;

function persistEditorSnapshot(state: EditorState) {
  if (isHydratingEditorSnapshot) {
    return;
  }

  if (
    state.document === lastPersistedDocument &&
    state.activeSegmentId === lastPersistedActiveSegmentId &&
    state.selectedIds === lastPersistedSelectedIds
  ) {
    return;
  }
  const snapshot = {
    document: state.document,
    activeSegmentId: state.activeSegmentId,
    selectedIds: state.selectedIds,
  } satisfies EditorSnapshot;
  lastPersistedDocument = state.document;
  lastPersistedActiveSegmentId = state.activeSegmentId;
  lastPersistedSelectedIds = state.selectedIds;
  writeWorkspaceStateValue(EDITOR_STORE_KEY, snapshot);
}

const initialEditorSnapshot = readEditorSnapshot();
let lastPersistedDocument = initialEditorSnapshot.document;
let lastPersistedActiveSegmentId = initialEditorSnapshot.activeSegmentId;
let lastPersistedSelectedIds = initialEditorSnapshot.selectedIds;

export const useEditorStore = create<EditorState>()((...a) => ({
  ...createDataSlice(...a),
  ...createUISlice(...a),
  ...createHistorySlice(...a),
  ...initialEditorSnapshot,
  revisionClock: Math.max(
    initialEditorSnapshot.document.revision,
    initialEditorSnapshot.document.savedRevision,
  ),
}));

useEditorStore.subscribe(persistEditorSnapshot);

subscribeWorkspaceStateInitialized(() => {
  const snapshot = readEditorSnapshot();
  isHydratingEditorSnapshot = true;
  useEditorStore.setState({
    ...snapshot,
    revisionClock: Math.max(
      snapshot.document.revision,
      snapshot.document.savedRevision,
    ),
    past: [],
    future: [],
  });
  lastPersistedDocument = snapshot.document;
  lastPersistedActiveSegmentId = snapshot.activeSegmentId;
  lastPersistedSelectedIds = snapshot.selectedIds;
  isHydratingEditorSnapshot = false;
});
