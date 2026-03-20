import { useState, useEffect, useCallback } from "react";
import { useTaskContext } from "../context/taskContext";
import type { TranscribeResult } from "../types/transcriber";
import type { ElectronFile } from "../types/electron";
import {
  selectTaskById,
} from "./tasks/taskSelectors";
import {
  restoreStoredTranscriberFile,
  restoreStoredTranscriberResult,
  useTranscriberPersistence,
} from "./transcriber/useTranscriberPersistence";
import { useTranscriberNavigation } from "./transcriber/useTranscriberNavigation";
import { useTranscriberCommands } from "./transcriber/useTranscriberCommands";
import { useTranscriberTaskSync } from "./transcriber/useTranscriberTaskSync";
import { useTranscriberFileActions } from "./transcriber/useTranscriberFileActions";

export function useTranscriber() {
  const { tasks } = useTaskContext();

  // Settings
  const [model, setModel] = useState(
    () => localStorage.getItem("transcriber_model") || "base",
  );
  const [device, setDevice] = useState(
    () => localStorage.getItem("transcriber_device") || "cpu",
  );

  const [isUploading, setIsUploading] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(() =>
    localStorage.getItem("transcriber_activeTaskId"),
  );

  // Persistence
  const [result, setResult] = useState<TranscribeResult | null>(
    restoreStoredTranscriberResult,
  );
  const [file, setFile] = useState<ElectronFile | null>(
    restoreStoredTranscriberFile,
  );

  useTranscriberPersistence({
    model,
    device,
    activeTaskId,
    result,
    file,
  });

  useTranscriberNavigation({ setFile, setResult });
  const { connected } = useTaskContext(); // Get connected state
  useTranscriberTaskSync({
    tasks,
    connected,
    activeTaskId,
    filePath: file?.path,
    setActiveTaskId,
    setResult,
  });
  const fileActions = useTranscriberFileActions({
    file,
    setFile,
    setResult,
  });
  const commands = useTranscriberCommands({
    file,
    model,
    device,
    result,
    setResult,
    setActiveTaskId,
    setIsUploading,
  });

  return {
    state: {
      file,
      model,
      device,
      isUploading,
      activeTaskId,
      result,
      activeTask: selectTaskById(tasks, activeTaskId),
    },
    actions: {
      setFile: fileActions.setFile,
      setModel,
      setDevice,
      startTranscription: commands.startTranscription,
      sendToTranslator: commands.sendToTranslator,
      sendToEditor: commands.sendToEditor,
      onFileDrop: fileActions.onFileDrop,
      onFileSelect: fileActions.onFileSelect,
    },
  };
}
