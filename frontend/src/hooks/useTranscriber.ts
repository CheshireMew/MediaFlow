import { useEffect, useState } from "react";
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
import {
  persistStoredAsrExecutionPreferences,
  restoreStoredAsrExecutionPreferences,
} from "../services/persistence/asrExecutionPreferences";
import { useTranscriberNavigation } from "./transcriber/useTranscriberNavigation";
import { useTranscriberCommands } from "./transcriber/useTranscriberCommands";
import { useTranscriberTaskSync } from "./transcriber/useTranscriberTaskSync";
import { useTranscriberFileActions } from "./transcriber/useTranscriberFileActions";
import { desktopEventsService } from "../services/desktop";
import { isDesktopRuntime } from "../services/domain";
import { fileService } from "../services/fileService";
import {
  normalizeMediaReference,
  toElectronFile,
} from "../services/ui/mediaReference";
import { normalizeTranscribeResult } from "../services/ui/transcribeResult";
import { attachElectronFileSource } from "../services/ui/electronFileSource";
import { useExecutionModeState } from "./execution/useExecutionModeState";

export function useTranscriber() {
  const { tasks, tasksSettled } = useTaskContext();
  const { executionMode, setExecutionMode } = useExecutionModeState("transcriber");

  // Settings
  const [model, setModel] = useState(
    () => restoreStoredAsrExecutionPreferences().model,
  );
  const [device, setDevice] = useState(
    () => restoreStoredAsrExecutionPreferences().device,
  );
  const [engine, setEngine] = useState<"builtin" | "cli">(
    () => restoreStoredAsrExecutionPreferences().engine,
  );

  const [isUploading, setIsUploading] = useState(false);
  const [isSmartSplitting, setIsSmartSplitting] = useState(false);
  const [desktopProgress, setDesktopProgress] = useState<{
    progress: number;
    message: string;
    active: boolean;
  }>({
    progress: 0,
    message: "",
    active: false,
  });
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Persistence
  const [result, setResult] = useState<TranscribeResult | null>(
    restoreStoredTranscriberResult,
  );
  const [file, setFile] = useState<ElectronFile | null>(
    restoreStoredTranscriberFile,
  );

  useTranscriberPersistence({
    result,
    file,
  });

  useEffect(() => {
    persistStoredAsrExecutionPreferences({
      engine,
      model,
      device,
    });
  }, [device, engine, model]);

  useTranscriberNavigation({ setFile, setResult, setActiveTaskId });
  useTranscriberTaskSync({
    tasks,
    tasksSettled,
    activeTaskId,
    fileRef: normalizeMediaReference(file),
    filePath: file?.path,
    currentResult: result,
    setActiveTaskId,
    setResult,
    setExecutionMode,
  });
  const fileActions = useTranscriberFileActions({
    file,
    setFile,
    setResult,
    setActiveTaskId,
  });
  const {
    setFile: setResolvedFile,
    onFileDrop,
    onFileSelect,
  } = fileActions;
  const commands = useTranscriberCommands({
    file,
    engine,
    model,
    device,
    result,
    setResult: (nextResult) => setResult(normalizeTranscribeResult(nextResult, file)),
    setFile: setResolvedFile,
    setActiveTaskId,
    setDesktopProgress,
    setExecutionMode,
    setIsUploading,
    setIsSmartSplitting,
  });

  useEffect(() => {
    if (!file?.path || !isDesktopRuntime()) {
      return;
    }

    let cancelled = false;

    void fileService.resolveExistingPath(file.path, file.name, file.size).then((resolvedPath) => {
      if (!resolvedPath || resolvedPath === file.path || cancelled) {
        return;
      }

      setResolvedFile(
        attachElectronFileSource(
          toElectronFile(
            normalizeMediaReference({ ...file, path: resolvedPath }) ??
              normalizeMediaReference(file)!,
          ),
          file.__mediaflow_source ?? "unknown",
        ),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [file, setResolvedFile]);

  useEffect(() => {
    const unsubscribe = desktopEventsService.onTranscribeProgress(({ progress, message }) => {
      setDesktopProgress({
        progress,
        message,
        active: true,
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    state: {
      file,
      engine,
      model,
      device,
      isUploading,
      isSmartSplitting,
      desktopProgress,
      executionMode,
      activeTaskId,
      result,
      activeTask: selectTaskById(tasks, activeTaskId),
    },
    actions: {
      setFile: setResolvedFile,
      setEngine,
      setModel,
      setDevice,
      startTranscription: commands.startTranscription,
      smartSplitSegments: commands.smartSplitSegments,
      sendToTranslator: commands.sendToTranslator,
      sendToEditor: commands.sendToEditor,
      onFileDrop,
      onFileSelect,
    },
  };
}
