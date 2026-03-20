import { useCallback } from "react";

import type { ElectronFile } from "../../types/electron";

type OpenedElectronFile = {
  path: string;
  name: string;
  size: number;
};

type UseTranscriberFileActionsParams = {
  file: ElectronFile | null;
  setFile: (file: ElectronFile | null) => void;
  setResult: (value: null) => void;
};

export function useTranscriberFileActions({
  file,
  setFile,
  setResult,
}: UseTranscriberFileActionsParams) {
  const clearResultAndSetFile = useCallback(
    (nextFile: ElectronFile | null) => {
      if (nextFile !== file) {
        setResult(null);
        localStorage.removeItem("transcriber_result");
      }
      setFile(nextFile);
    },
    [file, setFile, setResult],
  );

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (
        droppedFile &&
        (droppedFile.type.startsWith("audio/") ||
          droppedFile.type.startsWith("video/") ||
          droppedFile.name.endsWith(".mkv"))
      ) {
        if (window.electronAPI?.getPathForFile) {
          try {
            const path = window.electronAPI.getPathForFile(droppedFile);
            Object.defineProperty(droppedFile, "path", { value: path });
          } catch (err) {
            console.warn("Failed to get path via electronAPI:", err);
          }
        }
        clearResultAndSetFile(droppedFile as ElectronFile);
      }
    },
    [clearResultAndSetFile],
  );

  const handleFileSelect = useCallback(async () => {
    if (window.electronAPI) {
      const fileData = (await window.electronAPI.openFile()) as OpenedElectronFile | null;
      if (fileData?.path) {
        clearResultAndSetFile({
          name: fileData.name,
          path: fileData.path,
          size: fileData.size,
          type: "video/mp4",
        } as ElectronFile);
      }
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*,video/*";
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        clearResultAndSetFile(files[0] as ElectronFile);
      }
    };
    input.click();
  }, [clearResultAndSetFile]);

  return {
    setFile: clearResultAndSetFile,
    onFileDrop: handleFileDrop,
    onFileSelect: handleFileSelect,
  };
}
