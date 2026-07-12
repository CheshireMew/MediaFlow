import { useEditorStore } from "../../stores/editorStore";

export function useEditorDocumentWriters() {
  return {
    replaceEditorDocument: useEditorStore((state) => state.replaceEditorDocument),
    setDocumentPreviewUrl: useEditorStore((state) => state.setDocumentPreviewUrl),
    markDocumentSaved: useEditorStore((state) => state.markDocumentSaved),
  };
}
