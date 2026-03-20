import { useEffect } from "react";

interface EditorShortcutsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  selectedIds: string[];
  activeSegmentId: string | null;
  undo: () => void;
  redo: () => void;
  deleteSegments: (ids: string[]) => void;
  splitSegment: (currentTime: number) => void;
  onSave?: () => void; // Ctrl+S
  onToggleFindReplace?: (mode: "find" | "replace") => void; // Ctrl+F, Ctrl+H
}

export function useEditorShortcuts({
  videoRef,
  selectedIds,
  activeSegmentId,
  undo,
  redo,
  deleteSegments,
  splitSegment,
  onSave,
  onToggleFindReplace,
}: EditorShortcutsProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if input/textarea is focused, UNLESS it's Ctrl+Z/Y
      const isInput = ["INPUT", "TEXTAREA"].includes(
        (e.target as HTMLElement).tagName,
      );

      if (e.ctrlKey || e.metaKey) {
        // Ctrl+S: Save
        if (e.key === "s" && onSave) {
          e.preventDefault();
          onSave();
          return;
        }
        // Ctrl+F: Toggle Find & Replace in Find Mode
        if (e.key === "f" && onToggleFindReplace) {
          e.preventDefault();
          onToggleFindReplace("find");
          return;
        }
        // Ctrl+H: Toggle Find & Replace in Replace Mode
        if (e.key === "h" && onToggleFindReplace) {
          e.preventDefault();
          onToggleFindReplace("replace");
          return;
        }
        if (e.code === "KeyZ") {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
          return;
        }
        if (e.code === "KeyY") {
          // Ctrl+Y Redo
          e.preventDefault();
          redo();
          return;
        }
      }

      if (isInput) return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          if (videoRef.current) {
            if (videoRef.current.paused) {
              void videoRef.current.play();
            } else {
              videoRef.current.pause();
            }
          }
          break;
        case "Delete":
          if (selectedIds.length > 0) {
            deleteSegments(
              selectedIds.length > 0
                ? selectedIds
                : activeSegmentId
                  ? [activeSegmentId]
                  : [],
            );
          } else if (activeSegmentId) {
            deleteSegments([activeSegmentId]);
          }
          break;
        case "KeyX": // Split shortcut
          if (activeSegmentId && videoRef.current) {
            splitSegment(videoRef.current.currentTime);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedIds,
    activeSegmentId,
    undo,
    redo,
    deleteSegments,
    splitSegment,
    videoRef,
    onSave,
    onToggleFindReplace,
  ]);
}
