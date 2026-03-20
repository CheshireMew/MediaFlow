import { useCallback, useState } from "react";

type FindReplaceMode = "find" | "replace";

type FindReplaceState = {
  isOpen: boolean;
  mode: FindReplaceMode;
};

export function getSelectedTextForFindReplace(doc: Document = document): string {
  const activeElement = doc.activeElement;

  if (
    activeElement instanceof HTMLTextAreaElement ||
    (
      activeElement instanceof HTMLInputElement &&
      ["text", "search", "url", "tel", "password"].includes(activeElement.type)
    )
  ) {
    const start = activeElement.selectionStart ?? 0;
    const end = activeElement.selectionEnd ?? start;
    const selectedText = activeElement.value.slice(start, end);
    return selectedText.trim().length > 0 ? selectedText : "";
  }

  const selection = doc.defaultView?.getSelection?.();
  const selectedText = selection?.toString() ?? "";
  return selectedText.trim().length > 0 ? selectedText : "";
}

export function useEditorFindReplace() {
  const [showFindReplace, setShowFindReplace] = useState<FindReplaceState>({
    isOpen: false,
    mode: "find",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [matchCase, setMatchCase] = useState(false);

  const handleCloseFindReplace = useCallback(() => {
    setShowFindReplace((prev) => ({ ...prev, isOpen: false }));
    setSearchTerm("");
    setMatchCase(false);
  }, []);

  const handleToggleFindReplace = useCallback((mode: FindReplaceMode) => {
    const selectedText = getSelectedTextForFindReplace();

    setShowFindReplace((prev) => {
      const isOpening = !prev.isOpen;
      if (isOpening && selectedText) {
        setSearchTerm(selectedText);
      }

      return {
        isOpen: !prev.isOpen,
        mode: isOpening ? mode : prev.mode,
      };
    });
  }, []);

  return {
    showFindReplace,
    searchTerm,
    setSearchTerm,
    matchCase,
    setMatchCase,
    handleCloseFindReplace,
    handleToggleFindReplace,
  };
}
