import { useCallback } from "react";

import { isDesktopRuntime } from "../../services/domain";
import type { ElectronFile } from "../../types/electron";
import { fileService } from "../../services/fileService";
import { normalizeMediaReference, toElectronFile } from "../../services/ui/mediaReference";
import { attachElectronFileSource } from "../../services/ui/electronFileSource";
import {
  buildHtmlFileAccept,
  fileMatchesOpenDialogProfile,
} from "../../contracts/openFileContract";

type OpenedElectronFile = {
  path: string;
  name: string;
  size: number;
};

type UseTranscriberFileActionsParams = {
  file: ElectronFile | null;
  setFile: (file: ElectronFile | null) => void;
  setResult: (value: null) => void;
  setActiveTaskId: (taskId: string | null) => void;
};

export function useTranscriberFileActions({
  file,
  setFile,
  setResult,
  setActiveTaskId,
}: UseTranscriberFileActionsParams) {
  const fileProfile = "transcriber-media" as const;

  const clearResultAndSetFile = useCallback(
    (nextFile: ElectronFile | null) => {
      if (nextFile?.path !== file?.path) {
        setResult(null);
        setActiveTaskId(null);
      }
      setFile(nextFile);
    },
    [file?.path, setActiveTaskId, setFile, setResult],
  );

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile && fileMatchesOpenDialogProfile(droppedFile, fileProfile)) {
        if (isDesktopRuntime()) {
          try {
            const path = fileService.getPathForFile(droppedFile);
            Object.defineProperty(droppedFile, "path", { value: path });
          } catch (err) {
            console.warn("Failed to get path via electronAPI:", err);
          }
        }
        clearResultAndSetFile(
          attachElectronFileSource(droppedFile as ElectronFile, "file-drop"),
        );
      }
    },
    [clearResultAndSetFile],
  );

  const handleFileSelect = useCallback(async () => {
    if (isDesktopRuntime()) {
      const fileData = (await fileService.openFile({
        profile: fileProfile,
      })) as OpenedElectronFile | null;
      if (fileData?.path) {
        clearResultAndSetFile(
          attachElectronFileSource(
            toElectronFile(
              normalizeMediaReference(fileData, { type: "video/mp4" })!,
            ),
            "file-selection",
          ),
        );
      }
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = buildHtmlFileAccept(fileProfile);
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      const nextFile = files?.[0];
      if (nextFile && fileMatchesOpenDialogProfile(nextFile, fileProfile)) {
        clearResultAndSetFile(
          attachElectronFileSource(nextFile as ElectronFile, "file-selection"),
        );
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
