import type { MediaReference } from "../services/ui/mediaReference";
import type { SubtitleSegment } from "../types/task";

export interface EditorDocument {
  documentId: string;
  video: MediaReference | null;
  subtitle: MediaReference | null;
  previewUrl: string | null;
  regions: SubtitleSegment[];
  revision: number;
  savedRevision: number;
}

export interface EditorDocumentSource {
  video: MediaReference | null;
  subtitle: MediaReference | null;
  previewUrl: string | null;
  regions: SubtitleSegment[];
  documentId?: string;
}

export function createEditorDocumentId(
  video: MediaReference | null,
  subtitle: MediaReference | null,
  previewUrl: string | null = null,
) {
  const videoIdentity = video?.media_id || video?.path || previewUrl || "untitled";
  const subtitleIdentity = subtitle?.media_id || subtitle?.path || "unsaved";
  return `editor:${videoIdentity}::${subtitleIdentity}`;
}

export function createEditorDocument(
  source: EditorDocumentSource,
  revision = 0,
): EditorDocument {
  return {
    documentId:
      source.documentId ??
      createEditorDocumentId(source.video, source.subtitle, source.previewUrl),
    video: source.video,
    subtitle: source.subtitle,
    previewUrl: source.previewUrl,
    regions: source.regions,
    revision,
    savedRevision: revision,
  };
}

export function createEmptyEditorDocument(): EditorDocument {
  return createEditorDocument({
    video: null,
    subtitle: null,
    previewUrl: null,
    regions: [],
  });
}

export function isEditorDocumentDirty(document: EditorDocument) {
  return document.revision !== document.savedRevision;
}
