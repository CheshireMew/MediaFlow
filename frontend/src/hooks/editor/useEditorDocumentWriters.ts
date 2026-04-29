import { useEditorStore } from "../../stores/editorStore";

export function useEditorDocumentWriters() {
  return {
    replaceEditorDocument: useEditorStore((state) => state.replaceEditorDocument),
    setMediaUrl: useEditorStore((state) => state.setMediaUrl),
    setCurrentFilePath: useEditorStore((state) => state.setCurrentFilePath),
    setCurrentSubtitlePath: useEditorStore((state) => state.setCurrentSubtitlePath),
    setCurrentFileRef: useEditorStore((state) => state.setCurrentFileRef),
    setCurrentSubtitleRef: useEditorStore((state) => state.setCurrentSubtitleRef),
  };
}

