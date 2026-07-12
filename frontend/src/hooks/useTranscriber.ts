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
  type AsrExecutionPreferences,
} from "../services/persistence/asrExecutionPreferences";
import { subscribeUiStateSettingsInitialized } from "../services/persistence/uiStateSettings";
import { useTranscriberNavigation } from "./transcriber/useTranscriberNavigation";
import { useTranscriberCommands } from "./transcriber/useTranscriberCommands";
import { useTranscriberTaskSync } from "./transcriber/useTranscriberTaskSync";
import { useTranscriberFileActions } from "./transcriber/useTranscriberFileActions";
import {
  normalizeMediaReference,
} from "../services/ui/mediaReference";
import { normalizeTranscribeResult } from "../services/ui/transcribeResult";
import { useExecutionModeState } from "./execution/useExecutionModeState";
import { prewarmFasterWhisperCliFromStoredPreferences } from "../services/asrCliPrewarm";

export function useTranscriber() {
  const { tasks, tasksSettled } = useTaskContext();
  const { executionMode, setExecutionMode } = useExecutionModeState("transcriber");

  // Settings
  const [model, setModelState] = useState(
    () => restoreStoredAsrExecutionPreferences().model,
  );
  const [device, setDeviceState] = useState(
    () => restoreStoredAsrExecutionPreferences().device,
  );
  const [engine, setEngineState] = useState<"builtin" | "cli">(
    () => restoreStoredAsrExecutionPreferences().engine,
  );

  const [isUploading, setIsUploading] = useState(false);
  const [isSmartSplitting, setIsSmartSplitting] = useState(false);
  const [currentTranscriptionTaskId, setCurrentTranscriptionTaskId] = useState<string | null>(null);

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
    return subscribeUiStateSettingsInitialized(() => {
      const preferences = restoreStoredAsrExecutionPreferences();
      setEngineState(preferences.engine);
      setModelState(preferences.model);
      setDeviceState(preferences.device);
    });
  }, []);

  const persistAsrPreferenceUpdate = (updates: Partial<AsrExecutionPreferences>) => {
    persistStoredAsrExecutionPreferences({
      ...restoreStoredAsrExecutionPreferences(),
      ...updates,
    });
  };

  const setEngine = (value: "builtin" | "cli") => {
    setEngineState(value);
    persistAsrPreferenceUpdate({ engine: value });
  };

  const setModel = (value: string) => {
    setModelState(value);
    persistAsrPreferenceUpdate({ model: value });
  };

  const setDevice = (value: string) => {
    setDeviceState(value);
    persistAsrPreferenceUpdate({ device: value });
  };

  useEffect(() => {
    if (engine !== "cli") {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      prewarmFasterWhisperCliFromStoredPreferences();
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [device, engine, model]);

  useTranscriberNavigation({ setFile, setResult, setCurrentTranscriptionTaskId });
  useTranscriberTaskSync({
    tasks,
    tasksSettled,
    currentTranscriptionTaskId,
    fileRef: normalizeMediaReference(file),
    currentResult: result,
    setCurrentTranscriptionTaskId,
    setResult,
    setExecutionMode,
  });
  const fileActions = useTranscriberFileActions({
    file,
    setFile,
    setResult,
    setCurrentTranscriptionTaskId,
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
    setCurrentTranscriptionTaskId,
    setExecutionMode,
    setIsUploading,
    setIsSmartSplitting,
  });

  return {
    state: {
      file,
      engine,
      model,
      device,
      isUploading,
      isSmartSplitting,
      executionMode,
      currentTranscriptionTaskId,
      result,
      currentTranscriptionTask: selectTaskById(tasks, currentTranscriptionTaskId),
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
